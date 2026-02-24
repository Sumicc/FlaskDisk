const shareRouter = {
    shareCode: '',

    init() {
        this.shareCode = window.location.pathname.split('/')[2] || '';
        window.addEventListener('popstate', () => this.handleRoute());
        this.handleRoute();
    },

    navigate(subPath = '') {
        const url = subPath
            ? `/share/${this.shareCode}?sub_path=${encodeURIComponent(subPath)}`
            : `/share/${this.shareCode}`;
        history.pushState({ subPath }, '', url);
        this.handleRoute();
    },

    handleRoute() {
        const params = new URLSearchParams(window.location.search);
        const subPath = params.get('sub_path') || '';
        this.loadShareContent(subPath);
    },

    async loadShareContent(subPath = '') {
        const container = document.getElementById('shareContent');
        const url = subPath
            ? `/api/share/${this.shareCode}?sub_path=${encodeURIComponent(subPath)}`
            : `/api/share/${this.shareCode}`;

        try {
            const res = await fetch(url);
            const data = await res.json();

            if (!data.success) {
                container.innerHTML = `
                    <div class="card share-card">
                        <div class="alert error">${data.message}</div>
                        <div class="share-actions error-state">
                            <a href="/login" class="btn btn-primary">返回网盘</a>
                        </div>
                    </div>
                `;
                return;
            }

            if (data.is_dir) {
                this.renderFolder(data, subPath);
            } else {
                this.renderFile(data);
            }
        } catch (err) {
            container.innerHTML = `
                <div class="card share-card">
                    <div class="alert error">加载失败</div>
                </div>
            `;
        }
    },

    renderFile(data) {
        this.resetTopBar();
        const container = document.getElementById('shareContent');
        const { share, file_info, file_type, share_code } = data;

        let previewHtml = '';
        if (file_type === 'image') {
            previewHtml = `<img src="/share/raw/${share_code}" alt="${file_info.name}" class="preview-img">`;
        } else if (file_type === 'video') {
            const ext = file_info.name.split('.').pop().toLowerCase();
            previewHtml = `
                <video controls class="preview-video">
                    <source src="/share/raw/${share_code}" type="video/${ext}">
                    您的浏览器不支持视频播放
                </video>
            `;
        }

        container.innerHTML = `
            <div class="card share-card">
                <div class="share-header">
                    <div class="file-icon-large">${file_type === 'image' ? '🖼️' : file_type === 'video' ? '🎬' : '📄'}</div>
                    <h2 class="share-filename">${file_info.name}</h2>
                    <p class="share-meta">${file_info.size} · 访问次数: ${share.views}</p>
                </div>
                ${previewHtml ? `<div class="share-preview">${previewHtml}</div>` : ''}
                <div class="share-actions">
                    <a href="/share/download/${share_code}" class="btn btn-primary">⬇️ 下载文件</a>
                    <a href="/login" class="btn btn-secondary">访问网盘</a>
                </div>
            </div>
        `;
    },

    renderFolder(data, subPath) {
        this.resetTopBar();
        const container = document.getElementById('shareContent');
        const { share, files, share_code, parent_sub_path } = data;

        let html = `
            <div class="card file-card">
                <div class="share-folder-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="folder-icon">📁</span>
                        <div>
                            <h3 class="folder-title">${share.filename}</h3>
                            <p class="folder-meta">访问次数: ${share.views}</p>
                        </div>
                    </div>
                </div>
        `;

        // 面包屑
        html += `<div class="breadcrumb"><a href="#" data-path="">📁 ${share.filename}</a>`;
        if (subPath) {
            const parts = subPath.split('/').filter(p => p);
            let accum = '';
            parts.forEach(part => {
                accum = accum ? `${accum}/${part}` : part;
                html += `<span class="sep">/</span><a href="#" data-path="${accum}">${part}</a>`;
            });
        }
        html += '</div>';

        // 工具栏
        html += '<div class="toolbar">';
        if (subPath) {
            html += `<button class="btn btn-secondary" data-parent="${parent_sub_path || ''}">⬆️ 返回上级</button>`;
        }
        html += '</div>';

        // 文件列表
        if (files.length) {
            html += '<div class="file-list">';
            files.forEach(file => {
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(file.ext);
                const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(file.ext);
                const isPreviewable = isImage || isVideo;
                const itemSubPath = subPath ? `${subPath}/${file.name}` : file.name;

                html += `
                    <div class="file-item ${file.is_dir ? 'folder-item' : ''} ${isPreviewable ? 'previewable-item' : ''}">
                        <div class="file-info" onclick="shareRouter.handleItemClick('${file.name}', ${file.is_dir}, ${isPreviewable}, '${itemSubPath}')">
                            <span class="file-icon">${file.is_dir ? '📁' : isImage ? '🖼️' : isVideo ? '🎬' : '📄'}</span>
                            <div class="file-details">
                                <span class="file-name">${file.name}</span>
                                <span class="file-meta">${file.is_dir ? '' : file.size + ' · '}${file.modified}</span>
                            </div>
                        </div>
                        <div class="file-actions">
                            ${isPreviewable ? `<button onclick="event.stopPropagation(); shareRouter.previewFile('${itemSubPath}')" class="btn btn-small btn-success">👁️</button>` : ''}
                            ${!file.is_dir ? `<a href="/share/download/${share_code}?sub_path=${encodeURIComponent(itemSubPath)}" class="btn btn-small btn-primary">⬇️</a>` : ''}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += `
                <div class="empty">
                    <div class="empty-icon">📂</div>
                    <p>文件夹为空</p>
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;

        // 绑定事件
        container.querySelectorAll('.breadcrumb a[data-path]').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigate(a.dataset.path);
            });
        });

        container.querySelectorAll('[data-parent]').forEach(btn => {
            btn.addEventListener('click', () => this.navigate(btn.dataset.parent));
        });
    },

    handleItemClick(name, isDir, isPreviewable, subPath) {
        if (isDir) {
            this.navigate(subPath);
        } else if (isPreviewable) {
            this.previewFile(subPath);
        }
    },

    previewFile(subPath) {
        const container = document.getElementById('shareContent');
        const shareCode = this.shareCode;

        // 切换顶部栏为预览模式
        document.getElementById('shareTitle').textContent = '👁️ 预览';
        document.getElementById('topBarActions').innerHTML = `
            <button class="top-bar-btn" onclick="shareRouter.navigate('${subPath.split('/').slice(0, -1).join('/') || ''}')" title="返回">✕</button>
        `;

        fetch(`/api/share/${shareCode}/preview?sub_path=${encodeURIComponent(subPath)}`)
            .then(res => res.json())
            .then(data => {
                if (!data.success) {
                    showMsg(data.message, 'error');
                    return;
                }

                const { file_info, file_type } = data;
                const ext = file_info.name.split('.').pop().toLowerCase();

                let mediaHtml = '';
                if (file_type === 'image') {
                    mediaHtml = `<img src="/share/raw/${shareCode}?sub_path=${encodeURIComponent(subPath)}" alt="${file_info.name}">`;
                } else if (file_type === 'video') {
                    mediaHtml = `
                        <video controls autoplay>
                            <source src="/share/raw/${shareCode}?sub_path=${encodeURIComponent(subPath)}" type="video/${ext}">
                            您的浏览器不支持视频播放
                        </video>
                    `;
                }

                container.innerHTML = `
                    <div class="preview-wrapper">
                        <div class="preview-main">
                            <div class="preview-media">${mediaHtml}</div>
                            <div class="preview-footer">
                                <div class="preview-filename">${file_info.name}</div>
                                <div class="preview-actions">
                                    <a href="/share/download/${shareCode}?sub_path=${encodeURIComponent(subPath)}" class="btn btn-primary">⬇️ 下载</a>
                                    <button onclick="shareRouter.navigate('${subPath.split('/').slice(0, -1).join('/') || ''}')" class="btn btn-secondary">返回列表</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            })
            .catch(err => showMsg('预览失败', 'error'));
    },

    resetTopBar() {
        document.getElementById('shareTitle').textContent = '📤 文件分享';
        document.getElementById('topBarActions').innerHTML = `
            <a href="/login" class="top-bar-btn" title="访问网盘" id="homeBtn">🏠</a>
            <button id="themeToggle" class="top-bar-btn" onclick="toggleTheme()">🌙</button>
        `;
    }
};

// 初始化
addEventListener('DOMContentLoaded', () => shareRouter.init());
