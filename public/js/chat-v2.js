/**
 * Chat v2: inline 1-dòng, màu theo user, giới hạn 5 phút/tin nhắn
 * Tự detect context: /idol/ → chat idol fans, còn lại → chat thể thao
 */
(function(){
'use strict';

// ===== CHAT SPORTS (bóng đá / thể thao) =====
var CHAT_SPORTS = [
  { name:'Bo Gia 88',     lvl:88, badge:'CSKH', text:'Anh em vào kèo trên đi nhé!' },
  { name:'Su Tu',         lvl:5,            text:'Phản công nhanh quá' },
  { name:'Tigon',         lvl:10,           text:'Phối hợp ổn đấy' },
  { name:'Thao_CSKH',     lvl:30, badge:'CSKH', text:'Anh em nào cần hỗ trợ nạp tiền inbox em nhé!' },
  { name:'Phuong Hoang',  lvl:6,            text:'Cảm ơn BLV, bình luận hay quá' },
  { name:'Cop Trang',     lvl:7,            text:'Thổi penalty đi trọng tài ơi' },
  { name:'Quang Huy',     lvl:5,            text:'Trận này hay căng đấy ae' },
  { name:'Ca Map',        lvl:10,           text:'Tài 2 trái có ăn không ae?' },
  { name:'Ba Vuong',      lvl:10,           text:'Xoso66 chơi được không anh em?' },
  { name:'Chien Binh',    lvl:8,            text:'Đang đồng tiền cửa trên' },
  { name:'Hen Thi An',    lvl:5,            text:'Đội nhà đá hay quá' },
  { name:'Meo Mun',       lvl:23, badge:'VIP', text:'Có ai ở Hà Nội không cho làm quen' },
  { name:'Chovy',         lvl:61, badge:'VIP', text:'Ui pha bóng đẹp quá' },
  { name:'Bui',           lvl:1,            text:'Xin chào anh em, mới vào phòng' },
  { name:'Rong Vang',     lvl:42, badge:'SVIP', text:'BLV bình luận đỉnh thật' },
  { name:'Tuan Bu',       lvl:99, badge:'SVIP', text:'Boss đến rồi ae, vào kèo theo nhé' },
  { name:'Đậu Đỏ',        lvl:15,           text:'Goal goal goal!!! Bay nóc' },
  { name:'Min Min',       lvl:8,            text:'Pha cản phá xuất sắc của thủ môn' },
  { name:'Long Bạch',     lvl:33, badge:'VIP', text:'Cá độ vui thôi đừng có quá đà ae' },
  { name:'Beck Becks',    lvl:12,           text:'Hôm nay mưa rồi sao đá hay vậy' }
];

// ===== CHAT IDOL (live show idol) =====
var CHAT_IDOL = [
  { name:'Phong Vũ',      lvl:88, badge:'SVIP', text:'Em xinh quá! Tặng em bó hoa nhé 💐' },
  { name:'Tý Cute',       lvl:5,            text:'Hôm nay em mặc váy hồng dễ thương ghê' },
  { name:'Ếch Xanh',      lvl:10,           text:'Em hát bài Lạc Trôi đi em ơi' },
  { name:'Bo Gia 88',     lvl:88, badge:'CSKH', text:'Anh em ủng hộ idol bằng X COIN nhé!' },
  { name:'Mèo Lười',      lvl:7,            text:'Giọng em ấm dã man' },
  { name:'Hắc Báo',       lvl:30, badge:'VIP', text:'Em cho xin info Telegram được không' },
  { name:'Bin Bin',       lvl:3,            text:'Lần đầu vào phòng em, dễ thương quá' },
  { name:'Sói Đầu Đàn',   lvl:42, badge:'SVIP', text:'Tặng em chiếc nhẫn nha 💍' },
  { name:'Cờ Hó',         lvl:8,            text:'Em ơi nhìn camera đi em' },
  { name:'Ngọc Trinh Fan',lvl:15,           text:'Phòng đông quá, ủng hộ chị nhé' },
  { name:'Long Lanh',     lvl:23, badge:'VIP', text:'Em hát hay quá, anh thả tim 1000 cái 💖' },
  { name:'Su Su',         lvl:5,            text:'Chị ơi cho em xin số phòng riêng đi ạ' },
  { name:'Heo Mập',       lvl:12,           text:'Sao em cười đáng yêu vậy nè 😍' },
  { name:'Hổ Báo',        lvl:61, badge:'VIP', text:'Tặng em du thuyền đi, ai chơi cùng anh nào' },
  { name:'Bí Đỏ',         lvl:9,            text:'Nay đi đâu mà make-up xinh thế em' },
  { name:'Lý Tiểu Long',  lvl:99, badge:'SVIP', text:'Show riêng đi em, boss đến rồi 👑' },
  { name:'Tâm Sự Hài',    lvl:18,           text:'Cho em quay TikTok với chị được không' },
  { name:'Đậu Phộng',     lvl:6,            text:'Em cười đỉnh quá, ngày nào cũng vào xem' },
  { name:'Mộc Lan',       lvl:11,           text:'Chị mở bài Hoa Nở Không Màu đi ạ' },
  { name:'Tony Stark',    lvl:33, badge:'VIP', text:'Em đẹp như siêu mẫu vậy đó, anh follow rồi nha' },
  { name:'Linh Hoa',      lvl:7,            text:'Phòng vui ghê, ngày nào cũng có em là vui' },
  { name:'Chiến Thần',    lvl:50, badge:'SVIP', text:'Anh là khách quen rồi nha, em nhớ anh không' },
  { name:'Tuyết Bông',    lvl:14,           text:'Em hôm nay xinh hơn hôm qua nữa á' },
  { name:'Vũ Trụ',        lvl:45, badge:'VIP', text:'Top tipper hôm nay đâu rồi, ra mặt đi 🏆' },
  { name:'Bé Mỡ',         lvl:4,            text:'Em ơi em đang ở đâu vậy' },
  { name:'Trà Sữa',       lvl:22,           text:'Em uống trà sữa với em luôn đi 🧋' }
];

// Detect context dựa trên URL
function detectChatMode(){
  if (location.pathname.indexOf('/idol/') === 0 || location.pathname === '/idol-live') return 'idol';
  return 'sports';
}
function getMsgPool(){ return detectChatMode() === 'idol' ? CHAT_IDOL : CHAT_SPORTS; }

// ===== Màu hash từ tên =====
function colorFromName(name){
  var h = 0;
  for (var i=0; i<name.length; i++) h = (h*31 + name.charCodeAt(i)) & 0xffff;
  var hue = h % 360;
  return 'hsl(' + hue + ', 75%, 65%)';
}

function lvlBadgeColor(lvl, badge){
  if (badge === 'CSKH') return 'linear-gradient(135deg,#27ae60,#16a085)';
  if (badge === 'SVIP') return 'linear-gradient(135deg,#e91e63,#8e44ad)';
  if (badge === 'VIP')  return 'linear-gradient(135deg,#f1c40f,#e67e22)';
  if (lvl >= 50) return 'linear-gradient(135deg,#9b59b6,#3498db)';
  if (lvl >= 20) return 'linear-gradient(135deg,#f39c12,#e67e22)';
  if (lvl >= 10) return 'linear-gradient(135deg,#1abc9c,#16a085)';
  return 'linear-gradient(135deg,#7f8c8d,#34495e)';
}

function nowHHMM(){
  var d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function esc(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c];
  });
}

