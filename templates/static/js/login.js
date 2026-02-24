const $ = id => document.getElementById(id);

const BG_IMG_URL = '/static/1.webp';

const loadBackgroundImage = () => {
    if (!BG_IMG_URL.trim()) return;

    const img = new Image();
    img.onload = () => document.body.classList.add('bg-loaded');
    img.src = BG_IMG_URL;
};

const toggleTheme = () => {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
};

// 初始化主题
addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark');
    }

    loadBackgroundImage();
});
