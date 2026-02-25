const $ = id => document.getElementById(id);

const formatSpeed = (bytesPerSecond) => {
    if (bytesPerSecond < 1024) return bytesPerSecond.toFixed(0) + ' B/s';
    if (bytesPerSecond < 1024 * 1024) return (bytesPerSecond / 1024).toFixed(1) + ' KB/s';
    return (bytesPerSecond / (1024 * 1024)).toFixed(2) + ' MB/s';
};

const showMsg = (text, type) => {
    const el = $('msg');
    if (!el) return;
    el.textContent = text;
    el.className = `msg ${type} show`;
    setTimeout(() => el.className = 'msg', 3000);
};

const toggleTheme = () => {
    const isDark = document.body.classList.toggle('dark');
    const btn = $('themeToggle');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
};

const BG_IMG_URL = '/static/1.webp';

const loadBackgroundImage = () => {
    if (!BG_IMG_URL.trim()) return;

    const img = new Image();
    img.onload = () => document.body.classList.add('bg-loaded');
    img.src = BG_IMG_URL;
};

const modal = {
    show: (id) => $(id)?.classList.add('active'),
    hide: (id) => $(id)?.classList.remove('active'),
    hideAll: () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'))
};

const showUploadModal = () => modal.show('uploadModal');
const hideUploadModal = () => modal.hide('uploadModal');

const showMkdirModal = () => {
    modal.show('mkdirModal');
    $('mkdirModal')?.querySelector('input')?.focus();
};
const hideMkdirModal = () => modal.hide('mkdirModal');

const showRenameModal = (oldName) => {
    $('renameOldName').value = oldName;
    $('renameNewName').value = oldName;
    modal.show('renameModal');
    $('renameNewName')?.select();
};
const hideRenameModal = () => modal.hide('renameModal');

const showShareModal = (filename) => {
    $('shareFilename').value = filename;
    $('shareFileDisplay').textContent = `分享文件: ${filename}`;
    $('shareForm').style.display = 'block';
    $('shareResult').classList.remove('show');
    $('createShareBtn').disabled = false;
    $('createShareBtn').textContent = '创建分享';
    modal.show('shareModal');
};
const hideShareModal = () => modal.hide('shareModal');

const setupFileUpload = () => {
    const dropZone = $('dropZone');
    const fileInput = $('fileInput');
    if (!dropZone || !fileInput) return;

    const updateUI = () => {
        const count = fileInput.files.length;
        $('selectedFiles').innerHTML = count ? `<div class="selected-file-list">已选择: ${Array.from(fileInput.files).map(f => f.name).join(', ')}</div>` : '';
        $('uploadSubmitBtn').textContent = count ? `上传 (${count} 个文件)` : '上传';
    };

    fileInput.addEventListener('change', updateUI);

    // 点击上传区域触发文件选择
    dropZone.addEventListener('click', (e) => {
        if (e.target !== fileInput) fileInput.click();
    });

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        fileInput.files = e.dataTransfer.files;
        updateUI();
    });
};

const copyShareUrl = async () => {
    const url = $('shareUrl').value;
    try {
        await navigator.clipboard.writeText(url);
        showMsg('链接已复制', 'success');
    } catch {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showMsg('链接已复制', 'success');
    }
};

const copyShareLink = async (url) => {
    try {
        await navigator.clipboard.writeText(url);
        showMsg('链接已复制', 'success');
    } catch {
        // 降级方案
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showMsg('链接已复制', 'success');
    }
};

