/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║  LIVE SWIPE NAVIGATION — chuyển nhanh giữa các trận đang LIVE  ║
 * ║                                                                  ║
 * ║  Mobile:   vuốt trái/phải trên player → trận tiếp/trước         ║
 * ║  Desktop:  phím ← → + 2 nút mũi tên hover trên player           ║
 * ║  Source:   GET /api/live-now-rooms (cache 30s localStorage)     ║
 * ║                                                                  ║
 * ║  Chỉ active trên /live/:id. Không can thiệp idol room.          ║
 * ╚════════════════════════════════════════════════════════════════*/
(function () {
  'use strict';
  if (!/^\/live\//.test(location.pathname)) return;

  // ─── Validate input: phải có #livePlayer ───
  function init() {
    var PLAYER = document.getElementById('livePlayer');
    if (!PLAYER) return; // chưa render xong → bỏ qua

    var CACHE_KEY = 'liveRoomsCache_v1';
    var CACHE_TTL = 30 * 1000; // 30s
    var rooms = []; // [{id, slug, title, league, blvName}]
    var curIdx = -1;

    // ─── localStorage cache ───
    function getCached() {
      try {
        var raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        var obj = JSON.parse(raw);
        if (!obj || Date.now() - (obj.t || 0) > CACHE_TTL) return null;
        return Array.isArray(obj.list) ? obj.list : null;
      } catch (_) { return null; }
    }
    function setCached(list) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), list: list })); } catch (_) {}
    }

    // ─── Tính curIdx từ URL ───
    function computeCurIdx() {
      var m = location.pathname.match(/\/live\/([^/?#]+)/);
      if (!m) return;
      var slugOrId = m[1];
      var idMatch = slugOrId.match(/(\d+)$/);
      var curId = idMatch ? idMatch[1] : '';
      curIdx = rooms.findIndex(function (r) {
        return String(r.id) === String(curId) || r.slug === slugOrId;
      });
      if (rooms.length >= 2) renderArrows();
    }

    // ─── Fetch rooms list ───
    function loadRooms() {
      var cached = getCached();
      if (cached) { rooms = cached; computeCurIdx(); return; }
      fetch('/api/live-now-rooms', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : { list: [] }; })
        .then(function (j) {
          rooms = (j && Array.isArray(j.list)) ? j.list : [];
          setCached(rooms);
          computeCurIdx();
        })
        .catch(function (e) { console.warn('[live-swipe] fetch fail:', e && e.message); });
    }

    // ─── Tính trận tiếp/trước (loop) ───
    function nextRoom(dir) {
      if (!rooms.length) return null;
      if (rooms.length === 1) return null; // chỉ có trận hiện tại
      if (curIdx < 0) return rooms[0];
      var n = (curIdx + dir + rooms.length) % rooms.length;
      if (n === curIdx) return null;
      return rooms[n];
    }

    // ─── Toast preview ───
    function showToast(room, dir) {
      var t = document.getElementById('liveSwipeToast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'liveSwipeToast';
        t.style.cssText =
          'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
          'background:rgba(0,0,0,.88);color:#fff;padding:14px 22px;border-radius:14px;' +
          'font-weight:700;z-index:99999;pointer-events:none;backdrop-filter:blur(8px);' +
          'box-shadow:0 8px 32px rgba(0,0,0,.5);opacity:0;transition:opacity .2s;' +
          'text-align:center;max-width:80vw;border:1px solid rgba(255,122,24,.4);';
        document.body.appendChild(t);
      }
      var arrow = dir > 0 ? '→' : '←';
      var label = dir > 0 ? 'Trận tiếp' : 'Trận trước';
      var title = (room.title || room.league || ('#' + room.id)).replace(/[<>]/g, '');
      t.innerHTML =
        '<div style="font-size:11px;opacity:.75;margin-bottom:4px;color:#ff7a18">' + arrow + ' ' + label + '</div>' +
        '<div style="font-size:14px">' + title + '</div>';
      t.style.opacity = '1';
      clearTimeout(t._hideT);
      t._hideT = setTimeout(function () { t.style.opacity = '0'; }, 1500);
    }

    function showEnd() {
      var t = document.createElement('div');
      t.textContent = 'Không còn trận live khác';
      t.style.cssText =
        'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);' +
        'background:rgba(0,0,0,.85);color:#fff;padding:10px 16px;border-radius:8px;' +
        'font-size:12px;z-index:99999;pointer-events:none;';
      document.body.appendChild(t);
      setTimeout(function () { t.remove(); }, 1500);
    }

    function navigateTo(room) {
      if (!room || !room.slug) return;
      location.href = '/live/' + room.slug;
    }

    function go(dir) {
      var room = nextRoom(dir);
      if (!room) { showEnd(); return; }
      showToast(room, dir);
      setTimeout(function () { navigateTo(room); }, 220);
    }

    // ─── Render 2 nút mũi tên trên player ───
    function renderArrows() {
      if (document.getElementById('liveSwipePrev')) return;
      var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

      function mkBtn(id, side, sym, label) {
        var b = document.createElement('button');
        b.id = id;
        b.type = 'button';
        b.setAttribute('aria-label', label);
        b.innerHTML = sym;
        b.style.cssText =
          'position:absolute;top:50%;' + side + ':8px;transform:translateY(-50%);' +
          'z-index:50;width:42px;height:64px;background:rgba(0,0,0,.55);color:#fff;' +
          'border:none;border-radius:8px;font-size:28px;line-height:1;cursor:pointer;' +
          'display:none;align-items:center;justify-content:center;' +
          'backdrop-filter:blur(6px);transition:background .15s,transform .15s;' +
          'font-family:system-ui,Arial,sans-serif;';
        b.onmouseenter = function () { b.style.background = 'rgba(255,122,24,.9)'; b.style.transform = 'translateY(-50%) scale(1.06)'; };
        b.onmouseleave = function () { b.style.background = 'rgba(0,0,0,.55)'; b.style.transform = 'translateY(-50%) scale(1)'; };
        b.onclick = function (ev) { ev.stopPropagation(); ev.preventDefault(); go(side === 'left' ? -1 : 1); };
        return b;
      }

      var prev = mkBtn('liveSwipePrev', 'left', '‹', 'Trận trước');
      var next = mkBtn('liveSwipeNext', 'right', '›', 'Trận tiếp');
      PLAYER.appendChild(prev);
      PLAYER.appendChild(next);

      if (isTouch) {
        // Mobile: hiện mờ thường xuyên (vuốt là chính, nút chỉ phụ)
        prev.style.display = 'flex'; next.style.display = 'flex';
        prev.style.opacity = '0.55'; next.style.opacity = '0.55';
        prev.style.width = '36px'; next.style.width = '36px';
        prev.style.height = '52px'; next.style.height = '52px';
      } else {
        // Desktop: chỉ hiện khi hover player
        PLAYER.addEventListener('mouseenter', function () { prev.style.display = 'flex'; next.style.display = 'flex'; });
        PLAYER.addEventListener('mouseleave', function () { prev.style.display = 'none'; next.style.display = 'none'; });
      }
    }

    // ─── Desktop: phím ← / → ───
    document.addEventListener('keydown', function (e) {
      // Bỏ qua khi đang gõ input/textarea/contenteditable
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    });

    // ─── Mobile: swipe trái/phải ───
    var touchX0 = 0, touchY0 = 0, touchT0 = 0, swiping = false;
    PLAYER.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) { swiping = false; return; }
      touchX0 = e.touches[0].clientX;
      touchY0 = e.touches[0].clientY;
      touchT0 = Date.now();
      swiping = true;
    }, { passive: true });

    PLAYER.addEventListener('touchend', function (e) {
      if (!swiping) return;
      swiping = false;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - touchX0;
      var dy = t.clientY - touchY0;
      var dt = Date.now() - touchT0;
      // Chỉ accept nếu: |dx| > 80, |dx| > 2*|dy| (ngang hẳn), thời gian < 800ms
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 800) {
        if (dx < 0) go(1); else go(-1);
      }
    }, { passive: true });

    // ─── INIT ───
    loadRooms();
  }

  // Defer init until DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
