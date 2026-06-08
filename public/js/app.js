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

/* ===== Chat realtime giả lập ===== */
const CHAT_MSGS = [
  { name:'Bố Già 88', lvl:88, vip:'svip', text:'Vào kèo trên đi anh em ơi!' },
  { name:'Hên Thì Ăn', lvl:5,  vip:'', text:'Đội nhà đá hay quá' },
  { name:'Mèo Mun',    lvl:23, vip:'vip', text:'Có ai HN ko' },
  { name:'Chovy',      lvl:61, vip:'vip', text:'Úi kiki, ngon đó' },
  { name:'Bụi',        lvl:1,  vip:'', text:'Mới vào diễn đàn xin chào ae' },
  { name:'Rồng Vàng',  lvl:42, vip:'svip', text:'BLV bình luận hay quá' },
  { name:'Tài xỉu',    lvl:21, vip:'vip', text:'Tài tài tài, vào rồi' },
  { name:'Đỏ Ăn Tất',  lvl:33, vip:'svip', text:'Nạp 500 cho con này' },
  { name:'Cu Tin',     lvl:14, vip:'', text:'Trận này thơm phết' },
  { name:'Lộc Phát',   lvl:7,  vip:'', text:'Đặt cược thử coi' },
  { name:'Tuấn Bự',    lvl:99, vip:'svip', text:'Boss đến rồi nhé ae' },
  { name:'Ngọc Trinh', lvl:8,  vip:'', text:'Trận sau mấy giờ vậy ae' },
  { name:'BLV Quang Huy', lvl:50, vip:'svip', text:'Hiệp 1 đá rất hay từ 2 đội' },
  { name:'Thánh Soi',  lvl:18, vip:'vip', text:'Kèo trên ăn chắc kèo này' },
  { name:'Hoàng Hổ',   lvl:27, vip:'vip', text:'1-0 nhé bro, đặt rồi' },
];
const CHAT_COLORS = ['#ff7a18','#27ae60','#3498db','#e91e63','#f1c40f','#9b59b6','#1abc9c','#e67e22'];

function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

function pushMsg(c, m){
  const el = document.createElement('div');
  el.className = 'msg' + (m.system ? ' system' : '');
  if(m.system){
    el.innerHTML = `<div class="content">📢 ${escapeHtml(m.text)}</div>`;
  } else {
    const color = CHAT_COLORS[m.name.charCodeAt(0)%CHAT_COLORS.length];
    el.innerHTML = `
      <div class="av" style="background:${color}">${escapeHtml(m.name[0])}</div>
      <div class="content">
        <span class="lvl ${m.vip||''}">${m.lvl}</span>
        <span class="name">${escapeHtml(m.name)}</span>${escapeHtml(m.text)}
      </div>`;
  }
  c.appendChild(el);
  c.scrollTop = c.scrollHeight;
  while(c.children.length > 80) c.removeChild(c.firstChild);
}

function startChat(id){
  const c = document.getElementById(id);
  if(!c) return;
  // System welcome
  pushMsg(c, { system:true, text:'Chào mừng bạn đến phòng livestream. Vui lòng tuân thủ nội quy cộng đồng.' });
  // Khởi đầu vài tin
  for(let i=0;i<6;i++) pushMsg(c, CHAT_MSGS[Math.floor(Math.random()*CHAT_MSGS.length)]);
  // Tự sinh
  setInterval(()=>pushMsg(c, CHAT_MSGS[Math.floor(Math.random()*CHAT_MSGS.length)]), 1800 + Math.random()*2400);
  // Banner promo định kỳ
  setInterval(()=>pushMsg(c, { system:true, text:'🎁 Nạp lần đầu nhận 100% thưởng - Click xoso66tv.com' }), 30000);
}

function sendChat(inputId, containerId){
  const input = document.getElementById(inputId);
  const c     = document.getElementById(containerId);
  const text  = (input.value||'').trim();
  if(!text) return;
  pushMsg(c, { name:'Bạn', lvl:1, vip:'', text });
  input.value = '';
}

function switchChatTab(btn){
  document.querySelectorAll('.chat-tabs button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

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
