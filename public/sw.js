/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🚀 SERVICE WORKER v7 — Mục 11: Advanced cache strategy           ║
 * ║                                                                    ║
 * ║ Strategies:                                                        ║
 * ║   - Cache-first:        /static/*, fonts, images (immutable)     ║
 * ║   - Stale-while-revalidate: HTML pages, /api/* GET                ║
 * ║   - Network-only:       /api/auth/*, POST/PUT/DELETE              ║
 * ║   - Network-first w/ offline fallback: navigation                 ║
 * ║                                                                    ║
 * ║ Push notification handlers included.                              ║
 * ╚══════════════════════════════════════════════════════════════════*/

const VERSION = 'v106-2026-06-18-smart-flv-error-no-reconnect-overlay-on-first-attach';
const STATIC_CACHE = 'x66-static-' + VERSION;
const HTML_CACHE   = 'x66-html-'   + VERSION;
const API_CACHE    = 'x66-api-'    + VERSION;

const PRECACHE = [
  '/',
  '/static/css/skeleton.css',
  '/static/css/bottom-sheet.css',
  '/static/js/app.js',
  '/static/img/logoxoso66tv.webp',
  '/static/img/favicon.webp',
  '/manifest.json'
];

// ─── Install ───
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return cache.addAll(PRECACHE).catch(function(){});
    }).then(function() { return self.skipWaiting(); })
  );
});

// ─── Activate: cleanup old versions ───
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== STATIC_CACHE && k !== HTML_CACHE && k !== API_CACHE && k.startsWith('x66')) {
          return caches.delete(k);
        }
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

// ─── Helpers ───
function isStaticAsset(url) {
  return /\.(css|js|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|ico|mp4|webm)$/i.test(url.pathname) ||
         url.pathname.startsWith('/static/');
}
function isHtmlNavigation(req) {
  return req.mode === 'navigate' ||
         (req.headers.get('accept') || '').includes('text/html');
}
function isApiGet(req, url) {
  return req.method === 'GET' && url.pathname.startsWith('/api/') &&
         !url.pathname.startsWith('/api/auth/') &&
         !url.pathname.startsWith('/api/chat/');
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (e) { return cached || new Response('', { status: 503 }); }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(function(res) {
    if (res && res.ok && req.method === 'GET') {
      cache.put(req, res.clone()).catch(function(){});
    }
    return res;
  }).catch(function() { return null; });
  return cached || fetchPromise || new Response('Offline', { status: 503 });
}

async function networkFirstNav(req) {
  try {
    const fresh = await fetch(req);
    if (fresh.ok) {
      const cache = await caches.open(HTML_CACHE);
      cache.put(req, fresh.clone()).catch(function(){});
    }
    return fresh;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    return caches.match('/') || new Response(
      '<h1>📵 Offline</h1><p>Vui lòng kết nối mạng.</p><a href="/">← Thử lại</a>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// ─── Main fetch handler ───
self.addEventListener('fetch', function(event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Skip streaming + admin + socket.io
  if (url.pathname.startsWith('/socket.io/') ||
      url.pathname.startsWith('/admin') ||
      /\.flv$|\.m3u8$|\.ts$/.test(url.pathname)) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req));
  } else if (isApiGet(req, url)) {
    event.respondWith(staleWhileRevalidate(req, API_CACHE));
  } else if (isHtmlNavigation(req)) {
    event.respondWith(networkFirstNav(req));
  }
});

// ═══ PUSH NOTIFICATION ═══
self.addEventListener('push', function(event) {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); }
  catch(e) { data = { title: 'XOSO66 TV', body: event.data.text() }; }
  const options = {
    body: data.body || '',
    icon: data.icon || '/static/img/logoxoso66tv.webp',
    badge: '/static/img/favicon.webp',
    tag: data.tag || 'x66-notif',
    data: { url: data.url || '/', ts: Date.now() },
    requireInteraction: !!data.requireInteraction,
    vibrate: data.vibrate || [200, 100, 200],
    actions: data.actions || []
  };
  event.waitUntil(self.registration.showNotification(data.title || 'XOSO66 TV', options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'close') return;
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(url) > -1 && 'focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
