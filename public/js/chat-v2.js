/**
 * Chat v2.1: Bot chat tự nhiên với phân bố message types
 * - 40% nhảm, 20% reply, 15% troll, 10% hỏi, 10% emoji, 5% dài
 * - Layout phẳng, không có bars màu phân cách
 */
(function(){
'use strict';

// ===== POOL TÊN BOT =====
var NAMES_IDOL = [
  { n:'Phong Vũ',      l:88, b:'SVIP' },
  { n:'Tý Cute',       l:5,  b:'' },
  { n:'Ếch Xanh',      l:10, b:'' },
  { n:'Bo Gia 88',     l:88, b:'CSKH' },
  { n:'Mèo Lười',      l:7,  b:'' },
  { n:'Hắc Báo',       l:30, b:'VIP' },
  { n:'Bin Bin',       l:3,  b:'' },
  { n:'Sói Đầu Đàn',   l:42, b:'SVIP' },
  { n:'Cờ Hó',         l:8,  b:'' },
  { n:'Ngọc Trinh Fan',l:15, b:'' },
  { n:'Long Lanh',     l:23, b:'VIP' },
  { n:'Su Su',         l:5,  b:'' },
  { n:'Heo Mập',       l:12, b:'' },
  { n:'Hổ Báo',        l:61, b:'VIP' },
  { n:'Bí Đỏ',         l:9,  b:'' },
  { n:'Lý Tiểu Long',  l:99, b:'SVIP' },
  { n:'Tâm Sự Hài',    l:18, b:'' },
  { n:'Đậu Phộng',     l:6,  b:'' },
  { n:'Mộc Lan',       l:11, b:'' },
  { n:'Tony Stark',    l:33, b:'VIP' },
  { n:'Linh Hoa',      l:7,  b:'' },
  { n:'Chiến Thần',    l:50, b:'SVIP' },
  { n:'Tuyết Bông',    l:14, b:'' },
  { n:'Vũ Trụ',        l:45, b:'VIP' },
  { n:'Bé Mỡ',         l:4,  b:'' },
  { n:'Trà Sữa',       l:22, b:'' },
  { n:'Min Min',       l:8,  b:'' },
  { n:'Beck Becks',    l:12, b:'' },
  { n:'Bê Đê',         l:6,  b:'' },
  { n:'Lan Ngọc',      l:19, b:'' },
  { n:'Chí Phèo',      l:7,  b:'' },
  { n:'Ổi Xanh',       l:11, b:'' }
];

var NAMES_SPORTS = [
  { n:'Bo Gia 88',     l:88, b:'CSKH' },
  { n:'Sư Tử',         l:5,  b:'' },
  { n:'Cọp Trắng',     l:7,  b:'' },
  { n:'Thao_CSKH',     l:30, b:'CSKH' },
  { n:'Phượng Hoàng',  l:6,  b:'' },
  { n:'Quang Huy',     l:5,  b:'' },
  { n:'Cá Mập',        l:10, b:'' },
  { n:'Bá Vương',      l:10, b:'' },
  { n:'Chiến Binh',    l:8,  b:'' },
  { n:'Hên Thì Ăn',    l:5,  b:'' },
  { n:'Mèo Mun',       l:23, b:'VIP' },
  { n:'Chovy',         l:61, b:'VIP' },
  { n:'Bụi',           l:1,  b:'' },
  { n:'Rồng Vàng',     l:42, b:'SVIP' },
  { n:'Tuấn Bự',       l:99, b:'SVIP' },
  { n:'Đậu Đỏ',        l:15, b:'' },
  { n:'Long Bạch',     l:33, b:'VIP' },
  { n:'Tigon',         l:10, b:'' },
  { n:'Min Min',       l:8,  b:'' },
  { n:'Beck Becks',    l:12, b:'' }
];

// ===== MESSAGE POOLS THEO TYPE =====
// 40% NHẢM - chat vô nghĩa, lấp khoảng trống
var MSG_NHAM = [
  'hihi','haha','ke ke ke','lol','ờm','huhu','ụa','ơ kìa','éo hiểu',
  'tự nhiên thấy chán','khó hiểu thật','tới luôn','ăn cơm chưa cả nhà',
  'lạc trôi','vô tri','vô nghĩa thật','đỉnh nóc','căng thẳng',
  'gì cơ','sao tự nhiên','ờ ờ ờ','ừ thì','hmm','huk huk','hí hí',
  'bay nóc','mạnh mẽ vào','ráng lên','full hp','chát chúa',
  'cay quá','đỡ không nổi','xỉu lên xỉu xuống','khóc thét','xám hồn',
  'sấp mặt','ngáo ngơ','xuất sắc','ờ ờ','ừm hề','vâng ạ','dạ vâng',
  'thôi rồi','xong phim','chán đời','vui ghê','dz nhỉ','xịn xò',
  'điên à','tỉnh chưa','chuyện gì vậy ta','khó đỡ','quá đỉnh',
  'nói chung là','dù sao thì','tóm lại','nghĩa là','về cơ bản',
  'ờ thì cũng được','tạm chấp nhận','nuốt không trôi','khó nuốt'
];

// 20% REPLY - trả lời nhau (có @tên hoặc agree/disagree)
var MSG_REPLY = [
  'chuẩn','đúng rồi đó','sai sai gì kìa','không phải nhé',
  'thật đó hả','t cũng nghĩ vậy','t khác','sao mà sai được',
  'ơ thật á','xạo lol','đùa à','thật mà','100%','chắc chắn',
  'nghi thật','khả thi','vô lý','có lý đó','đồng ý',
  'phản đối','tán thành','đúng vậy đó','sai bét','xàm vlc',
  'chính xác','nói rất hay','quá đúng','nhảm thế','hỏi hay đó',
  'trả lời đi b','nói tiếp đi','kể tiếp đi','rồi sao nữa',
  'tin được không','khó tin nhỉ','thật á','wow nice','đỉnh thật',
  'ai cũng biết mà','xưa rồi','mới biết','vừa biết','bất ngờ ghê'
];

// 15% TROLL nhẹ
var MSG_TROLL = [
  'gà thế','non quá','ngơ ngác','nhìn đã chán','nói nhảm',
  'chém gió','phét đó','xạo lùa gà','nói phét','vớ vẩn',
  'éo tin','xàm xí','tào lao','dở hơi','khùng à',
  'bị gì vậy','tỉnh chưa','tỉnh đi cha','mơ à','thôi đi',
  'dừng lại','im đi','hiu hiu','flop rồi','out đi',
  'thua xa','kém quá','non choẹt','ngáo đá','rảnh quá',
  'nghỉ chơi','ngu thế','xàm vl','đùa à','chịu thua',
  'thôi xin','dạ vâng','dạ thưa','vâng vâng','ờ ờ',
  'điên thật','khùng nặng','tinh thần ổn k','bị ma làm à'
];

// 10% HỎI linh tinh
var MSG_HOI = [
  'mấy giờ rồi','ai HN k','ai SG k','ai DN k','ai HP k',
  'còn ai online k','ai chưa ngủ','ai ăn cơm chưa','ăn gì giờ này',
  'phòng này hay k','idol này ai biết','ai vào lâu chưa','mới hay cũ',
  'nay sinh nhật ai','t đến muộn k','xảy ra gì vậy','vừa nói gì t k nghe',
  'làm sao để vip','nạp ở đâu','rút sao','có khuyến mãi k',
  'ai bjt cách nạp','ai chỉ với','idol khi nào off','mai có live k',
  'bao giờ end','sao đông thế','admin đâu','mod đâu','cskh đâu',
  'có app k','tải ở đâu','link xoso66 đâu','code free đâu','quà ngon k'
];

// 10% EMOJI / ngắn
var MSG_EMOJI = [
  '😂😂😂','🤣🤣🤣','😍😍','❤️❤️❤️','🔥🔥🔥',
  '👏👏👏','💯','🙏🙏','✨✨','💖💖💖',
  '🥰🥰','😘😘','🎉🎉','🌹🌹🌹','💐',
  '🤡','😅','😭😭','🥺','🤯',
  'wow','nice','gg','op','imba',
  '+1','=))','sad','xinh','đẹp',
  'auto','top','best','no.1','vip',
  '🍻🍻','🍺','🎁','💎','👑'
];

// 5% CÂU DÀI bất chợt
var MSG_DAI = [
  'Thực sự thì tôi không hiểu sao mọi người lại tranh cãi vấn đề này, ai thấy hợp lý thì follow theo thôi',
  'Tôi đã theo dõi phòng này từ những ngày đầu rồi, càng ngày càng đông và idol cũng càng ngày càng xinh',
  'Nói thật là hôm nay tôi đặt cược thua sml, ai có mẹo gì hay chia sẻ cho anh em với, đặt cái nào trúng cái đó luôn',
  'Trận đấu vừa rồi gay cấn thật sự, mất ngủ luôn vì kèo, may mà có BLV vào bình luận kịp nên xem được đến cuối',
  'Ai đã từng nạp xoso66 lần đầu rồi cho mình hỏi khuyến mãi 100% có dễ làm vòng cược không, hay là phải trade nhiều ngày',
  'Hôm nay phòng vui quá mọi người, lâu lắm mới có dịp chill với mấy anh em, hứng lên là tới luôn không cần lý do',
  'Mình mới phát hiện ra cái mini game tài xỉu trong xoso66tv khá hay, ai chơi rồi share kinh nghiệm với, đặt sao cho an toàn',
  'Idol ơi cho em xin info Telegram được không em, hứa không spam đâu, chỉ muốn theo dõi và ủng hộ thôi mà em',
  'Mọi người có ai biết khi nào mới có giải đấu lớn không, mình muốn đặt mạnh tay xem có lên đời được không nha',
  'Tôi vào phòng từ chiều mà giờ vẫn còn online, idol talk hay quá không nỡ tắt máy luôn các bác ạ'
];

// ===== Trộn pool với trọng số =====
function makePool(){
  var pool = [];
  function push(arr, n){ for (var i=0;i<n;i++) pool.push(arr[Math.floor(Math.random()*arr.length)]); }
  push(MSG_NHAM,  40);
  push(MSG_REPLY, 20);
  push(MSG_TROLL, 15);
  push(MSG_HOI,   10);
  push(MSG_EMOJI, 10);
  push(MSG_DAI,    5);
  return pool;
}

function detectChatMode(){
  if (location.pathname.indexOf('/idol/') === 0 || location.pathname === '/idol-live') return 'idol';
  return 'sports';
}

function getNamePool(mode){ return mode === 'idol' ? NAMES_IDOL : NAMES_SPORTS; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// Tạo 1 message random
function genMsg(mode, lastNames){
  var name = pick(getNamePool(mode));
  var pool = makePool();
  var text = pick(pool);

  // Nếu text là reply mà có nhiều người chat trước → prepend @tên
  if (MSG_REPLY.indexOf(text) > -1 && lastNames.length && Math.random() < 0.5){
    var prev = lastNames[Math.floor(Math.random()*lastNames.length)];
    if (prev !== name.n) text = '@' + prev.split(' ')[0] + ' ' + text;
  }

  return { name:name.n, lvl:name.l, badge:name.b, text:text };
}

// ===== Màu hash theo tên =====
function colorFromName(name){
  var h = 0;
  for (var i=0; i<name.length; i++) h = (h*31 + name.charCodeAt(i)) & 0xffff;
  return 'hsl(' + (h % 360) + ', 80%, 70%)';
}

/* ════ Level tier — 12 cấp xịn xò, dùng class CSS từ /static/css/level-badges.css ════ */
function getLevelTierClass(lvl, badge){
  if (badge === 'CSKH') return 'lv-cskh';
  if (badge === 'VIP' || badge === 'SVIP' || badge === 'ADMIN' || badge === 'BLV' || badge === 'IDOL') return 'lv-vip';
  var n = parseInt(lvl, 10) || 1;
  if (n >= 100) return 'lv-tier11';
  if (n >= 90)  return 'lv-tier10';
  if (n >= 80)  return 'lv-tier9';
  if (n >= 70)  return 'lv-tier8';
  if (n >= 60)  return 'lv-tier7';
  if (n >= 50)  return 'lv-tier6';
  if (n >= 40)  return 'lv-tier5';
  if (n >= 30)  return 'lv-tier4';
  if (n >= 20)  return 'lv-tier3';
  if (n >= 10)  return 'lv-tier2';
  return 'lv-tier1';
}

/* ════ Message row tier class — phân biệt VIP/SVIP/CSKH + 11 tier LV ════ */
function getMsgRowClass(lvl, badge){
  if (badge === 'SVIP') return 'msg-svip';
  if (badge === 'VIP')  return 'msg-vip';
  if (badge === 'CSKH') return 'msg-cskh';
  if (badge === 'ADMIN' || badge === 'BLV' || badge === 'IDOL') return 'msg-svip';
  var n = parseInt(lvl, 10) || 1;
  if (n >= 100) return 'msg-tier11';
  if (n >= 90)  return 'msg-tier10';
  if (n >= 80)  return 'msg-tier9';
  if (n >= 70)  return 'msg-tier8';
  if (n >= 60)  return 'msg-tier7';
  if (n >= 50)  return 'msg-tier6';
  if (n >= 40)  return 'msg-tier5';
  if (n >= 30)  return 'msg-tier4';
  if (n >= 20)  return 'msg-tier3';
  if (n >= 10)  return 'msg-tier2';
  return 'msg-tier1';
}
// SVG icon ngôi sao — có width/height attribute fallback phòng CSS chưa load (tránh icon phình to)
var LV_STAR_SVG = '<svg class="lv-ico" width="10" height="10" viewBox="0 0 24 24"><path d="M12 2l2.6 6.4L21 9.2l-5 4.8 1.4 7L12 17.5 6.6 21l1.4-7-5-4.8 6.4-.8L12 2z"/></svg>';
var LV_CROWN_SVG = '<svg class="lv-ico" width="10" height="10" viewBox="0 0 24 24"><path d="M5 18h14v2H5zM3 7l4 5 5-7 5 7 4-5v9H3V7z"/></svg>';

function getLevelBadgeHTML(lvl, badge){
  var tierClass = getLevelTierClass(lvl, badge);
  var isSpecial = (tierClass === 'lv-vip' || tierClass === 'lv-cskh');
  var label = isSpecial ? (badge || 'VIP') : ('LV ' + (parseInt(lvl,10)||1));
  var icon  = (tierClass === 'lv-vip') ? LV_CROWN_SVG : LV_STAR_SVG;
  return '<span class="lv ' + tierClass + '">' + icon + '<span class="lv-num">' + label + '</span></span>';
}

/* Backward-compatible — KHÔNG XOÁ vì có thể code khác còn gọi */
function lvlBadgeColor(lvl, badge){ return 'transparent'; /* deprecated */ }

function nowHHMM(){
  var d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function esc(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c];
  });
}

// ===== RENDER 1 DÒNG với BADGE 12 TIER + HIỆU ỨNG NAME/TEXT/FRAME =====
function pushMsg(container, m){
  var nameColor = colorFromName(m.name);
  var time = m.time || nowHHMM();
  var rowTier = getMsgRowClass(m.lvl, m.badge);

  var el = document.createElement('div');
  el.className = 'msg-row ' + rowTier;
  // Note: padding/bg/border-radius/animation đều ở CSS .msg-row (level-badges.css)
  // CSS gradient name sẽ override màu khi tier >= 2 hoặc vip/svip; tier1 fallback dùng nameColor
  el.style.setProperty('--name-color', nameColor);

  // Badge LV (12 tier, có shimmer + pulse)
  var lvlHtml = getLevelBadgeHTML(m.lvl, m.badge);
  var nameHtml = '<span class="msg-name" style="color:' + nameColor + '">' + esc(m.name) + ':</span>';
  var textHtml = '<span class="msg-text">' + esc(m.text) + '</span>';

  el.innerHTML = lvlHtml + nameHtml + textHtml;

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

// ╔════════════════════════════════════════════════════════════╗
// ║ DETECT ROOM ID từ URL (cho server-side chat sync)          ║
// ║   /idol/i_yennhi → "i_yennhi"                              ║
// ║   /live/12345    → "12345"                                 ║
// ║   /idol-live     → "_idol_live_lobby"                      ║
// ║   khác          → "_global"                                ║
// ╚════════════════════════════════════════════════════════════╝
function detectRoomId(){
  var p = location.pathname;
  var m = p.match(/^\/idol\/([\w\-_]+)/);
  if (m) return m[1];
  m = p.match(/^\/live\/([\w\-_]+)/);
  if (m) return 'sport_' + m[1];
  if (p === '/idol-live') return '_idol_live_lobby';
  return '_global';
}

// ===== Public API =====
window.startChat = function(containerId, opts){
  var c = document.getElementById(containerId);
  if (!c) return;
  opts = opts || {};
  var isLive = (opts.isLive !== false);
  var mode = opts.mode || detectChatMode();
  var roomId = opts.roomId || detectRoomId();

  var sys = document.createElement('div');
  sys.style.cssText = 'padding:8px 10px;margin:4px 8px;background:rgba(255,122,24,.08);border:1px dashed rgba(255,122,24,.3);border-radius:6px;color:#ffd9a8;font-size:11px;font-weight:600;text-align:center;';

  if (!isLive) {
    sys.className = 'chat-sys-offline';
    sys.style.background = '#1a1f29';
    sys.style.borderColor = '#2a3344';
    sys.style.color = '#9ca3af';
    sys.innerHTML = '🔇 <b style="color:#fff">Phòng chưa lên sóng</b><br>'+
                    '<span style="font-size:11px">BLV/Idol chưa kết nối. Chat sẽ hoạt động khi phát sóng.</span>';
    c.appendChild(sys);
    var input = document.getElementById('chatInput');
    var btn   = document.getElementById('chatBtn');
    var hint  = document.getElementById('chatHint');
    if (input) { input.disabled = true; input.placeholder = 'Phòng chưa lên sóng...'; }
    if (btn)   { btn.disabled = true; btn.textContent = '🔇'; }
    if (hint)  { hint.innerHTML = '🔇 Chat tạm dừng vì phòng chưa lên sóng'; }
    return;
  }

  sys.innerHTML = mode === 'idol'
    ? '🎀 Chào mừng đến phòng idol! Bình luận lịch sự, tặng quà ủng hộ 💝'
    : '🔔 Chào mừng! Khách giới hạn 1 tin / 5 phút.';
  c.appendChild(sys);

  // ═══════════════════════════════════════════════════════════
  // SERVER-SIDE CHAT POLLING - tất cả viewer cùng phòng sync
  // ═══════════════════════════════════════════════════════════
  var lastMsgId = 0;
  var pollTimer = null;
  var renderedIds = {};  // tránh render lại msg đã có

  function fetchMessages(){
    var url = '/api/chat/' + encodeURIComponent(roomId) + '/recent?since=' + lastMsgId;
    fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (!data || !data.ok || !data.messages) return;
        data.messages.forEach(function(m){
          if (renderedIds[m.id]) return;
          renderedIds[m.id] = true;
          if (m.id > lastMsgId) lastMsgId = m.id;
          pushMsg(c, m);
        });
      })
      .catch(function(){});
  }

  // ⚡ Poll adaptive: 3s khi tab active, 15s khi tab ẩn → giảm 80% load server khi user chuyển tab
  fetchMessages();
  function startPoll(interval){
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchMessages, interval);
  }
  startPoll(3000);
  document.addEventListener('visibilitychange', function(){
    startPoll(document.hidden ? 15000 : 3000);
    // Khi quay lại tab active → fetch ngay 1 lần
    if (!document.hidden) fetchMessages();
  });

  // Cleanup khi unload
  window.addEventListener('beforeunload', function(){
    if (pollTimer) clearInterval(pollTimer);
  });

  // Expose để cleanup từ ngoài
  window.__chatPollTimer = pollTimer;
  window.__chatRoomId = roomId;

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

  var roomId = window.__chatRoomId || detectRoomId();

  // 🛡️ CSRF token: đọc từ <meta name="csrf-token"> (set bởi server) — cookie x66_csrf cũng tự gửi kèm
  var __csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var __csrfToken = __csrfMeta ? __csrfMeta.getAttribute('content') : '';

  // POST tin nhắn lên server - tất cả viewer sẽ nhận qua polling
  fetch('/api/chat/' + encodeURIComponent(roomId) + '/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': __csrfToken
    },
    credentials: 'same-origin',
    body: JSON.stringify({ text: text })
  })
    .then(function(r){ return r.json(); })
    .catch(function(){ return { ok:false, error:'Network error' }; })
    .then(function(data){
      if (!data || !data.ok) {
        var em = (data && data.error) || 'Gửi thất bại';
        if (data && data.remain) em = 'Chờ ' + data.remain + 's nữa';
        if (typeof showToast === 'function') showToast(em, 'error');
        return;
      }
      input.value = '';
      markSent();
      applyCooldownUi(inputId, 'chatBtn', 'chatHint');
      // Không cần render thủ công - polling sẽ tự render
    });
};

window.setLoggedInUser = function(user){ try { localStorage.setItem(USER_KEY, JSON.stringify(user || {})); } catch(e){} };
window.logoutChatUser  = function(){ try { localStorage.removeItem(USER_KEY); } catch(e){} };

// switchChatTab — CHỈ define nếu page chưa có (idol-room đã có version riêng nhận string)
if (typeof window.switchChatTab !== 'function') {
  window.switchChatTab = function(btn){
    // Guard: nếu pass string thay vì element → tìm button theo data-tab
    if (typeof btn === 'string') {
      btn = document.querySelector('.chat-tab[data-tab="' + btn + '"]') ||
            document.querySelector('button[data-tab="' + btn + '"]');
    }
    if (!btn || !btn.classList) return;
    document.querySelectorAll('.chat-tab').forEach(function(b){
      b.classList.remove('bg-bg-card','text-pri-light','border-pri');
      b.classList.add('bg-transparent','text-muted','border-transparent');
    });
    btn.classList.remove('bg-transparent','text-muted','border-transparent');
    btn.classList.add('bg-bg-card','text-pri-light','border-pri');
  };
}

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
