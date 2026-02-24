import os
import shutil
import json
import secrets
import hashlib
import logging
import uuid
import time
from datetime import datetime
from functools import wraps
from flask import Flask, render_template, request, send_file, redirect, url_for, flash, session, jsonify, Response

app = Flask(__name__, static_folder='templates/static')
app.secret_key = secrets.token_hex(16)
app.config['PERMANENT_SESSION_LIFETIME'] = 86400 * 30
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024 * 1024  # 5GB

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
PASSWORD_FILE = os.path.join(BASE_DIR, 'password.json')
SHARE_FILE = os.path.join(BASE_DIR, 'shares.json')
LOG_FILE = os.path.join(BASE_DIR, 'app.log')
PORT = 7001

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler(LOG_FILE, encoding='utf-8'), logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# 常量定义
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'}
VIDEO_EXTS = {'.mp4', '.webm', '.ogg', '.mov', '.mkv'}


def hash_pwd(pwd):
    """SHA256哈希密码"""
    return hashlib.sha256(pwd.encode()).hexdigest()


def load_json(filepath, default=None):
    """加载JSON文件"""
    if not os.path.exists(filepath):
        return default if default is not None else {}
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(filepath, data):
    """保存JSON文件"""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_pwd():
    """加载密码"""
    return load_json(PASSWORD_FILE).get('password')


def save_pwd(pwd):
    """保存密码"""
    save_json(PASSWORD_FILE, {'password': hash_pwd(pwd)})


def check_pwd(pwd):
    """验证密码"""
    saved = load_pwd()
    return saved and saved == hash_pwd(pwd)


def load_shares():
    """加载分享记录"""
    return load_json(SHARE_FILE)


def save_shares(shares):
    """保存分享记录"""
    save_json(SHARE_FILE, shares)


def clean_expired_shares():
    """清理过期分享"""
    shares = load_shares()
    now = time.time()
    expired = [k for k, v in shares.items() if v.get('expire', 0) < now]
    if expired:
        for k in expired:
            del shares[k]
        save_shares(shares)


def get_share(code):
    """获取有效的分享记录"""
    shares = load_shares()
    share = shares.get(code)
    if not share or share.get('expire', 0) < time.time():
        return None
    return share


def validate_share_access(code, require_dir=False):
    """验证分享访问权限，返回分享记录或错误响应"""
    share = get_share(code)
    if not share:
        return None, ('分享链接不存在或已过期', 403)
    if require_dir and not share.get('is_dir'):
        return None, ('无权访问', 403)
    return share, None


def format_size(size):
    """格式化文件大小"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.2f} {unit}" if size != int(size) else f"{int(size)} {unit}"
        size /= 1024
    return f"{size:.2f} TB"


def get_file_info(filepath):
    """获取文件信息"""
    stat = os.stat(filepath)
    name = os.path.basename(filepath)
    ext = name.split('.')[-1].lower() if '.' in name else ''
    return {
        'name': name,
        'size': format_size(stat.st_size),
        'size_bytes': stat.st_size,
        'modified': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
        'is_dir': os.path.isdir(filepath),
        'ext': ext
    }


def get_files_in_path(path=''):
    """获取路径下的文件列表"""
    full_path = os.path.join(UPLOAD_FOLDER, path)
    if not os.path.exists(full_path):
        return []
    return [get_file_info(os.path.join(full_path, item)) for item in os.listdir(full_path)]


def get_file_type(filename):
    """获取文件类型"""
    ext = os.path.splitext(filename)[1].lower()
    if ext in IMAGE_EXTS:
        return 'image'
    if ext in VIDEO_EXTS:
        return 'video'
    return None


def is_safe_path(filepath, base_path=UPLOAD_FOLDER):
    """检查路径是否在安全范围内"""
    return os.path.abspath(filepath).startswith(os.path.abspath(base_path))


def get_parent_path(current_path):
    """获取上级目录"""
    if not current_path:
        return ''
    parts = current_path.rstrip('/').split('/')
    return '/'.join(parts[:-1]) if len(parts) > 1 else ''


def login_required(f):
    """登录验证装饰器"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get('logged_in'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return wrapper


