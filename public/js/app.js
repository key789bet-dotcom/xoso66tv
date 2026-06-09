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
