/* ╔══════════════════════════════════════════════════════════════════╗
   ║ 📱 BOTTOM SHEET — Mục 15                                          ║
   ║                                                                    ║
   ║ Global API:                                                       ║
   ║   x66BottomSheet.open(id, opts?)                                  ║
   ║   x66BottomSheet.close(id)                                        ║
   ║   x66BottomSheet.create({ title, html, onClose })  → temp sheet  ║
   ║                                                                    ║
   ║ Features:                                                          ║
   ║   ✅ Drag handle to dismiss (mobile)                              ║
   ║   ✅ Backdrop click to close                                      ║
   ║   ✅ ESC key close                                                ║
   ║   ✅ Body scroll lock                                             ║
   ║   ✅ Multi-sheet stack (z-index auto)                             ║
   ║   ✅ Auto-fallback center modal trên desktop                      ║
   ╚══════════════════════════════════════════════════════════════════*/
(function(){
  'use strict';

  var BACKDROP_ID = '__x66_bs_backdrop__';
  var openStack = [];   // [id, id, ...] - LIFO
  var bodyLockScroll = 0;

  // ─── Backdrop singleton ───
  function getBackdrop() {
    var bd = document.getElementById(BACKDROP_ID);
    if (!bd) {
      bd = document.createElement('div');
      bd.id = BACKDROP_ID;
      bd.className = 'x-bs-backdrop';
      bd.addEventListener('click', function(){
        var top = openStack[openStack.length - 1];
        if (top) close(top);
      });
      document.body.appendChild(bd);
    }
    return bd;
  }

  // ─── Body scroll lock (iOS-safe) ───
  function lockBody() {
    if (openStack.length === 0) {
      bodyLockScroll = window.scrollY || 0;
      document.body.style.top = -bodyLockScroll + 'px';
      document.body.classList.add('x-bs-lock');
    }
  }
  function unlockBody() {
    if (openStack.length === 0) {
      document.body.classList.remove('x-bs-lock');
      document.body.style.top = '';
      window.scrollTo(0, bodyLockScroll);
    }
  }

  // ─── Get/find sheet ───
  function getSheet(id) {
    return document.getElementById(id);
  }

  // ─── Open ───
  function open(id, opts) {
    opts = opts || {};
    var sheet = getSheet(id);
    if (!sheet) {
      console.warn('[BS] sheet not found:', id);
      return false;
    }
    if (openStack.indexOf(id) !== -1) return true; // already open

    // Ensure class
    if (!sheet.classList.contains('x-bs')) sheet.classList.add('x-bs');

    // Position handle if missing
    if (!sheet.querySelector('.x-bs-handle')) {
      var handle = document.createElement('div');
      handle.className = 'x-bs-handle';
      sheet.insertBefore(handle, sheet.firstChild);
      attachDrag(handle, sheet, id);
    } else if (!sheet.querySelector('.x-bs-handle').dataset.bound) {
      attachDrag(sheet.querySelector('.x-bs-handle'), sheet, id);
    }

    // Snap point
    if (opts.snap) sheet.setAttribute('data-snap', opts.snap);

    // Show backdrop + lock body (chỉ làm khi là sheet đầu tiên)
    var bd = getBackdrop();
    lockBody();
    requestAnimationFrame(function(){
      bd.classList.add('is-open');
      sheet.classList.add('is-open');
      sheet.style.zIndex = 61 + openStack.length;
    });
    openStack.push(id);

    // Callbacks
    if (typeof opts.onOpen === 'function') opts.onOpen(sheet);
    sheet._bsOpts = opts;
    return true;
  }

  // ─── Close ───
  function close(id) {
    var sheet = getSheet(id);
    if (!sheet) return false;
    var idx = openStack.indexOf(id);
    if (idx === -1) return false;

    sheet.classList.remove('is-open');
    openStack.splice(idx, 1);

    if (openStack.length === 0) {
      var bd = getBackdrop();
      bd.classList.remove('is-open');
      setTimeout(function(){ unlockBody(); }, 250);
    }

    // Callback
    if (sheet._bsOpts && typeof sheet._bsOpts.onClose === 'function') {
      sheet._bsOpts.onClose();
    }
    return true;
  }

  // ─── Drag handle (mobile) ───
  function attachDrag(handle, sheet, id) {
    handle.dataset.bound = '1';
    var startY = 0, currentY = 0, dragging = false;

    function onStart(e) {
      // Skip drag trên desktop
      if (window.innerWidth >= 768) return;
      dragging = true;
      var t = e.touches ? e.touches[0] : e;
      startY = t.clientY;
      sheet.classList.add('is-dragging');
      e.preventDefault && e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      var t = e.touches ? e.touches[0] : e;
      currentY = t.clientY - startY;
      if (currentY < 0) currentY = currentY * 0.3; // resistance upward
      sheet.style.transform = 'translateY(' + currentY + 'px)';
    }
    function onEnd() {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove('is-dragging');
      sheet.style.transform = '';
      // Drag down > 100px → close
      if (currentY > 100) close(id);
    }
    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
  }

  // ─── Create temporary sheet ───
  var tempCounter = 0;
  function create(opts) {
    opts = opts || {};
    var id = opts.id || ('x_bs_temp_' + (++tempCounter));
    if (getSheet(id)) {
      console.warn('[BS] sheet id exists:', id);
      return null;
    }
    var sheet = document.createElement('div');
    sheet.id = id;
    sheet.className = 'x-bs';
    if (opts.snap) sheet.setAttribute('data-snap', opts.snap);
    var headerHtml = '';
    if (opts.title) {
      headerHtml = '<div class="x-bs-header"><h3 class="x-bs-title">' + escapeHtml(opts.title) + '</h3></div>';
    }
    var closeBtn = opts.showClose !== false
      ? '<button class="x-bs-close" aria-label="Đóng" data-bs-close="' + id + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>'
      : '';
    sheet.innerHTML =
      '<div class="x-bs-handle"></div>' +
      closeBtn +
      headerHtml +
      '<div class="x-bs-content">' + (opts.html || '') + '</div>';
    document.body.appendChild(sheet);

    // Close button binding
    sheet.querySelectorAll('[data-bs-close]').forEach(function(btn){
      btn.addEventListener('click', function(){ close(id); });
    });

    // Open
    open(id, {
      onClose: function() {
        if (opts.onClose) opts.onClose();
        // Auto cleanup temp sheet
        if (opts.autoCleanup !== false) {
          setTimeout(function(){
            if (sheet && sheet.parentNode) sheet.parentNode.removeChild(sheet);
          }, 400);
        }
      }
    });
    return id;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // ─── Global ESC handler ───
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && openStack.length > 0) {
      close(openStack[openStack.length - 1]);
    }
  });

  // ─── Auto-bind [data-bs-open] buttons ───
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-bs-open]');
    if (btn) {
      e.preventDefault();
      open(btn.getAttribute('data-bs-open'));
    }
    var closer = e.target.closest('[data-bs-close]');
    if (closer && closer.dataset.bsBound !== '1') {
      closer.dataset.bsBound = '1';
      var id = closer.getAttribute('data-bs-close');
      if (id) close(id);
    }
  });

  // ─── Expose ───
  window.x66BottomSheet = { open: open, close: close, create: create };
})();
