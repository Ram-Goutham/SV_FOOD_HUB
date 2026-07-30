/* =========================================================
   SV FOOD HUB - Service Worker
   Strategy: Cache-First for assets, Network-First for HTML
   ========================================================= */

const CACHE_VERSION = 'sv-food-hub-v1';
const STATIC_CACHE = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

const STATIC_ASSETS = [
  './food_hub.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

// ── Install: pre-cache all static assets ─────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll(STATIC_ASSETS);

      // Cache external CDN assets with individual error handling
      const runtimeCache = await caches.open(RUNTIME_CACHE);
      await Promise.allSettled(
        EXTERNAL_ASSETS.map((url) => runtimeCache.add(url).catch(() => {}))
      );

      // Activate immediately without waiting for old tabs to close
      await self.skipWaiting();
    })()
  );
});

// ── Activate: remove old caches ───────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('sv-food-hub-') && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      // Take control of all open tabs immediately
      await self.clients.claim();
    })()
  );
});

// ── Fetch: routing strategy ───────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip non-http(s) schemes (chrome-extension://, etc.)
  if (!url.protocol.startsWith('http')) return;

  // Skip IndexedDB and Blob URLs
  if (url.protocol === 'blob:') return;

  // Navigation requests (HTML pages): Network-First
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // CDN/external resources: Cache-First (they're versioned and rarely change)
  if (!url.hostname.includes(self.location.hostname)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // Local static assets: Cache-First
  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

// ── Strategies ────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Clone before consuming — you can only read a Response body once
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return offlineFallback();
  }
}

function offlineFallback() {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SV Food Hub – Offline</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0;
           background: #FFF7ED; color: #2B1B10; text-align: center; padding: 20px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    p  { color: #6B5747; font-size: 14px; }
    button { margin-top: 20px; padding: 12px 28px; background: #FF6B2C;
             color: #fff; border: none; border-radius: 12px; font-size: 15px;
             font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div>
    <div class="icon">🍽️</div>
    <h1>You're Offline</h1>
    <p>SV Food Hub needs a connection for the first load.<br>
       Once loaded once, it works fully offline.</p>
    <button onclick="location.reload()">Try Again</button>
  </div>
</body>
</html>`,
    {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

// ── Background Sync (optional – silently ignored if not supported) ──
self.addEventListener('sync', (event) => {
  // Placeholder for future sync tasks (e.g. sending invoices)
  if (event.tag === 'sync-orders') {
    event.waitUntil(Promise.resolve());
  }
});

// ── Push notifications (optional placeholder) ─────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'SV Food Hub', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-96.png',
    })
  );
});
