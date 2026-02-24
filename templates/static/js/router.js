const router = {
    routes: {
        'files': { title: '📁 Disk', render: renderFileList },
        'preview': { title: '👁️ 预览', render: renderPreview },
        'shares': { title: '📤 我的分享', render: renderShares }
    },

    currentPath: '',
    currentView: 'files',

    init() {
        window.addEventListener('popstate', () => this.handleRoute());
        document.getElementById('sharesBtn')?.addEventListener('click', () => this.navigate('shares'));
        this.handleRoute();
    },

    navigate(view, params = {}) {
        const url = this.buildUrl(view, params);
        history.pushState({ view, params }, '', url);
        this.handleRoute();
    },

    buildUrl(view, params) {
        if (view === 'files') {
            return params.path ? `/?path=${encodeURIComponent(params.path)}` : '/';
        }
        if (view === 'preview') {
            return `/preview/${encodeURIComponent(params.filename)}?path=${encodeURIComponent(params.path || '')}`;
        }
        if (view === 'shares') {
            return '/shares';
        }
        return '/';
    },

    handleRoute() {
        const path = window.location.pathname;
        const params = new URLSearchParams(window.location.search);

        let view = 'files';
        let viewParams = {};

        if (path === '/shares') {
            view = 'shares';
        } else if (path.startsWith('/preview/')) {
            view = 'preview';
            viewParams = {
                filename: decodeURIComponent(path.replace('/preview/', '')),
                path: params.get('path') || ''
            };
        } else {
            view = 'files';
            viewParams = { path: params.get('path') || '' };
        }

        this.currentView = view;
        this.currentPath = viewParams.path || '';

        const route = this.routes[view];
        if (route) {
            document.getElementById('pageTitle').textContent = route.title;
            this.updateTopBar(view, viewParams);
            route.render(viewParams);
        }
    },

    updateTopBar(view, params) {
        const topBar = document.getElementById('topBarActions');

        if (view === 'shares') {
            // 分享页面：显示返回按钮
            topBar.innerHTML = `
                <button class="top-bar-btn" onclick="router.navigate('files')" title="返回文件">📁</button>
                <button id="themeToggle" class="top-bar-btn" onclick="toggleTheme()">🌙</button>
            `;
        } else if (view === 'preview') {
            // 预览页面：显示返回按钮
            topBar.innerHTML = `
                <button class="top-bar-btn" onclick="router.navigate('files', {path: '${params.path}'})" title="返回">✕</button>
                <button id="themeToggle" class="top-bar-btn" onclick="toggleTheme()">🌙</button>
            `;
        } else {
            // 文件列表：显示分享按钮
            topBar.innerHTML = `
                <button id="sharesBtn" class="top-bar-btn" onclick="router.navigate('shares')" title="我的分享">📤</button>
                <button id="themeToggle" class="top-bar-btn" onclick="toggleTheme()">🌙</button>
            `;
        }
    }
};

