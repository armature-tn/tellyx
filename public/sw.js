const CACHE_NAME = 'tellyx-pwa-v2';
const STATIC_ASSETS = [
    './',
    './index.html',
    './player.html',
    './manifest.json',
    './icon.svg'
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
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = event.request.url;
    // Skip video stream segments, playlist feeds, CORS proxies, and external API requests
    if (url.includes('.m3u') || url.includes('.m3u8') || url.includes('.ts') || url.includes('.mp4') || url.includes('cors') || url.includes('api')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) {
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                    }
                }).catch(() => {});
                return cached;
            }
            return fetch(event.request);
        })
    );
});