@app.route('/')
@login_required
def index():
    """首页 - 文件列表"""
    current_path = request.args.get('path', '')
    full_path = os.path.join(UPLOAD_FOLDER, current_path)

    if not is_safe_path(full_path):
        flash('无效的路径', 'error')
        return redirect(url_for('index'))

    return render_template('index.html',
                         files=get_files_in_path(current_path),
                         current_path=current_path,
                         parent_path=get_parent_path(current_path))


@app.route('/login', methods=['GET', 'POST'])
def login():
    """登录页面"""
    if request.method != 'POST':
        return render_template('login.html', first=not load_pwd())

    pwd = request.form.get('password', '').strip()

    if not load_pwd():
        if len(pwd) < 4:
            flash('密码至少4位', 'error')
            return render_template('login.html', first=True)
        save_pwd(pwd)
        session.permanent = True
        session['logged_in'] = True
        logger.info('首次登录，密码已设置')
        return redirect(url_for('index'))

    if check_pwd(pwd):
        session.permanent = True
        session['logged_in'] = True
        logger.info('用户登录成功')
        return redirect(url_for('index'))

    logger.warning('登录失败：密码错误')
    flash('密码错误', 'error')
    return render_template('login.html', first=False)


@app.route('/upload', methods=['POST'])
@login_required
def upload():
    """上传文件"""
    current_path = request.form.get('path', '')
    files = request.files.getlist('files')
    uploaded = sum(1 for f in files if f.filename and _save_file(f, current_path))

    flash(f'成功上传 {uploaded} 个文件' if uploaded else '没有文件被上传',
          'success' if uploaded else 'warning')
    return redirect(url_for('index', path=current_path))


def _save_file(file, path):
    """保存单个文件"""
    filename = os.path.basename(file.filename)
    save_path = os.path.join(UPLOAD_FOLDER, path, filename)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    file.save(save_path)
    logger.info(f'上传文件: {filename}')
    return True


@app.route('/download/<path:filename>')
@login_required
def download(filename):
    """下载文件"""
    current_path = request.args.get('path', '')
    filepath = os.path.join(UPLOAD_FOLDER, current_path, filename)

    if not is_safe_path(filepath) or not os.path.isfile(filepath):
        flash('文件不存在', 'error')
        return redirect(url_for('index', path=current_path))

    logger.info(f'下载文件: {filename}')
    return send_file(filepath, as_attachment=True)


@app.route('/delete/<path:filename>')
@login_required
def delete(filename):
    """删除文件或文件夹"""
    current_path = request.args.get('path', '')
    filepath = os.path.join(UPLOAD_FOLDER, current_path, filename)

    if not is_safe_path(filepath) or not os.path.exists(filepath):
        flash('文件不存在', 'error')
        return redirect(url_for('index', path=current_path))

    try:
        shutil.rmtree(filepath) if os.path.isdir(filepath) else os.remove(filepath)
        flash(f'已删除: {filename}', 'success')
        logger.info(f'删除: {filename}')
    except Exception as e:
        flash(f'删除失败: {str(e)}', 'error')
        logger.error(f'删除失败: {filename} - {str(e)}')

    return redirect(url_for('index', path=current_path))


@app.route('/mkdir', methods=['POST'])
@login_required
def mkdir():
    """创建文件夹"""
    current_path = request.form.get('path', '')
    folder_name = request.form.get('folder_name', '').strip()

    if not folder_name:
        flash('文件夹名称不能为空', 'error')
        return redirect(url_for('index', path=current_path))

    new_folder = os.path.join(UPLOAD_FOLDER, current_path, os.path.basename(folder_name))

    if os.path.exists(new_folder):
        flash('文件夹已存在', 'error')
    else:
        os.makedirs(new_folder)
        flash(f'创建成功: {folder_name}', 'success')
        logger.info(f'创建文件夹: {folder_name}')

    return redirect(url_for('index', path=current_path))


@app.route('/rename', methods=['POST'])
@login_required
def rename():
    """重命名"""
    current_path = request.form.get('path', '')
    old_name = request.form.get('old_name', '').strip()
    new_name = request.form.get('new_name', '').strip()

    if not old_name or not new_name or old_name == new_name:
        flash('文件名无效', 'error') if not old_name or not new_name else None
        return redirect(url_for('index', path=current_path))

    old_path = os.path.join(UPLOAD_FOLDER, current_path, os.path.basename(old_name))
    new_path = os.path.join(UPLOAD_FOLDER, current_path, os.path.basename(new_name))

    if not is_safe_path(old_path) or not is_safe_path(new_path) or not os.path.exists(old_path):
        flash('文件不存在', 'error')
        return redirect(url_for('index', path=current_path))

    if os.path.exists(new_path):
        flash('目标文件名已存在', 'error')
        return redirect(url_for('index', path=current_path))

    try:
        os.rename(old_path, new_path)
        flash(f'重命名成功: {old_name} → {new_name}', 'success')
        logger.info(f'重命名: {old_name} → {new_name}')
    except Exception as e:
        flash(f'重命名失败: {str(e)}', 'error')
        logger.error(f'重命名失败: {old_name} → {new_name} - {str(e)}')

    return redirect(url_for('index', path=current_path))