// 渲染文件列表
async function renderFileList(params) {
    const container = document.getElementById('contentContainer');
    const currentPath = params.path || '';

    try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(currentPath)}`);
        const data = await res.json();

        if (!data.success) {
            showMsg(data.message, 'error');
            return;
        }

        const files = data.files;
        const parentPath = currentPath.split('/').slice(0, -1).join('/');

        let html = `
            <div class="card file-card">
                <div class="breadcrumb">
                    <a href="#" data-path="">📁 根目录</a>
                    ${renderBreadcrumb(currentPath)}
                </div>
                <div class="toolbar">
                    ${currentPath ? `<button class="btn btn-secondary" data-parent="${parentPath}">⬆️ 返回上级</button>` : ''}
                    <div class="toolbar-spacer"></div>
                    <button id="sortToggle" class="btn btn-secondary" onclick="toggleSort()">📂 文件夹优先</button>
                    <button onclick="showMkdirModal()" class="btn btn-secondary">📁 新建文件夹</button>
                    <button onclick="showUploadModal()" class="btn btn-primary">📤 上传文件</button>
                </div>
        `;

        if (files.length) {
            html += '<div class="file-list">';
            files.forEach(file => {
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(file.ext);
                const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(file.ext);
                const isPreviewable = isImage || isVideo;
                const itemPath = currentPath ? `${currentPath}/${file.name}` : file.name;

                html += `
                    <div class="file-item ${file.is_dir ? 'folder-item' : ''} ${isPreviewable ? 'previewable-item' : ''}"
                         data-name="${file.name}" data-is-dir="${file.is_dir}" data-time="${file.mtime}" data-size="${file.size}">
                        <div class="file-info" onclick="handleFileClick('${file.name}', ${file.is_dir}, ${isPreviewable}, '${currentPath}')">
                            <span class="file-icon">${file.is_dir ? '📁' : isImage ? '🖼️' : isVideo ? '🎬' : '📄'}</span>
                            <div class="file-details">
                                <span class="file-name">${file.name}</span>
                                <span class="file-meta">${file.is_dir ? '' : file.size + ' · '}${file.modified}</span>
                            </div>
                        </div>
                        <div class="file-actions">
                            <button onclick="event.stopPropagation(); showRenameModal('${file.name}')" class="btn btn-small btn-secondary">✏️</button>
                            <button onclick="event.stopPropagation(); showShareModal('${file.name}')" class="btn btn-small btn-success">🔗</button>
                            ${isPreviewable ? `<button onclick="event.stopPropagation(); router.navigate('preview', {filename: '${file.name}', path: '${currentPath}'})" class="btn btn-small btn-success">👁️</button>` : ''}
                            ${!file.is_dir ? `<button onclick="event.stopPropagation(); downloadFile('${file.name}', '${currentPath}')" class="btn btn-small btn-primary">⬇️</button>` : ''}
                            <button onclick="event.stopPropagation(); deleteFile('${file.name}', '${currentPath}')" class="btn btn-small btn-danger">🗑️</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += `
                <div class="empty">
                    <div class="empty-icon">📂</div>
                    <p>暂无文件</p>
                    <button onclick="showUploadModal()" class="btn btn-primary">上传文件</button>
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;

        // 绑定事件
        bindFileListEvents(currentPath);
        initFileSort();

    } catch (err) {
        showMsg('加载失败: ' + err.message, 'error');
    }
}

// 渲染面包屑
function renderBreadcrumb(path) {
    if (!path) return '';
    const parts = path.split('/').filter(p => p);
    let accum = '';
    let html = '';
    parts.forEach((part, i) => {
        accum = accum ? `${accum}/${part}` : part;
        html += `<span class="sep">/</span><a href="#" data-path="${accum}">${part}</a>`;
    });
    return html;
}

// 绑定文件列表事件
function bindFileListEvents(currentPath) {
    document.querySelectorAll('.breadcrumb a[data-path]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            router.navigate('files', { path: a.dataset.path });
        });
    });

    document.querySelectorAll('.toolbar .btn[data-parent]').forEach(btn => {
        btn.addEventListener('click', () => {
            router.navigate('files', { path: btn.dataset.parent });
        });
    });

    document.getElementById('mkdirPath').value = currentPath;
    document.getElementById('uploadPath').value = currentPath;
    document.getElementById('renamePath').value = currentPath;
    document.getElementById('sharePath').value = currentPath;
}

// 处理文件点击
function handleFileClick(name, isDir, isPreviewable, path) {
    if (isDir) {
        const newPath = path ? `${path}/${name}` : name;
        router.navigate('files', { path: newPath });
    } else if (isPreviewable) {
        router.navigate('preview', { filename: name, path });
    }
}

// 下载文件
function downloadFile(filename, path) {
    window.location.href = `/download/${encodeURIComponent(filename)}?path=${encodeURIComponent(path)}`;
}

// 删除文件
async function deleteFile(filename, path) {
    if (!confirm(`确定要删除 ${filename} 吗？`)) return;
    try {
        const res = await fetch(`/delete/${encodeURIComponent(filename)}?path=${encodeURIComponent(path)}`);
        if (res.redirected) {
            showMsg('删除成功', 'success');
            renderFileList({ path });
        }
    } catch (err) {
        showMsg('删除失败', 'error');
    }
}

// 渲染预览页面
async function renderPreview(params) {
    const container = document.getElementById('contentContainer');
    const { filename, path } = params;

    const ext = filename.split('.').pop().toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext);
    const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext);

    let mediaHtml = '';
    if (isImage) {
        mediaHtml = `<img src="/raw/${encodeURIComponent(filename)}?path=${encodeURIComponent(path)}" alt="${filename}">`;
    } else if (isVideo) {
        mediaHtml = `
            <video controls autoplay>
                <source src="/raw/${encodeURIComponent(filename)}?path=${encodeURIComponent(path)}" type="video/${ext}">
                您的浏览器不支持视频播放
            </video>
        `;
    }

    container.innerHTML = `
        <div class="preview-wrapper">
            <div class="preview-main">
                <div class="preview-media">${mediaHtml}</div>
                <div class="preview-footer">
                    <div class="preview-filename">${filename}</div>
                    <div class="preview-actions">
                        <button onclick="downloadFile('${filename}', '${path}')" class="btn btn-primary">⬇️ 下载</button>
                        <button onclick="router.navigate('files', {path: '${path}'})" class="btn btn-secondary">返回列表</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 渲染分享页面
async function renderShares() {
    const container = document.getElementById('contentContainer');

    try {
        const res = await fetch('/api/shares');
        const data = await res.json();

        if (!data.success) {
            showMsg(data.message, 'error');
            return;
        }

        const shares = data.shares;

        let html = '<div class="card file-card">';

        if (shares.length) {
            html += '<div class="share-list">';
            shares.forEach(share => {
                html += `
                    <div class="share-item" data-code="${share.code}">
                        <div class="share-info">
                            <div class="share-icon">${share.is_dir ? '📁' : '📄'}</div>
                            <div class="share-details">
                                <div class="share-filename">${share.filename}</div>
                                <div class="share-meta">
                                    <span>📁 ${share.path || '根目录'}</span>
                                    <span>👁️ ${share.views} 次访问</span>
                                    <span>📅 ${share.created} 创建</span>
                                    <span>⏰ ${share.expire} 过期</span>
                                </div>
                            </div>
                        </div>
                        <div class="share-actions">
                            <button onclick="copyShareLink('${share.share_url}')" class="btn btn-small btn-primary">📋 复制</button>
                            <a href="${share.share_url}" target="_blank" class="btn btn-small btn-success">🔗 打开</a>
                            <button onclick="deleteShare('${share.code}')" class="btn btn-small btn-danger">🗑️ 删除</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += `
                <div class="empty">
                    <div class="empty-icon">📭</div>
                    <p>暂无分享</p>
                    <button onclick="router.navigate('files')" class="btn btn-primary">去分享文件</button>
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;

    } catch (err) {
        showMsg('加载失败: ' + err.message, 'error');
    }
}

// 初始化路由
addEventListener('DOMContentLoaded', () => router.init());