function pushMsg(container, m){
  var nameColor = colorFromName(m.name);
  var lvlBg = lvlBadgeColor(m.lvl, m.badge);
  var time = m.time || nowHHMM();

  var el = document.createElement('div');
  el.className = 'msg-row';
  // Inline style để đảm bảo render đúng dù Tailwind CDN không scan JS template
  el.style.cssText = 'display:block;padding:5px 10px;border-left:2px solid ' + nameColor +
    ';font-size:13px;line-height:1.4;color:#e5e7eb;word-break:break-word;';

  var lvlHtml = '<span style="display:inline-block;vertical-align:middle;min-width:22px;height:16px;line-height:16px;padding:0 6px;border-radius:4px;color:#fff;font-size:10px;font-weight:800;text-align:center;background:' + lvlBg + ';margin-right:5px">' + m.lvl + '</span>';
  var cskhHtml = m.badge === 'CSKH'
    ? '<span style="display:inline-block;vertical-align:middle;background:#16a34a;color:#fff;font-size:9px;font-weight:800;padding:1px 5px;border-radius:3px;margin-right:5px">CSKH</span>'
    : '';
  var nameHtml = '<span style="font-weight:800;color:' + nameColor + ';margin-right:6px">' + esc(m.name) + ':</span>';
  var textHtml = '<span style="color:#e5e7eb">' + esc(m.text) + '</span>';
  var timeHtml = '<span style="float:right;color:#6b7280;font-size:10px;font-variant-numeric:tabular-nums;margin-left:6px">' + time + '</span>';

  // Layout 1 dòng: [LVL] [CSKH?] Name: Text                 HH:MM
  el.innerHTML = timeHtml + lvlHtml + cskhHtml + nameHtml + textHtml;

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  while (container.children.length > 100) container.removeChild(container.firstChild);
}

// ===== Rate limit =====
var GUEST_COOLDOWN_MS  = 5 * 60 * 1000;
var MEMBER_COOLDOWN_MS = 3 * 1000;
var LAST_KEY = 'x66_chat_last';
var USER_KEY = 'x66_user';
var cdTimer = null;