@app.route('/preview/<path:filename>')
@login_required
def preview(filename):
    """预览页面 - SPA入口"""
    return render_template('index.html')


@app.route('/raw/<path:filename>')
def raw_file(filename):
    """获取原始文件"""
    current_path = request.args.get('path', '')
    share_code = request.args.get('share_code', '')

    # 验证访问权限
    if share_code:
        share = get_share(share_code)
        if not share or share.get('path') != current_path or share.get('filename') != filename:
            return '分享链接无效', 403
    elif not session.get('logged_in'):
        return '请先登录', 401

    filepath = os.path.join(UPLOAD_FOLDER, current_path, filename)
    if not is_safe_path(filepath) or not os.path.isfile(filepath):
        return '文件不存在', 404

    return send_file(filepath, as_attachment=False)


@app.route('/api/files')
@login_required
def api_files():
    """API: 获取文件列表"""
    current_path = request.args.get('path', '')
    full_path = os.path.join(UPLOAD_FOLDER, current_path)

    if not is_safe_path(full_path):
        return jsonify({'success': False, 'message': '无效的路径'})

    return jsonify({'success': True, 'files': get_files_in_path(current_path), 'path': current_path})


@app.route('/api/share', methods=['POST'])
@login_required
def create_share():
    """创建分享"""
    data = request.get_json()
    path = data.get('path', '')
    filename = data.get('filename', '')
    expire_days = data.get('expire_days', 7)

    if not filename:
        return jsonify({'success': False, 'message': '文件名不能为空'})

    clean_expired_shares()

    filepath = os.path.join(UPLOAD_FOLDER, path, filename)
    share_code = str(uuid.uuid4())[:8]

    shares = load_shares()
    shares[share_code] = {
        'path': path,
        'filename': filename,
        'is_dir': os.path.isdir(filepath),
        'created': time.time(),
        'expire': time.time() + expire_days * 86400,
        'views': 0
    }
    save_shares(shares)

    return jsonify({
        'success': True,
        'share_code': share_code,
        'share_url': url_for('access_share', code=share_code, _external=True),
        'expire_days': expire_days
    })


@app.route('/shares')
@login_required
def shares_page():
    """分享管理页面 - SPA入口"""
    return render_template('index.html')


@app.route('/api/shares')
@login_required
def api_shares():
    """API: 获取分享列表"""
    clean_expired_shares()
    shares = load_shares()

    share_list = []
    for code, share in shares.items():
        filepath = os.path.join(UPLOAD_FOLDER, share['path'], share['filename'])
        share_list.append({
            'code': code,
            'filename': share['filename'],
            'path': share['path'],
            'is_dir': share.get('is_dir', False),
            'views': share.get('views', 0),
            'created': datetime.fromtimestamp(share['created']).strftime('%Y-%m-%d %H:%M'),
            'expire': datetime.fromtimestamp(share['expire']).strftime('%Y-%m-%d %H:%M'),
            'share_url': url_for('access_share', code=code, _external=True),
            'exists': os.path.exists(filepath)
        })

    return jsonify({'success': True, 'shares': share_list})


@app.route('/api/share/<code>', methods=['DELETE'])
@login_required
def delete_share(code):
    """删除分享"""
    shares = load_shares()
    if code in shares:
        del shares[code]
        save_shares(shares)
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': '分享不存在'})


@app.route('/share/<code>')
def access_share(code):
    """访问分享链接 - SPA入口"""
    return render_template('share_spa.html')


