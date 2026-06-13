/* ═══════════════════════════════════════════════════════════════
   🛡️ Mục 21: CSRF — auto-inject X-CSRF-Token vào TẤT CẢ fetch() / XHR
   ═══════════════════════════════════════════════════════════════
   Strategy: wrap native fetch + XMLHttpRequest để mọi request POST/PUT/DELETE
   tự động kèm header X-CSRF-Token từ meta tag <meta name="csrf-token">.
   Skip cross-origin requests (chỉ inject same-origin). */
(function(){
  function getCsrfToken() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }
  function isSameOrigin(url) {
    if (!url) return true;
    if (typeof url !== 'string') url = String(url);
    // Relative URL hoặc cùng origin
    if (/^\//.test(url) || url.indexOf('://') === -1) return true;
    try {
      var u = new URL(url, location.href);
      return u.origin === location.origin;
    } catch(e){ return false; }
  }
  // ─── Wrap fetch ───
  var _origFetch = window.fetch;
  if (_origFetch) {
    window.fetch = function(input, init) {
      try {
        var url = (input && input.url) ? input.url : input;
        var method = (init && init.method) ? init.method.toUpperCase() : 'GET';
        if (isSameOrigin(url) && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
          init = init || {};
          init.headers = init.headers || {};
          var tok = getCsrfToken();
          if (tok) {
            // Headers can be Headers obj hoặc plain object
            if (init.headers instanceof Headers) {
              init.headers.set('X-CSRF-Token', tok);
            } else {
              init.headers['X-CSRF-Token'] = tok;
            }
          }
          // Đảm bảo gửi cookie cùng origin
          if (!init.credentials) init.credentials = 'same-origin';
        }
      } catch(e){}
      return _origFetch.call(this, input, init);
    };
  }
  // ─── Wrap XMLHttpRequest ───
  var _origOpen = XMLHttpRequest.prototype.open;
  var _origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._csrfMethod = String(method || '').toUpperCase();
    this._csrfUrl = url;
    return _origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    try {
      var m = this._csrfMethod;
      if (m && m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && isSameOrigin(this._csrfUrl)) {
        var tok = getCsrfToken();
        if (tok) this.setRequestHeader('X-CSRF-Token', tok);
      }
    } catch(e){}
    return _origSend.apply(this, arguments);
  };

  /* === Auto-inject hidden <input name="_csrf"> vào MỌI form POST/PUT/DELETE === */
  function _injectCsrfForms(){
    var m = document.querySelector('meta[name="csrf-token"]');
    var tok = m ? m.getAttribute('content') : '';
    if (!tok) return;
    var forms = document.querySelectorAll('form');
    for (var i=0; i<forms.length; i++){
      var form = forms[i];
      var method = (form.getAttribute('method') || 'GET').toUpperCase();
      if (method === 'GET' || method === 'HEAD') continue;
      if (form.querySelector('input[name="_csrf"]')) continue;
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = '_csrf';
      input.value = tok;
      form.appendChild(input);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _injectCsrfForms);
  } else {
    _injectCsrfForms();
  }
  if (window.MutationObserver) {
    new MutationObserver(_injectCsrfForms).observe(document.documentElement, { childList: true, subtree: true });
  }
})();

/* ===== Sidebar mobile toggle (Tailwind version) ===== */
function toggleSidebar(){
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebarOverlay');
  if (sb) {
    sb.classList.toggle('-translate-x-full');
    sb.classList.toggle('translate-x-0');
  }
  if (ov) {
    ov.classList.toggle('hidden');
  }
  // Lock body scroll when sidebar is open
  if (sb && !sb.classList.contains('-translate-x-full')) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
}

/* ===== Hero banner carousel ===== */
function initHero(){
  const wrap = document.getElementById('heroBanner');
  if(!wrap) return;
  const slides = wrap.querySelectorAll('.hero-slide');
  const dots   = wrap.querySelectorAll('.hero-dots span');
  if(slides.length <= 1) return;
  let i = 0;
  function show(idx){
    slides.forEach((s,k)=>s.style.display = k===idx ? '' : 'none');
    dots.forEach((d,k)=>d.classList.toggle('active', k===idx));
    i = idx;
  }
  dots.forEach((d,k)=>d.addEventListener('click',()=>show(k)));
  show(0);
  setInterval(()=>show((i+1)%slides.length), 5000);
}

/* ===== Chat OLD đã bị thay bằng chat-v2.js =====
 * Các hàm startChat, pushMsg, sendChat, switchChatTab giờ ở chat-v2.js
 * (load SAU app.js trong tw-footer.ejs để override hoàn toàn)
 * Helper escapeHtml vẫn giữ vì có chỗ khác dùng
 */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

/* ===== Player ===== */
function startStream(){
  const ph = document.getElementById('playerPh');
  if(!ph) return;
  const title = ph.dataset.title || 'LIVE';
  ph.outerHTML = `
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,#1a2030,#000) center/cover;display:grid;place-items:center;color:#fff;text-align:center;padding:24px">
      <div>
        <div style="font-size:64px;margin-bottom:8px">📡</div>
        <div style="font-size:20px;font-weight:800;margin-bottom:4px">${title.replace(/[<>]/g,'')}</div>
        <div style="color:#aaa;font-size:13px;margin:10px 0">Stream HD - Bình luận tiếng Việt</div>
        <div style="display:inline-flex;align-items:center;gap:6px;background:#ff3b3b;padding:6px 14px;border-radius:6px;font-weight:800">
          <span style="width:8px;height:8px;background:#fff;border-radius:50%;animation:livepulse 1s infinite"></span> LIVE
        </div>
        <div style="margin-top:14px;color:#888;font-size:12px;max-width:380px">
          (Demo player. Trang thật sẽ tích hợp HLS/M3U8 qua hls.js hoặc nhúng iframe nhà cung cấp.)
        </div>
      </div>
    </div>`;
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', () => {
  initHero();
});


/* ===== Show "Lên sóng (Studio)" menu cho admin/idol/blv only ===== */
(function(){
  function checkStreamerLinks(){
    try {
      var u = JSON.parse(localStorage.getItem('x66_user') || '{}');
      if (!u.username) return;
      // Detect streamer role: admin OR explicit isIdol/isBlv flag
      var name = (u.username || '').toLowerCase();
      var isStreamer = !!(
        u.isAdmin === true || name === 'admin' ||
        u.isIdol === true || u.isBlv === true ||
        u.role === 'idol' || u.role === 'blv' || u.role === 'admin'
      );
      if (isStreamer) {
        document.querySelectorAll('[data-streamer-only]').forEach(function(el){
          el.style.display = '';
        });
      }
    } catch(e){}
  }
  if (document.readyState !== 'loading') checkStreamerLinks();
  else document.addEventListener('DOMContentLoaded', checkStreamerLinks);
  window.addEventListener('storage', checkStreamerLinks);
})();
