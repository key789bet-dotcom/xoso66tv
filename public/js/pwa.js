/**
 * PWA Client - XOSO66 TV
 * - Register service worker
 * - Install prompt UI
 * - Push notification subscription
 */
(function(){
'use strict';

if (!('serviceWorker' in navigator)) return;

// ===== REGISTER SERVICE WORKER =====
window.addEventListener('load', function() {
  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(function(reg) {
      console.log('[PWA] SW registered:', reg.scope);
      // Auto check for update mỗi 1h
      setInterval(function(){ reg.update(); }, 60 * 60 * 1000);
    })
    .catch(function(err) { console.log('[PWA] SW fail:', err); });
});

// ===== INSTALL PROMPT =====
var deferredPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
  showInstallBanner();
});

window.addEventListener('appinstalled', function() {
  console.log('[PWA] App installed');
  hideInstallBanner();
  try { localStorage.setItem('x66_pwa_installed', '1'); } catch(e){}
});

function showInstallBanner() {
  // Check user đã dismiss chưa hoặc đã install
  try {
    if (localStorage.getItem('x66_pwa_installed') === '1') return;
    var dismissed = parseInt(localStorage.getItem('x66_pwa_dismissed') || '0', 10);
    if (dismissed && Date.now() - dismissed < 7 * 24 * 3600 * 1000) return; // 7 ngày
  } catch(e){}

  var banner = document.getElementById('pwaInstallBanner');
  if (banner) { banner.classList.remove('hidden'); return; }

  banner = document.createElement('div');
  banner.id = 'pwaInstallBanner';
  banner.style.cssText = 'position:fixed;bottom:80px;left:8px;right:8px;z-index:50;background:linear-gradient(135deg,#1a1f29,#0a0d12);border:2px solid #ff7a18;border-radius:14px;padding:12px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 28px rgba(255,122,24,.45);animation:pwaSlideUp .4s ease;';
  banner.innerHTML =
    '<img src="/static/img/logoxoso66tv.webp" alt="" style="width:42px;height:42px;border-radius:8px;flex-shrink:0">' +
    '<div style="flex:1;min-width:0">' +
      '<div style="color:#fff;font-weight:800;font-size:13px;line-height:1.2">Cài đặt XOSO66 TV</div>' +
      '<div style="color:#cbd5e1;font-size:11px;margin-top:2px">Xem nhanh hơn · Thông báo idol live · Lưu màn hình chính</div>' +
    '</div>' +
    '<button id="pwaInstallBtn" style="background:linear-gradient(135deg,#ff7a18,#ea580c);color:#fff;border:0;padding:8px 14px;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;flex-shrink:0">CÀI</button>' +
    '<button id="pwaDismissBtn" style="background:transparent;color:#94a3b8;border:0;padding:6px;font-size:18px;cursor:pointer;flex-shrink:0">✕</button>';
  document.body.appendChild(banner);

  // CSS animation
  if (!document.getElementById('pwaCss')) {
    var style = document.createElement('style');
    style.id = 'pwaCss';
    style.textContent = '@keyframes pwaSlideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }';
    document.head.appendChild(style);
  }

  document.getElementById('pwaInstallBtn').addEventListener('click', function() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(choice) {
      console.log('[PWA] User choice:', choice.outcome);
      if (choice.outcome === 'accepted') hideInstallBanner();
      deferredPrompt = null;
    });
  });

  document.getElementById('pwaDismissBtn').addEventListener('click', function() {
    hideInstallBanner();
    try { localStorage.setItem('x66_pwa_dismissed', String(Date.now())); } catch(e){}
  });
}

function hideInstallBanner() {
  var banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.remove();
}

// ===== PUSH NOTIFICATION SUBSCRIPTION =====
window.x66Push = {
  // Check permission status
  status: function() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'granted' | 'denied' | 'default'
  },

  // Request permission + subscribe
  subscribe: async function(opts) {
    opts = opts || {};
    if (!('Notification' in window) || !('PushManager' in window)) {
      console.log('[PWA] Push not supported');
      return { ok: false, reason: 'unsupported' };
    }
    try {
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') return { ok: false, reason: 'denied' };

      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // Lấy VAPID public key từ server
        var keyRes = await fetch('/api/push/vapid-key');
        var keyJson = await keyRes.json();
        if (!keyJson.publicKey) return { ok: false, reason: 'no_vapid_key' };

        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyJson.publicKey)
        });
      }

      // Gửi subscription lên server
      var saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub,
          topics: opts.topics || ['idol_live']
        })
      });
      var saveJson = await saveRes.json();
      console.log('[PWA] Push subscribed:', saveJson);
      return { ok: true, subscription: sub };
    } catch(e) {
      console.log('[PWA] Push subscribe error:', e.message);
      return { ok: false, reason: e.message };
    }
  },

  // Unsubscribe
  unsubscribe: async function() {
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
      }
      return { ok: true };
    } catch(e) { return { ok: false, reason: e.message }; }
  }
};

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = window.atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Auto-prompt push khi user follow idol đầu tiên
window.addEventListener('x66FollowIdol', function(e) {
  // Chỉ hỏi 1 lần
  try {
    if (localStorage.getItem('x66_push_asked') === '1') return;
    localStorage.setItem('x66_push_asked', '1');
  } catch(e){}
  if (window.x66Push.status() === 'default') {
    setTimeout(function() {
      if (confirm('🔔 Bật thông báo để biết idol bạn theo dõi LIVE ngay?')) {
        window.x66Push.subscribe({ topics: ['idol_live'] });
      }
    }, 1500);
  }
});

})();
