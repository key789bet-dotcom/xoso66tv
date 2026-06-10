/**
 * Anti-inspect v1 - chặn F12, right-click, view source và detect DevTools
 *
 * Lưu ý: KHÔNG bảo mật tuyệt đối - chỉ làm khó người tò mò.
 * Logic nhạy cảm phải để ở server-side.
 *
 * BYPASS: admin/dev có thể bypass bằng query ?dev=1 → set localStorage 'x66_devmode'
 */
(function(){
  'use strict';

  // ────── BYPASS cho admin/dev ──────
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get('dev') === '1') localStorage.setItem('x66_devmode', '1');
    if (qs.get('dev') === '0') localStorage.removeItem('x66_devmode');
    if (localStorage.getItem('x66_devmode') === '1') {
      console.log('%c[XOSO66] Dev mode ON - anti-inspect disabled', 'color:#0f0;font-weight:bold');
      return;
    }
  } catch(e){}

  // ────── 1. Disable right-click context menu ──────
  document.addEventListener('contextmenu', function(e){
    // Cho phép right-click trên input/textarea để paste
    var tag = (e.target && e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    return false;
  }, true);

  // ────── 2. Chặn phím tắt DevTools ──────
  document.addEventListener('keydown', function(e){
    var key = e.key || '';
    var code = e.keyCode || 0;

    // F12
    if (code === 123 || key === 'F12') { e.preventDefault(); return false; }

    // Ctrl+Shift+I (Inspector) / J (Console) / C (Element picker)
    if (e.ctrlKey && e.shiftKey && (key === 'I' || key === 'J' || key === 'C' ||
                                     code === 73 || code === 74 || code === 67)) {
      e.preventDefault(); return false;
    }

    // Ctrl+U (View source)
    if (e.ctrlKey && (key === 'u' || key === 'U' || code === 85)) {
      e.preventDefault(); return false;
    }

    // Ctrl+S (Save page)
    if (e.ctrlKey && (key === 's' || key === 'S' || code === 83)) {
      // Cho phép save khi đang ở admin
      if (location.pathname.indexOf('/admin') !== 0) {
        e.preventDefault(); return false;
      }
    }

    // Cmd+Opt+I/J (Mac Safari/Chrome)
    if (e.metaKey && e.altKey && (key === 'I' || key === 'J' || code === 73 || code === 74)) {
      e.preventDefault(); return false;
    }
  }, true);

  // ────── 3. Disable text selection ở các element nhạy cảm ──────
  // (tắt - vì cản trở user copy text bình thường. Để minh hoạ thôi)
  // document.body.style.userSelect = 'none';

  // ────── 4. Detect DevTools opened ──────
  // Trick: window.outerWidth - innerWidth > 200 = DevTools đang mở
  var __devtoolsOpened = false;
  var __warnedDevtools = false;

  function checkDevTools(){
    var widthDiff  = window.outerWidth  - window.innerWidth;
    var heightDiff = window.outerHeight - window.innerHeight;
    // Threshold 160px (DevTools docked) - undocked window không detect được
    var opened = widthDiff > 200 || heightDiff > 200;

    if (opened && !__devtoolsOpened) {
      __devtoolsOpened = true;
      onDevToolsOpen();
    } else if (!opened && __devtoolsOpened) {
      __devtoolsOpened = false;
    }
  }

  function onDevToolsOpen(){
    if (__warnedDevtools) return;
    __warnedDevtools = true;
    // Hành động khi phát hiện: clear console + warn (KHÔNG redirect mạnh tay để tránh annoy)
    try { console.clear(); } catch(e){}
    try {
      console.log('%c⚠️ DỪNG LẠI!', 'color:red;font-size:36px;font-weight:bold;text-shadow:2px 2px 4px #000');
      console.log('%cĐây là tính năng dành cho developer.', 'color:#f97316;font-size:16px;font-weight:bold');
      console.log('%cNếu ai đó bảo bạn dán code vào đây để "hack tài khoản" hoặc "nhận quà" → đó là LỪA ĐẢO. Tài khoản của bạn sẽ bị mất.', 'color:#ef4444;font-size:14px');
      console.log('%cĐóng cửa sổ này để tiếp tục sử dụng XOSO66 TV.', 'color:#94a3b8;font-size:12px');
    } catch(e){}
  }

  // Check liên tục mỗi 1s (nhẹ, không ảnh hưởng perf)
  setInterval(checkDevTools, 1000);
  // Check ngay khi resize (mở docked DevTools làm resize)
  window.addEventListener('resize', checkDevTools);

  // ────── 5. Anti-debugger (đẩy DevTools chậm khi mở Sources tab) ──────
  // Tắt vì gây giật khi user dùng extension/tab nhiều. Bật nếu cần mạnh tay hơn:
  // setInterval(function(){ debugger; }, 100);

  // ────── 6. Disable drag-save image (cản tay nhẹ) ──────
  document.addEventListener('dragstart', function(e){
    var tag = (e.target && e.target.tagName || '').toUpperCase();
    if (tag === 'IMG') { e.preventDefault(); return false; }
  });

  // ────── 7. Clear console khi load (xoá log trước đó) ──────
  try { console.clear(); } catch(e){}
})();