@app.route('/api/share/<code>')
def api_share(code):
    """API: 获取分享内容"""
    shares = load_shares()
    share = shares.get(code)

    if not share:
        return jsonify({'success': False, 'message': '分享链接不存在或已过期'})

    if share.get('expire', 0) < time.time():
        del shares[code]
        save_shares(shares)
        return jsonify({'success': False, 'message': '分享链接已过期'})

    share['views'] = share.get('views', 0) + 1
    save_shares(shares)

    filepath = os.path.join(UPLOAD_FOLDER, share['path'], share['filename'])
    if not os.path.exists(filepath):
        return jsonify({'success': False, 'message': '文件不存在'})

    is_dir = os.path.isdir(filepath)
    sub_path = request.args.get('sub_path', '')

    if is_dir:
        current_path = os.path.join(share['path'], share['filename'], sub_path).strip('/')
        full_path = os.path.join(UPLOAD_FOLDER, current_path)

        if not is_safe_path(full_path) or not os.path.exists(full_path):
            return jsonify({'success': False, 'message': '路径不存在'})

        return jsonify({
            'success': True,
            'is_dir': True,
            'share': {
                'filename': share['filename'],
                'views': share['views']
            },
            'files': get_files_in_path(current_path),
            'share_code': code,
            'sub_path': sub_path,
            'parent_sub_path': get_parent_path(sub_path)
        })

    file_type = get_file_type(share['filename'])
    file_info = get_file_info(filepath)

    return jsonify({
        'success': True,
        'is_dir': False,
        'share': {
            'filename': share['filename'],
            'path': share['path'],
            'views': share['views']
        },
        'file_info': file_info,
        'file_type': file_type,
        'share_code': code
    })


@app.route('/share/raw/<code>')
def share_raw_file(code):
    """分享文件内容 - 支持根分享或子路径"""
    sub_path = request.args.get('sub_path', '')
    share, error = validate_share_access(code)
    if error:
        return error

    if sub_path and not share.get('is_dir'):
        return '无权访问', 403

    # 构建文件路径
    if share.get('is_dir'):
        # 文件夹分享：filepath = 文件夹路径 + sub_path
        base_path = os.path.join(UPLOAD_FOLDER, share['path'], share['filename'])
        filepath = os.path.join(base_path, sub_path) if sub_path else base_path
        if not is_safe_path(filepath, base_path) or not os.path.isfile(filepath):
            return '文件不存在', 404
    else:
        # 单个文件分享：filepath = 文件完整路径
        filepath = os.path.join(UPLOAD_FOLDER, share['path'], share['filename'])
        if not os.path.isfile(filepath):
            return '文件不存在', 404

    return send_file(filepath, as_attachment=False)


@app.route('/share/download/<code>')
def share_download(code):
    """下载分享文件 - 支持根分享或子路径"""
    sub_path = request.args.get('sub_path', '')
    share, error = validate_share_access(code)
    if error:
        return error

    if sub_path and not share.get('is_dir'):
        return '无权访问', 403

    # 构建文件路径
    if share.get('is_dir'):
        # 文件夹分享：filepath = 文件夹路径 + sub_path
        base_path = os.path.join(UPLOAD_FOLDER, share['path'], share['filename'])
        filepath = os.path.join(base_path, sub_path) if sub_path else base_path
        if not is_safe_path(filepath, base_path) or not os.path.isfile(filepath):
            return '文件不存在', 404
    else:
        # 单个文件分享：filepath = 文件完整路径
        filepath = os.path.join(UPLOAD_FOLDER, share['path'], share['filename'])
        if not os.path.isfile(filepath):
            return '文件不存在', 404

    return send_file(filepath, as_attachment=True)


@app.route('/api/share/<code>/preview')
def api_share_preview(code):
    """API: 获取分享文件夹内文件预览信息"""
    sub_path = request.args.get('sub_path', '')
    share, error = validate_share_access(code, require_dir=True)
    if error:
        return jsonify({'success': False, 'message': error[0]})

    filepath = os.path.join(UPLOAD_FOLDER, share['path'], share['filename'], sub_path)
    base_path = os.path.join(UPLOAD_FOLDER, share['path'], share['filename'])

    if not is_safe_path(filepath, base_path) or not os.path.isfile(filepath):
        return jsonify({'success': False, 'message': '文件不存在'})

    file_type = get_file_type(os.path.basename(filepath))
    if not file_type:
        return jsonify({'success': False, 'message': '不支持的文件类型'})

    return jsonify({
        'success': True,
        'file_info': get_file_info(filepath),
        'file_type': file_type
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=False)