const deleteShare = async (code) => {
    if (!confirm('确定要删除这个分享吗？')) return;

    try {
        const res = await fetch(`/api/share/${code}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
            document.querySelector(`[data-code="${code}"]`)?.remove();
            showMsg('分享已删除', 'success');
            if (!document.querySelectorAll('.share-item').length) location.reload();
        } else {
            throw new Error(data.message);
        }
    } catch (err) {
        showMsg('删除失败: ' + err.message, 'error');
    }
};

const SORT_MODES = ['folder-first', 'name', 'time', 'size'];
const SORT_LABELS = {
    'folder-first': '📂 文件夹优先',
    'name': '📋 名称排序',
    'time': '🕐 时间排序',
    'size': '📊 大小排序'
};

let currentSortMode = localStorage.getItem('fileSortMode') || 'folder-first';

const parseSize = (str) => {
    if (!str || str === '-') return 0;
    const units = { 'B': 1, 'K': 1024, 'M': 1024 ** 2, 'G': 1024 ** 3, 'T': 1024 ** 4 };
    const m = str.match(/([\d.]+)\s*([BKMGTP]?)B?/i);
    return m ? parseFloat(m[1]) * (units[m[2].toUpperCase()] || 1) : 0;
};

const sortFunctions = {
    'folder-first': (a, b) => a.dataset.isDir !== b.dataset.isDir
        ? (a.dataset.isDir === 'true' ? -1 : 1)
        : a.dataset.name.localeCompare(b.dataset.name, 'zh-CN'),
    'name': (a, b) => a.dataset.name.localeCompare(b.dataset.name, 'zh-CN'),
    'time': (a, b) => parseInt(b.dataset.time) - parseInt(a.dataset.time),
    'size': (a, b) => a.dataset.isDir !== b.dataset.isDir
        ? (a.dataset.isDir === 'true' ? 1 : -1)
        : parseSize(b.dataset.size) - parseSize(a.dataset.size)
};

const applySort = () => {
    const list = document.querySelector('.file-list');
    if (!list) return;
    const items = Array.from(list.querySelectorAll('.file-item'));
    items.sort(sortFunctions[currentSortMode]);
    items.forEach(item => list.appendChild(item));
};

const updateSortButton = () => {
    const btn = $('sortToggle');
    if (btn) btn.textContent = SORT_LABELS[currentSortMode];
};

const toggleSort = () => {
    currentSortMode = SORT_MODES[(SORT_MODES.indexOf(currentSortMode) + 1) % SORT_MODES.length];
    localStorage.setItem('fileSortMode', currentSortMode);
    applySort();
    updateSortButton();
};

const initFileSort = () => {
    document.querySelectorAll('.file-item').forEach(item => {
        const nameEl = item.querySelector('.file-name');
        const metaEl = item.querySelector('.file-meta');
        if (nameEl) item.dataset.name = nameEl.textContent.trim();
        if (metaEl) {
            const timeMatch = metaEl.textContent.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
            const sizeMatch = metaEl.textContent.match(/^([\d.]+\s*[BKMGTP]?B?)\s*·/);
            if (timeMatch) item.dataset.time = new Date(timeMatch[1]).getTime();
            if (sizeMatch) item.dataset.size = sizeMatch[1];
        }
        item.dataset.isDir = item.classList.contains('folder-item') ? 'true' : 'false';
    });
    applySort();
    updateSortButton();
};

const setupModalClose = () => {
    document.querySelectorAll('.modal').forEach(m => {
        m.addEventListener('click', (e) => e.target === m && m.classList.remove('active'));
    });
};

// 防止移动端双击缩放
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, { passive: false });

// 表单提交处理
const setupForms = () => {
    // 新建文件夹
    $('mkdirForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const path = $('mkdirPath').value;
        formData.append('path', path);

        try {
            const res = await fetch('/mkdir', { method: 'POST', body: formData });
            if (res.redirected || res.ok) {
                modal.hide('mkdirModal');
                showMsg('创建成功', 'success');
                e.target.reset();
                if (typeof renderFileList === 'function') renderFileList({ path });
            }
        } catch (err) {
            showMsg('创建失败', 'error');
        }
    });

    // 上传文件
    $('uploadForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const path = $('uploadPath').value;
        formData.append('path', path);

        const btn = $('uploadSubmitBtn');
        const progressDiv = $('uploadProgress');
        const progressFill = $('progressFill');
        const progressText = $('progressText');
        const speedText = $('speedText');

        btn.disabled = true;
        progressDiv.style.display = 'block';

        const xhr = new XMLHttpRequest();
        const startTime = Date.now();
        let lastLoaded = 0;

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                progressFill.style.width = percent + '%';
                progressText.textContent = percent + '%';

                const elapsed = (Date.now() - startTime) / 1000;
                const speed = elapsed > 0 ? (event.loaded - lastLoaded) / elapsed : 0;
                lastLoaded = event.loaded;

                if (speed > 0) {
                    speedText.textContent = formatSpeed(speed);
                }
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                modal.hide('uploadModal');
                showMsg('上传成功', 'success');
                e.target.reset();
                $('selectedFiles').innerHTML = '';
                progressDiv.style.display = 'none';
                progressFill.style.width = '0%';
                progressText.textContent = '0%';
                speedText.textContent = '';
                if (typeof renderFileList === 'function') renderFileList({ path });
            } else {
                showMsg('上传失败', 'error');
            }
            btn.disabled = false;
        });

        xhr.addEventListener('error', () => {
            showMsg('上传失败', 'error');
            btn.disabled = false;
            progressDiv.style.display = 'none';
        });

        xhr.open('POST', '/upload');
        xhr.send(formData);
    });

    // 重命名
    $('renameForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const path = $('renamePath').value;
        formData.append('path', path);
        formData.append('old_name', $('renameOldName').value);

        try {
            const res = await fetch('/rename', { method: 'POST', body: formData });
            if (res.redirected || res.ok) {
                modal.hide('renameModal');
                showMsg('重命名成功', 'success');
                e.target.reset();
                if (typeof renderFileList === 'function') renderFileList({ path });
            }
        } catch (err) {
            showMsg('重命名失败', 'error');
        }
    });

    // 创建分享
    $('shareForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('createShareBtn');
        btn.disabled = true;
        btn.textContent = '创建中...';

        try {
            const res = await fetch('/api/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: $('sharePath').value,
                    filename: $('shareFilename').value,
                    expire_days: parseInt($('shareExpire').value)
                })
            });
            const data = await res.json();

            if (data.success) {
                $('shareUrl').value = data.share_url;
                $('shareForm').style.display = 'none';
                $('shareResult').classList.add('show');
                showMsg('分享链接创建成功', 'success');
            } else {
                throw new Error(data.message);
            }
        } catch (err) {
            showMsg('创建失败: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = '创建分享';
        }
    });
};

// DOM加载完成后初始化
addEventListener('DOMContentLoaded', () => {
    // 主题
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark');
        const btn = $('themeToggle');
        if (btn) btn.textContent = '☀️';
    }
    $('themeToggle')?.addEventListener('click', toggleTheme);

    // 初始化
    setupModalClose();
    setupFileUpload();
    setupForms();
    loadBackgroundImage();
});