function isLoggedIn(){
  try { var u = localStorage.getItem(USER_KEY); if (!u) return false; var p = JSON.parse(u); return !!(p && p.username); } catch(e){ return false; }
}
function getCurrentUser(){
  try { var u = localStorage.getItem(USER_KEY); return u ? JSON.parse(u) : null; } catch(e){ return null; }
}
function lastSentAt(){
  try { return parseInt(localStorage.getItem(LAST_KEY) || '0', 10) || 0; } catch(e){ return window.__x66LastChat || 0; }
}
function markSent(){
  var t = Date.now();
  try { localStorage.setItem(LAST_KEY, String(t)); } catch(e){ window.__x66LastChat = t; }
}
function getCooldownMs(){ return isLoggedIn() ? MEMBER_COOLDOWN_MS : GUEST_COOLDOWN_MS; }
function remainingMs(){ return Math.max(0, getCooldownMs() - (Date.now() - lastSentAt())); }
function fmtMmSs(ms){
  var s = Math.ceil(ms/1000); var m = Math.floor(s/60), ss = s%60;
  return m + ':' + String(ss).padStart(2,'0');
}

function applyCooldownUi(inputId, btnId, hintId){
  var input = document.getElementById(inputId);
  var btn   = document.getElementById(btnId);
  var hint  = document.getElementById(hintId);
  if (!input || !btn) return;
  var logged = isLoggedIn();
  var u      = getCurrentUser();
  var rem    = remainingMs();

  if (rem > 0) {
    input.disabled = true;
    btn.disabled = true;
    input.placeholder = logged ? 'Chờ ' + Math.ceil(rem/1000) + 's...' : 'Chờ ' + fmtMmSs(rem) + ' để gửi tin nhắn tiếp theo...';
    btn.textContent = logged ? Math.ceil(rem/1000)+'s' : fmtMmSs(rem);
    btn.className = 'bg-bg-deep text-muted px-4 rounded-md font-bold text-xs min-w-[64px] tabular-nums cursor-not-allowed';
    if (hint) hint.innerHTML = logged
      ? '&#9989; Thành viên <b class="text-pri-light">'+u.username+'</b> - chờ '+ Math.ceil(rem/1000) +'s'
      : '&#128274; Khách giới hạn 1 tin / 5 phút. Còn: '+ fmtMmSs(rem) +' &middot; <a href="/dang-ky" class="text-pri-light underline">Đăng ký để chat không giới hạn</a>';
    if (!cdTimer) cdTimer = setInterval(function(){ applyCooldownUi(inputId, btnId, hintId); }, 1000);
  } else {
    input.disabled = false;
    btn.disabled = false;
    input.placeholder = logged ? 'Chat với tư cách '+u.username+'...' : 'Gõ tin nhắn...';
    btn.textContent = 'Gửi';
    btn.className = 'bg-gradient-to-br from-pri to-live text-white px-4 rounded-md font-bold text-xs min-w-[64px]';
    if (hint) hint.innerHTML = logged
      ? '&#9989; <b class="text-emerald-400">Thành viên</b> '+u.username+' &middot; chat không giới hạn thời gian'
      : '&#128274; <b class="text-pri-light">Khách giới hạn 1 tin / 5 phút</b> &middot; <a href="/dang-ky" class="text-pri-light underline">Đăng ký để chat không giới hạn</a>';
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
  }
}

