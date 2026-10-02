// ============================================================
// ===== CANDY MASS - SERVICE WORKER ==========================
// Offline play + Play Store (TWA) requirements ke liye.
// Ye file index.html ke saath hi repo ke root me rakho.
// ============================================================

const CACHE_NAME = 'candymass-v4-1';

// Ye files pehli baar install par cache ho jati hain.
const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

// Sprite sheets - naam kuch bhi ho, jo mile usse cache kar lete hain.
const SHEET_CANDIDATES = [
    'candy-sheet.png', 'candysheet.png', 'candy sheet.png', 'candy-sheet.jpeg', 'candy-sheet.jpg', 'candy.png',
    'fish-sheet.png', 'fishsheet.png', 'fish sheet.png', 'fish-sheet.jpeg', 'fish-sheet.jpg', 'fish.png',
    'coffee-sheet.png', 'coffeesheet.png', 'coffee sheet.png', 'coffee-sheet.jpeg', 'coffee-sheet.jpg', 'coffee.png',
    'candymass_icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // core assets - inme se koi bhi fail ho to install fail na ho
        await Promise.all(CORE_ASSETS.map((url) =>
            cache.add(url).catch(() => { /* jo na mile use chhod do */ })
        ));
        // sprite sheets - jo exist karti hain wahi cache hongi
        await Promise.all(SHEET_CANDIDATES.map((url) =>
            fetch(url, { cache: 'no-cache' })
                .then((res) => { if (res && res.ok) return cache.put(url, res); })
                .catch(() => { /* is naam ki file nahi hai */ })
        ));
        self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // Firebase / Google API calls ko kabhi cache nahi karna
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        // pehle cache dekho (offline ke liye), warna network
        const cached = await caches.match(req);
        if (cached) {
            // background me update karte raho (stale-while-revalidate)
            fetch(req).then((res) => {
                if (res && res.ok) caches.open(CACHE_NAME).then((c) => c.put(req, res));
            }).catch(() => {});
            return cached;
        }
        try {
            const res = await fetch(req);
            if (res && res.ok) {
                const copy = res.clone();
                caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
        } catch (e) {
            // offline aur cache me bhi nahi -> game shell do
            const shell = await caches.match('./index.html');
            if (shell) return shell;
            return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
    })());
});
