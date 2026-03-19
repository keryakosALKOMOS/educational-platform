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
            if (res.status === 401) {
                this.logout();
            }
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

// =============================
// Progressive Web App (PWA) Setup
// =============================

// Dynamically inject manifest and theme-color
(function injectPWAAssets() {
    if (!document.querySelector('link[rel="manifest"]')) {
        const manifestLink = document.createElement('link');
        manifestLink.rel = 'manifest';
        manifestLink.href = '/manifest.json';
        document.head.appendChild(manifestLink);
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
        const themeColorMeta = document.createElement('meta');
        themeColorMeta.name = 'theme-color';
        themeColorMeta.content = '#4F46E5';
        document.head.appendChild(themeColorMeta);
    }
})();

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker Registered'))
            .catch(err => console.log('Service Worker Registration Failed', err));
    });
}

// Handle Install Prompt
window.deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    const installSections = document.querySelectorAll('.pwa-install-section');
    installSections.forEach(el => el.style.display = 'block');
});

window.addEventListener('appinstalled', () => {
    window.deferredPrompt = null;
    const installSections = document.querySelectorAll('.pwa-install-section');
    installSections.forEach(el => el.style.display = 'none');
    console.log('PWA was installed');
});

function getDeviceType() {
    const ua = navigator.userAgent.toLowerCase();
    if (/ipad|iphone|ipod/.test(ua) && !window.MSStream) return 'ios';
    if (/android/.test(ua)) return 'android';
    return 'desktop';
}

window.installPWA = async () => {
    if (window.deferredPrompt) {
        window.deferredPrompt.prompt();
        const { outcome } = await window.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.querySelectorAll('.pwa-install-section').forEach(el => el.style.display = 'none');
        }
        window.deferredPrompt = null;
    } else {
        const device = getDeviceType();
        let msg = "Click the install icon in your browser's address bar.";
        if (device === 'ios') msg = "Tap the Share button at the bottom, then 'Add to Home Screen'.";
        else if (device === 'android') msg = "Tap the 3-dot menu and select 'Add to Home Screen'.";
        window.showNotification(msg, 'success');
    }
};

window.renderInstallInstructions = () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone || document.referrer.includes('android-app://');
    const container = document.getElementById('pwaInstallGuide');
    if (!container) return;

    if (isStandalone) {
        container.innerHTML = '<p style="color:var(--success); font-weight:bold;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:8px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> App is already installed!</p>';
        const btn = document.getElementById('btnInstallApp');
        if (btn) btn.style.display = 'none';
        return;
    }

    const device = getDeviceType();
    let guideHtml = '';
    
    if (device === 'ios') {
        guideHtml = `
            <div style="text-align:left; background:var(--surface-hover); padding:1rem; border-radius:8px;">
                <h4 style="margin-top:0;">iPhone/iPad Instructions:</h4>
                <ol style="margin:0; padding-left:1.2rem;">
                    <li style="margin-bottom:0.8rem;">Tap the <strong>Share</strong> button at the bottom <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:bottom"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>.</li>
                    <li style="margin-bottom:0.8rem;">Scroll and tap <strong>Add to Home Screen</strong> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:bottom"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>.</li>
                    <li>Tap <strong>Add</strong> in the top right.</li>
                </ol>
            </div>`;
    } else if (device === 'android') {
        guideHtml = `
            <div style="text-align:left; background:var(--surface-hover); padding:1rem; border-radius:8px;">
                <h4 style="margin-top:0;">Android Instructions:</h4>
                <ol style="margin:0; padding-left:1.2rem;">
                    <li style="margin-bottom:0.8rem;">Tap the <strong>3-dot menu</strong> ⋮ in Chrome.</li>
                    <li style="margin-bottom:0.8rem;">Tap <strong>Add to Home Screen</strong> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:bottom"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>.</li>
                    <li>Tap <strong>Install</strong>.</li>
                </ol>
            </div>`;
    } else {
        guideHtml = `
            <div style="text-align:left; background:var(--surface-hover); padding:1rem; border-radius:8px;">
                <h4 style="margin-top:0;">Desktop Instructions:</h4>
                <ol style="margin:0; padding-left:1.2rem;">
                    <li style="margin-bottom:0.8rem;">Click the install icon ⊕ in the address bar at the top right.</li>
                    <li>Click <strong>Install</strong>.</li>
                </ol>
            </div>`;
    }
    
    container.innerHTML = guideHtml;
};

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('pwaInstallGuide')) {
        window.renderInstallInstructions();
    }
});

// =============================
// Push Notification Subscription
// =============================

window.subscribeToPush = async () => {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (sub) {
            window.showNotification("Notifications already enabled", "success");
            return;
        }

        const response = await fetch('/api/push/public-key');
        if (!response.ok) throw new Error('Failed to get public key');
        const { publicKey } = await response.json();
        
        const padding = '='.repeat((4 - publicKey.length % 4) % 4);
        const base64 = (publicKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }

        sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: outputArray
        });

        if (window.app && window.app.token) {
            await window.app.apiCall('/api/push/subscribe', 'POST', sub);
            window.showNotification("Notifications enabled successfully!", "success");
        }
    } catch (e) {
        console.error('Push Subscription failed', e);
        window.showNotification("Failed to enable notifications. Unblock notifications in browser settings.", "error");
    }
};

window.requestPushPermission = async () => {
    if (!('Notification' in window)) {
        window.showNotification("Push notifications are not supported by your browser.", "error");
        return;
    }
    if (Notification.permission === 'granted') {
        window.subscribeToPush();
    } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') window.subscribeToPush();
        else window.showNotification("Permission denied.", "error");
    } else {
        window.showNotification("Notifications are blocked in your browser settings.", "warning");
    }
};