// ===== Public API =====
window.startChat = function(containerId, opts){
  var c = document.getElementById(containerId);
  if (!c) return;
  opts = opts || {};
  // isLive = false → KHONG spawn bot, chi hien thi message phong chua live
  var isLive = (opts.isLive !== false); // mac dinh true neu khong truyen
  var pool = opts.mode === 'idol' ? CHAT_IDOL : opts.mode === 'sports' ? CHAT_SPORTS : getMsgPool();
  var mode = pool === CHAT_IDOL ? 'idol' : 'sports';

  var sys = document.createElement('div');
  sys.className = 'px-3 py-2 my-1 bg-pri/10 border border-dashed border-pri/40 rounded text-pri-light text-[11px] font-semibold text-center';

  if (!isLive) {
    // KHONG live → hien thong bao + KHONG spawn bot
    sys.className = 'px-3 py-3 my-1 bg-bg-soft border border-dashed border-line rounded text-muted text-[12px] font-semibold text-center';
    sys.innerHTML = '🔇 <b class="text-white">Phòng chưa lên sóng</b><br>'+
                    '<span class="text-[11px]">BLV/Idol chưa kết nối OBS. Chat sẽ hoạt động khi phòng phát sóng.</span>';
    c.appendChild(sys);
    // Disable chat input
    var input = document.getElementById('chatInput');
    var btn   = document.getElementById('chatBtn');
    var hint  = document.getElementById('chatHint');
    if (input) { input.disabled = true; input.placeholder = 'Phòng chưa lên sóng...'; }
    if (btn)   { btn.disabled = true; btn.textContent = '🔇'; btn.className = 'bg-bg-deep text-muted px-4 rounded-md font-bold text-xs cursor-not-allowed'; }
    if (hint)  { hint.innerHTML = '🔇 Chat tạm dừng vì phòng chưa lên sóng'; }
    return;
  }

  // Live OK → welcome + spawn bot
  sys.innerHTML = mode === 'idol'
    ? '🎀 Chào mừng bạn đến phòng idol! Bình luận lịch sự, không tục tĩu. Tặng quà để được idol để ý 💝'
    : '🔔 Chào mừng bạn đến phòng! Vui lòng bình luận văn minh. Khách giới hạn 1 tin / 5 phút.';
  c.appendChild(sys);
  for (var i=0;i<6;i++) pushMsg(c, pool[Math.floor(Math.random()*pool.length)]);
  setInterval(function(){
    var p = opts.mode === 'idol' ? CHAT_IDOL : opts.mode === 'sports' ? CHAT_SPORTS : getMsgPool();
    pushMsg(c, p[Math.floor(Math.random()*p.length)]);
  }, 1800 + Math.random()*2400);
  applyCooldownUi('chatInput', 'chatBtn', 'chatHint');
};

window.sendChat = function(inputId, containerId){
  var input = document.getElementById(inputId);
  var c = document.getElementById(containerId);
  if (!input || !c) return;
  var text = (input.value || '').trim();
  if (!text) return;
  if (text.length > 200) text = text.slice(0, 200);

  var rem = remainingMs();
  if (rem > 0) {
    var logged = isLoggedIn();
    var msg = logged ? 'Chờ ' + Math.ceil(rem/1000) + 's...' : 'Khách giới hạn 1 tin / 5 phút. Chờ ' + fmtMmSs(rem) + ' hoặc đăng ký tài khoản';
    if (typeof showToast === 'function') showToast(msg, 'error'); else alert(msg);
    return;
  }

  var u = getCurrentUser();
  var name  = u ? (u.fullname || u.username) : 'Khách' + (Math.random()*9000|0+1000);
  var lvl   = u ? (u.vip || 1) : 0;
  var badge = u && u.vip >= 3 ? 'SVIP' : u && u.vip >= 1 ? 'VIP' : '';

  pushMsg(c, { name: name, lvl: lvl, badge: badge, text: text });
  input.value = '';
  markSent();
  applyCooldownUi(inputId, 'chatBtn', 'chatHint');
};

window.setLoggedInUser = function(user){ try { localStorage.setItem(USER_KEY, JSON.stringify(user || {})); } catch(e){} };
window.logoutChatUser  = function(){ try { localStorage.removeItem(USER_KEY); } catch(e){} };

window.switchChatTab = function(btn){
  document.querySelectorAll('.chat-tab').forEach(function(b){
    b.classList.remove('bg-bg-card','text-pri-light','border-pri');
    b.classList.add('bg-transparent','text-muted','border-transparent');
  });
  btn.classList.remove('bg-transparent','text-muted','border-transparent');
  btn.classList.add('bg-bg-card','text-pri-light','border-pri');
};

if (typeof window.showToast !== 'function') {
  window.showToast = function(msg, kind){
    var t = document.createElement('div');
    var col = kind==='error' ? '#ff3b3b' : kind==='success' ? '#27ae60' : '#ff7a18';
    t.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#161a22;color:#fff;padding:10px 16px;border-radius:8px;border-left:4px solid '+col+';z-index:9999;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.4);';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3500);
  };
}

window.startStream = window.startStream || function(){
  var ph = document.getElementById('playerPh');
  if (!ph) return;
  var title = ph.dataset.title || 'LIVE';
  ph.outerHTML = '<div style="position:absolute;inset:0;background:linear-gradient(135deg,#1a2030,#000);display:grid;place-items:center;color:#fff;text-align:center;padding:24px"><div><div style="font-size:64px;margin-bottom:8px">&#128225;</div><div style="font-size:20px;font-weight:800;margin-bottom:4px">'+title+'</div><div style="color:#aaa;font-size:13px;margin:10px 0">Stream HD - Bình luận tiếng Việt</div><div style="display:inline-flex;align-items:center;gap:6px;background:#ff3b3b;padding:6px 14px;border-radius:6px;font-weight:800"><span style="width:8px;height:8px;background:#fff;border-radius:50%;animation:pulse-live 1s infinite"></span> LIVE</div></div></div>';
};

})();
