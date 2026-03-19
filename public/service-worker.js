const CACHE_NAME = 'edu-pwa-v1';
const DYNAMIC_CACHE = 'edu-dynamic-v1';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/css/style.css',
    '/js/app.js',
    '/js/i18n.js',
    '/js/pwa.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME && key !== DYNAMIC_CACHE) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim(); // take control of open pages immediately
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Network First for API requests
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/student/') || url.pathname.startsWith('/admin/')) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    return caches.open(DYNAMIC_CACHE).then((cache) => {
                        // don't cache non-GET API requests
                        if (request.method === 'GET') {
                            cache.put(request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                })
                .catch(() => {
                    return caches.match(request);
                })
        );
    } 
    // Cache First for static assets and views
    else {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) {
                    // Start fetching in background to update cache (Stale-while-revalidate pattern)
                    fetch(request).then(res => {
                        if (res.ok) caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, res));
                    }).catch(e => {});
                    return cachedResponse;
                }
                
                return fetch(request)
                    .then((networkResponse) => {
                        return caches.open(DYNAMIC_CACHE).then((cache) => {
                            if (request.method === 'GET') {
                                cache.put(request, networkResponse.clone());
                            }
                            return networkResponse;
                        });
                    })
                    .catch(() => {
                        // Return offline page for navigation requests (HTML pages)
                        if (request.mode === 'navigate') {
                            return caches.match('/offline.html');
                        }
                    });
            })
        );
    }
});

// Push notification handling
self.addEventListener('push', (event) => {
    let data = { title: 'EduPlatform', body: 'You have a new notification.' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch(e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: 'https://ui-avatars.com/api/?name=EP&background=4F46E5&color=fff&size=192',
        badge: 'https://ui-avatars.com/api/?name=EP&background=4F46E5&color=fff&size=192',
        data: data.url || '/'
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data)
    );
});
