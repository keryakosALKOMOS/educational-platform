const API_BASE = '/api';

class App {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user'));
        this.init();
    }

    init() {
        this.updateAuthUI();
        this.setupLogout();
        this.setupLangSwitcher();
    }

    setAuth(token, user) {
        this.token = token;
        this.user = user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        this.updateAuthUI();
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.token = null;
        this.user = null;
        this.updateAuthUI();
        window.location.href = '/index.html';
    }

    updateAuthUI() {
        if (!this.user) {
            document.body.setAttribute('data-auth', 'guest');
        } else if (this.user.role === 'admin') {
            document.body.setAttribute('data-auth', 'admin');
        } else {
            document.body.setAttribute('data-auth', 'user');
        }

        // Update username displays if any
        document.querySelectorAll('.user-name-display').forEach(el => {
            el.textContent = this.user ? this.user.name : '';
        });
        
        // Update coins display
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
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        });
    }

    setupLangSwitcher() {
        const switcher = document.getElementById('langSwitcher');
        if (switcher) {
            switcher.value = window.i18n.lang;
            switcher.addEventListener('change', (e) => {
                window.i18n.setLanguage(e.target.value);
            });
        }
    }

    async apiCall(endpoint, method = 'GET', body = null) {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const res = await fetch(`${API_BASE}${endpoint}`, options);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                // Token invalid or expired
                this.logout();
            }
            throw new Error(data.error || 'API Error');
        }
        return data;
    }
}

window.app = new App();

// Helper to show notifications
window.showNotification = (msg, type = 'success') => {
    // Simple basic alert for now, can be upgraded to toast
    alert(msg);
};
