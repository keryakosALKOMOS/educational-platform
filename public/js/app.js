const API_BASE = '/api';

// =============================
// Apply theme & palette EARLY (before DOM renders)
// =============================
(function applyPreferences() {
    const theme   = localStorage.getItem('edu_theme')   || 'light';
    const palette = localStorage.getItem('edu_palette') || 'indigo';
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    if (palette !== 'indigo') document.documentElement.setAttribute('data-palette', palette);
})();

class App {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user  = JSON.parse(localStorage.getItem('user') || 'null');
        this.init();
    }

    init() {
        this.updateAuthUI();
        this.setupLogout();
        this.setupLangSwitcher();
        this.setupAnimations();
    }

    setupAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        document.querySelectorAll('.fade-in, .slide-up, .scale-in').forEach(el => observer.observe(el));
    }

    setAuth(token, user) {
        this.token = token;
        this.user  = user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        this.updateAuthUI();
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.token = null;
        this.user  = null;
        this.updateAuthUI();
        window.location.href = '/index.html';
    }

    updateAuthUI() {
        const auth = !this.user ? 'guest' : this.user.role === 'admin' ? 'admin' : 'user';
        document.body.setAttribute('data-auth', auth);

        document.querySelectorAll('.user-name-display').forEach(el => {
            el.textContent = this.user ? this.user.name : '';
        });
        this.updateCoinsDisplay();
    }

    updateCoinsDisplay() {
        if (this.user && this.user.role === 'student') {
            document.querySelectorAll('.coins-display').forEach(el => {
                el.textContent = this.user.coins;
            });
        }
    }

    setupLogout() {
        document.querySelectorAll('.logout-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.preventDefault(); this.logout(); });
        });
    }

    setupLangSwitcher() {
        const switcher = document.getElementById('langSwitcher');
        if (switcher) {
            switcher.value = window.i18n?.lang || 'en';
            switcher.addEventListener('change', e => window.i18n?.setLanguage(e.target.value));
        }
    }

    // ---- Theme / Palette helpers ----
    getTheme()   { return localStorage.getItem('edu_theme')   || 'light'; }
    getPalette() { return localStorage.getItem('edu_palette') || 'indigo'; }

    setTheme(theme) {
        localStorage.setItem('edu_theme', theme);
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    setPalette(palette) {
        localStorage.setItem('edu_palette', palette);
        if (palette === 'indigo') {
            document.documentElement.removeAttribute('data-palette');
        } else {
            document.documentElement.setAttribute('data-palette', palette);
        }
    }

    // ---- API Helper ----
    async apiCall(endpoint, method = 'GET', body = null) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const res  = await fetch(`${API_BASE}${endpoint}`, options);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) this.logout();
            throw new Error(data.error || 'API Error');
        }
        return data;
    }
}

window.app = new App();

// =============================
// Toast Notification System
// =============================
window.showNotification = (msg, type = 'success') => {
    let toast = document.getElementById('_toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = '_toast';
        toast.className = 'toast';
        const icon = document.createElement('span');
        icon.id = '_toast_icon';
        const text = document.createElement('span');
        text.id = '_toast_text';
        toast.appendChild(icon);
        toast.appendChild(text);
        document.body.appendChild(toast);
    }
    toast.className = `toast ${type}`;
    document.getElementById('_toast_icon').innerHTML =
        type === 'success'
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    document.getElementById('_toast_text').textContent = msg;

    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 3500);
};

