/**
 * Service Worker - XOSO66 TV PWA
 * v4 - cache static + push notifications + chat sync + mobile bottom nav
 */
const CACHE_VERSION = 'xoso66tv-v5-mobile-header';
const STATIC_CACHE = [
  '/',
  '/manifest.json',
  '/static/img/logoxoso66tv.webp',
  '/static/img/favicon.webp',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/js/chat-v2.js?v=4-sync'
];

// ===== INSTALL: precache static =====
self.addEventListener('install', function(event) {
  console.log('[SW] Install v', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.addAll(STATIC_CACHE).catch(function(e){ console.log('[SW] precache fail:', e); });
    }).then(function(){ return self.skipWaiting(); })
  );
});

// ===== ACTIVATE: clear old caches =====
self.addEventListener('activate', function(event) {
  console.log('[SW] Activate v', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.filter(function(n){ return n !== CACHE_VERSION; }).map(function(n){ return caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// ===== FETCH: network-first cho HTML, cache-first cho static =====
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);
  // Bỏ qua các request không phải GET
  if (event.request.method !== 'GET') return;
  // Bỏ qua các API + admin + WebRTC + FLV
  if (url.pathname.startsWith('/admin') ||
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/rtc/') ||
      url.pathname.endsWith('.flv') ||
      url.pathname.endsWith('.m3u8') ||
      url.pathname.endsWith('.ts')) return;

  // Static assets → cache-first
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_VERSION).then(function(cache){ cache.put(event.request, clone); });
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML/EJS pages → network-first với fallback cache
  if (event.request.headers.get('accept') && event.request.headers.get('accept').indexOf('text/html') !== -1) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_VERSION).then(function(cache){ cache.put(event.request, clone); });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request) || caches.match('/');
      })
    );
  }
});

// ===== PUSH NOTIFICATION =====
self.addEventListener('push', function(event) {
  console.log('[SW] Push received');
  var data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'XOSO66 TV', body: event.data ? event.data.text() : '' }; }

  var options = {
    body: data.body || 'Có thông báo mới',
    icon: data.icon || '/static/img/logoxoso66tv.webp',
    badge: '/static/img/favicon.webp',
    image: data.image || undefined,
    tag: data.tag || 'xoso66tv-' + Date.now(),
    renotify: true,
    requireInteraction: data.requireInteraction || false,
    vibrate: data.vibrate || [200, 100, 200],
    data: { url: data.url || '/', timestamp: Date.now() },
    actions: data.actions || [
      { action: 'open', title: '🎬 Xem ngay' },
      { action: 'close', title: '✕ Đóng' }
    ]
  };

  event.waitUntil(self.registration.showNotification(data.title || 'XOSO66 TV', options));
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'close') return;

  var targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      // Nếu đã có tab mở → focus
      for (var i = 0; i < clients.length; i++) {
        var c = clients[i];
        if (c.url.indexOf(targetUrl) !== -1 && 'focus' in c) return c.focus();
      }
      // Nếu chưa có → mở mới
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// ===== BACKGROUND SYNC (cho gửi tin nhắn khi offline) =====
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-pending-actions') {
    console.log('[SW] Background sync');
  }
});
