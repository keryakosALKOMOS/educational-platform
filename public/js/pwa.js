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
    installSections.forEach(el => el.style.display = 'block'); // Show install buttons
});

window.addEventListener('appinstalled', () => {
    window.deferredPrompt = null;
    const installSections = document.querySelectorAll('.pwa-install-section');
    installSections.forEach(el => el.style.display = 'none'); // Hide install buttons
    console.log('PWA was installed');
});

function getDeviceType() {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /ipad|iphone|ipod/.test(userAgent) && !window.MSStream;
    const isAndroid = /android/.test(userAgent);
    
    if (isIOS) return 'ios';
    if (isAndroid) return 'android';
    return 'desktop';
}

// Will be called by settings.html to trigger install
window.installPWA = async () => {
    if (window.deferredPrompt) {
        window.deferredPrompt.prompt();
        const { outcome } = await window.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            const installSections = document.querySelectorAll('.pwa-install-section');
            installSections.forEach(el => el.style.display = 'none');
        }
        window.deferredPrompt = null;
    } else {
        // If no prompt available to trigger natively, show instructions
        const device = getDeviceType();
        let msg = "";
        if (device === 'ios') msg = "Tap the Share button at the bottom, then 'Add to Home Screen'.";
        else if (device === 'android') msg = "Tap the 3-dot menu and select 'Add to Home Screen'.";
        else msg = "Click the install icon in your browser's address bar.";
        
        if (window.showNotification) window.showNotification(msg, 'success');
        else alert(msg);
    }
};

window.renderInstallInstructions = () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone || document.referrer.includes('android-app://');
    const container = document.getElementById('pwaInstallGuide');
    if (!container) return;

    if (isStandalone) {
        container.innerHTML = '<p style="color:var(--success);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:8px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> App is already installed!</p>';
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
                    <li style="margin-bottom:0.5rem;">Tap the <strong>Share</strong> button <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:bottom"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>.</li>
                    <li style="margin-bottom:0.5rem;">Scroll and tap <strong>Add to Home Screen</strong> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:bottom"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>.</li>
                    <li>Tap <strong>Add</strong> in the top right.</li>
                </ol>
            </div>`;
    } else if (device === 'android') {
        guideHtml = `
            <div style="text-align:left; background:var(--surface-hover); padding:1rem; border-radius:8px;">
                <h4 style="margin-top:0;">Android Instructions:</h4>
                <ol style="margin:0; padding-left:1.2rem;">
                    <li style="margin-bottom:0.5rem;">Tap the <strong>3-dot menu</strong> ⋮ in Chrome.</li>
                    <li style="margin-bottom:0.5rem;">Tap <strong>Add to Home Screen</strong> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:bottom"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>.</li>
                    <li>Tap <strong>Install</strong>.</li>
                </ol>
            </div>`;
    } else {
        guideHtml = `
            <div style="text-align:left; background:var(--surface-hover); padding:1rem; border-radius:8px;">
                <h4 style="margin-top:0;">Desktop Instructions:</h4>
                <ol style="margin:0; padding-left:1.2rem;">
                    <li style="margin-bottom:0.5rem;">Click the install icon ⊕ in the address bar at the top right.</li>
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
