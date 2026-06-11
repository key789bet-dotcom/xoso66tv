/**
 * Room Chat Engine - SERVER SIDE v2
 *
 * Tính năng:
 * - In-memory Map<roomId, msgs[]> + Auto bot push 3-5s
 * - Persist chat history → data/chat-history.json (mỗi 30s flush + on shutdown)
 * - Load lại history khi server restart
 * - Admin moderation: deleteMessage, clearRoom, banUser, slowMode
 * - Auto prune phòng inactive 5p
 */
const fs = require('fs');
const path = require('path');

// ===== POOL TÊN BOT =====
const NAMES_IDOL = [
  { n:'Phong Vũ',      l:88, b:'SVIP' }, { n:'Tý Cute',       l:5,  b:'' },
  { n:'Ếch Xanh',      l:10, b:'' },     { n:'Bin Bun',       l:88, b:'SVIP' },
  { n:'Mèo Lười',      l:7,  b:'' },     { n:'Hắc Báo',       l:30, b:'VIP' },
  { n:'Bin Bin',       l:3,  b:'' },     { n:'Sói Đầu Đàn',   l:42, b:'SVIP' },
  { n:'Cờ Hó',         l:8,  b:'' },     { n:'Ngọc Trinh Fan',l:15, b:'' },
  { n:'Long Lanh',     l:23, b:'VIP' },  { n:'Su Su',         l:5,  b:'' },
  { n:'Heo Mập',       l:12, b:'' },     { n:'Hổ Báo',        l:61, b:'VIP' },
  { n:'Bí Đỏ',         l:9,  b:'' },     { n:'Lý Tiểu Long',  l:99, b:'SVIP' },
  { n:'Tâm Sự Hài',    l:18, b:'' },     { n:'Đậu Phộng',     l:6,  b:'' },
  { n:'Mộc Lan',       l:11, b:'' },     { n:'Tony Stark',    l:33, b:'VIP' },
  { n:'Linh Hoa',      l:7,  b:'' },     { n:'Chiến Thần',    l:50, b:'SVIP' },
  { n:'Tuyết Bông',    l:14, b:'' },     { n:'Vũ Trụ',        l:45, b:'VIP' },
  { n:'Bé Mỡ',         l:4,  b:'' },     { n:'Trà Sữa',       l:22, b:'' },
  { n:'Min Min',       l:8,  b:'' },     { n:'Beck Becks',    l:12, b:'' },
  { n:'Lan Ngọc',      l:19, b:'' },     { n:'Chí Phèo',      l:7,  b:'' },
  { n:'Ổi Xanh',       l:11, b:'' }
];
const NAMES_SPORTS = [
  { n:'Sư Tử', l:5,  b:'' }, { n:'Cọp Trắng', l:7,  b:'' }, { n:'Hổ Vằn', l:42, b:'SVIP' },
  { n:'Phượng Hoàng', l:6, b:'' }, { n:'Quang Huy', l:5, b:'' },
  { n:'Cá Mập', l:10, b:'' }, { n:'Bá Vương', l:10, b:'' }, { n:'Chiến Binh', l:8, b:'' },
  { n:'Hên Thì Ăn', l:5, b:'' }, { n:'Mèo Mun', l:23, b:'VIP' }, { n:'Chovy', l:61, b:'VIP' },
  { n:'Rồng Vàng', l:42, b:'SVIP' }, { n:'Tuấn Bự', l:99, b:'SVIP' }, { n:'Đậu Đỏ', l:15, b:'' },
  { n:'Long Bạch', l:33, b:'VIP' }, { n:'Tigon', l:10, b:'' }
];

// ═══════════════════════════════════════════════════════════
// Message pools — TÁCH RIÊNG cho IDOL vs SPORTS
// IDOL: nhảm + khen idol + hỏi xoso66 + reply/troll thông thường
// SPORTS: nhảm + kèo/trận đấu/BLV + xoso66
// ═══════════════════════════════════════════════════════════

// Câu nhảm CHUNG cho cả 2 mode
const MSG_NHAM = ['hihi','haha','ke ke ke','lol','ờm','huhu','ụa','ơ kìa','éo hiểu','tự nhiên thấy chán','khó hiểu thật','tới luôn','ăn cơm chưa cả nhà','lạc trôi','vô tri','vô nghĩa thật','đỉnh nóc','căng thẳng','gì cơ','sao tự nhiên','ờ ờ ờ','ừ thì','hmm','huk huk','hí hí','bay nóc','mạnh mẽ vào','ráng lên','full hp','chát chúa','cay quá','đỡ không nổi','xỉu lên xỉu xuống','khóc thét','xám hồn','sấp mặt','ngáo ngơ','xuất sắc','ờ ờ','ừm hề','vâng ạ','dạ vâng','thôi rồi','xong phim','chán đời','vui ghê','dz nhỉ','xịn xò','điên à','tỉnh chưa','chuyện gì vậy ta','khó đỡ','quá đỉnh'];
const MSG_REPLY = ['chuẩn','đúng rồi đó','sai sai gì kìa','không phải nhé','thật đó hả','t cũng nghĩ vậy','t khác','sao mà sai được','ơ thật á','xạo lol','đùa à','thật mà','100%','chắc chắn','nghi thật','khả thi','vô lý','có lý đó','đồng ý','phản đối','tán thành','đúng vậy đó','sai bét','xàm vlc','chính xác','nói rất hay','quá đúng','nhảm thế','hỏi hay đó'];
const MSG_TROLL = ['gà thế','non quá','ngơ ngác','nhìn đã chán','nói nhảm','chém gió','phét đó','xạo lùa gà','nói phét','vớ vẩn','éo tin','xàm xí','tào lao','dở hơi','khùng à','bị gì vậy','tỉnh chưa','tỉnh đi cha','mơ à','thôi đi','thôi xin','dạ vâng','dạ thưa','vâng vâng','ờ ờ'];
const MSG_EMOJI = ['😂😂😂','🤣🤣🤣','😍😍','❤️❤️❤️','🔥🔥🔥','👏👏👏','💯','🙏🙏','✨✨','💖💖💖','🥰🥰','😘😘','🎉🎉','🌹🌹🌹','💐','wow','nice','gg','op','imba','+1','=))','sad','xinh','đẹp','auto','top','best','no.1','vip'];

// Hỏi chung (không liên quan thể thao)
const MSG_HOI_CHUNG = ['mấy giờ rồi','ai HN k','ai SG k','ai DN k','ai HP k','còn ai online k','ai chưa ngủ','ai ăn cơm chưa','ăn gì giờ này','phòng này hay k','ai vào lâu chưa','mới hay cũ'];

// Hỏi về xoso66 (DÙNG CHUNG cả idol + sports)
const MSG_HOI_XOSO66 = ['link xoso66 đâu','code free đâu','quà ngon k','có khuyến mãi k','có app k','tải xoso66 ở đâu','nạp ở đâu','rút sao','làm sao để vip','xoso66 có an toàn k','code naptien dùng được k','ai nhận quà chưa','tải app xoso66 ở đâu vậy','hôm nay xoso66 có event gì k','bốc thăm xoso66 ai trúng','mã đại lý xoso66 nhập đâu'];

// ═══ KHEN IDOL — chỉ dùng trong phòng IDOL ═══
const MSG_KHEN_IDOL = [
  'idol xinh quá','idol cute thật sự','giọng idol hay quá','idol hát ngọt ghê','xinh dã man','dễ thương vl',
  'idol mặc đồ này hợp ghê','make-up nhẹ mà đẹp','smile của idol đáng yêu quá','idol mãi đỉnh',
  'mê idol mất rồi','ngắm idol cả ngày k chán','ngày nào cũng vào hóng idol','idol live đều nhe',
  'có ai giống mình mê idol k','idol nhìn dịu dàng quá','tóc idol hôm nay đẹp ghê','idol cười tỏa nắng',
  'idol live lâu chút nha','idol khỏe mạnh nhe','idol nói nghe ấm áp','idol có người yêu chưa','idol có bồ chưa',
  'idol bao tuổi rồi nhỉ','idol ở đâu vậy','idol có Telegram k','muốn follow idol IG','idol đáng yêu nhất phòng'
];

// Tán gẫu DÀI dành cho IDOL (KHÔNG có kèo/BLV/trận đấu)
const MSG_DAI_IDOL = [
  'Hôm nay phòng vui quá mọi người, lâu lắm mới có dịp chill với idol, ai cũng dễ thương',
  'Idol ơi hôm nay live có hát bài gì k, em xin đặt 1 bài ballad nhẹ nhàng nha',
  'Mình theo dõi idol từ những ngày đầu, càng ngày càng xinh và tự tin hơn rất nhiều',
  'Idol cho em xin info Telegram được không, hứa không spam đâu, chỉ muốn follow ủng hộ thôi',
  'Hôm nay deadline mệt quá, vào phòng nghe idol nói chuyện thấy thư giãn hẳn',
  'Mọi người trong phòng ai cũng dễ thương, idol thì xinh, vibe phòng quá ổn áp',
  'Idol nhớ uống đủ nước, ngủ đủ giấc nha, sức khỏe quan trọng lắm',
  'Vừa ăn cơm xong vào phòng hóng idol, đúng thói quen mỗi tối luôn',
  'Anh em ai mê idol thì để lại 1 tym, để xem có bao nhiêu fan cứng nào',
  'Nghe idol nói chuyện thấy dễ chịu ghê, giọng mềm mềm dễ thương'
];

// Câu DÀI có mention xoso66 — DÙNG CHUNG cả 2 mode
const MSG_DAI_XOSO66 = [
  'Mình mới phát hiện ra cái mini game tài xỉu trong xoso66 khá hay, ai chơi rồi share kinh nghiệm với',
  'Hôm nay xoso66 có event gì hot không mọi người, ai có code free chia sẻ với',
  'Mới nạp xoso66 xong, đang chờ khuyến mãi tuần này có ngon không'
];

// Câu DÀI dành cho SPORTS — có kèo/BLV/trận đấu
const MSG_DAI_SPORTS = [
  'Thực sự thì tôi không hiểu sao mọi người lại tranh cãi vấn đề này, ai thấy hợp lý thì follow theo thôi',
  'Nói thật là hôm nay tôi đặt cược thua sml, ai có mẹo gì hay chia sẻ cho anh em với, đặt cái nào trúng cái đó luôn',
  'Trận đấu vừa rồi gay cấn thật sự, mất ngủ luôn vì kèo, may mà có BLV vào bình luận kịp nên xem được đến cuối',
  'Hôm nay phòng vui quá mọi người, lâu lắm mới có dịp chill với mấy anh em, hứng lên là tới luôn không cần lý do',
  'Mình đang phân vân giữa 2 kèo, BLV nghĩ kèo nào ngon hơn ạ',
  'Anh em theo BLV phòng này thấy uy tín lắm, kèo lúc nào cũng có lý'
];

function pickRand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// makePool(mode) — trả về pool theo mode (idol/sports)
function makePool(mode){
  const pool = [];
  function push(arr, n){ for (let i=0;i<n;i++) pool.push(arr[Math.floor(Math.random()*arr.length)]); }

  if (mode === 'idol') {
    // 35% nhảm + 15% reply + 10% troll + 10% emoji
    // + 15% KHEN IDOL + 8% hỏi chung + 5% hỏi xoso66 + 2% dài
    push(MSG_NHAM, 35);
    push(MSG_REPLY, 15);
    push(MSG_TROLL, 10);
    push(MSG_EMOJI, 10);
    push(MSG_KHEN_IDOL, 15);
    push(MSG_HOI_CHUNG, 8);
    push(MSG_HOI_XOSO66, 5);
    push(MSG_DAI_IDOL, 1);
    push(MSG_DAI_XOSO66, 1);
  } else {
    // SPORTS mode — pool cũ
    push(MSG_NHAM, 35);
    push(MSG_REPLY, 18);
    push(MSG_TROLL, 13);
    push(MSG_HOI_CHUNG, 8);
    push(MSG_HOI_XOSO66, 4);
    push(MSG_EMOJI, 10);
    push(MSG_DAI_SPORTS, 4);
    push(MSG_DAI_XOSO66, 1);
  }
  return pool;
}

// ╔════════════════════════════════════════════════════════════╗
// ║                    STATE                                   ║
// ╚════════════════════════════════════════════════════════════╝
const rooms = new Map();  // roomId → { messages, lastViewerAt, mode, lastNames }
const bans = new Set();   // banKey = "u:username" hoặc "ip:1.2.3.4"
const slowModes = new Map(); // roomId → seconds (cooldown override)
const MAX_MSG_PER_ROOM = 200;
const MAX_SAVE_PER_ROOM = 50;  // chỉ save 50 msg gần nhất xuống disk
const VIEWER_ALIVE_MS = 60 * 1000;
const ROOM_INACTIVE_PURGE_MS = 5 * 60 * 1000;
let nextMsgId = 1;

const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'chat-history.json');
const BANS_FILE = path.join(DATA_DIR, 'chat-bans.json');

// ===== LOAD persisted history khi start =====
function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return;
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    let count = 0;
    Object.keys(data.rooms || {}).forEach(roomId => {
      const msgs = data.rooms[roomId] || [];
      rooms.set(roomId, {
        messages: msgs,
        lastViewerAt: Date.now() - 30 * 1000, // reset alive
        mode: roomId.startsWith('sport_') ? 'sports' : 'idol',
        lastNames: msgs.slice(-10).map(m => m.name).filter(Boolean)
      });
      count += msgs.length;
    });
    if (data.nextMsgId && data.nextMsgId > nextMsgId) nextMsgId = data.nextMsgId;
    console.log('[CHAT] Loaded history:', rooms.size, 'rooms,', count, 'messages, nextId=' + nextMsgId);
  } catch (e) {
    console.error('[CHAT] Load history fail:', e.message);
  }
}
function loadBans() {
  try {
    if (!fs.existsSync(BANS_FILE)) return;
    const data = JSON.parse(fs.readFileSync(BANS_FILE, 'utf8'));
    (data.bans || []).forEach(b => bans.add(b));
    console.log('[CHAT] Loaded', bans.size, 'bans');
  } catch (e) {}
}

// ===== FLUSH persist =====
function flushHistory() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const data = { nextMsgId: nextMsgId, rooms: {} };
    rooms.forEach((room, roomId) => {
      // Chỉ save 50 msg gần nhất (giảm size file)
      data.rooms[roomId] = room.messages.slice(-MAX_SAVE_PER_ROOM);
    });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data));
  } catch (e) {
    console.error('[CHAT] Flush fail:', e.message);
  }
}
function flushBans() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BANS_FILE, JSON.stringify({ bans: Array.from(bans) }));
  } catch (e) {}
}

// ===== ROOM API =====
function getRoom(roomId, mode){
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      messages: [],
      lastViewerAt: Date.now(),
      mode: mode || (roomId && (roomId.startsWith('i') || roomId.startsWith('u_')) ? 'idol' : 'sports'),
      lastNames: []
    });
  }
  return rooms.get(roomId);
}

function addMessage(roomId, msg){
  const room = getRoom(roomId);
  msg.id = nextMsgId++;
  msg.ts = msg.ts || Date.now();
  room.messages.push(msg);
  if (room.messages.length > MAX_MSG_PER_ROOM) {
    room.messages = room.messages.slice(-MAX_MSG_PER_ROOM);
  }
  if (msg.name) {
    room.lastNames.push(msg.name);
    if (room.lastNames.length > 10) room.lastNames.shift();
  }
  return msg;
}

function getMessages(roomId, sinceId){
  const room = getRoom(roomId);
  room.lastViewerAt = Date.now();
  if (!sinceId) return room.messages.slice(-50);
  return room.messages.filter(m => m.id > sinceId);
}

// ===== ADMIN MODERATION =====
function deleteMessage(roomId, msgId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  const idx = room.messages.findIndex(m => m.id === parseInt(msgId, 10));
  if (idx === -1) return false;
  room.messages.splice(idx, 1);
  // Inject system msg "đã xoá"
  addMessage(roomId, {
    name: 'System',
    lvl: 99,
    badge: 'CSKH',
    text: '🛡️ Một tin nhắn đã bị xoá bởi admin',
    isSystem: true
  });
  return true;
}

function clearRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  const cleared = room.messages.length;
  room.messages = [];
  addMessage(roomId, {
    name: 'System',
    lvl: 99,
    badge: 'CSKH',
    text: '🛡️ Admin đã clear toàn bộ ' + cleared + ' tin nhắn',
    isSystem: true
  });
  return true;
}

function banUser(target) {
  // target: { username } hoặc { ip }
  if (target.username) bans.add('u:' + target.username.toLowerCase());
  if (target.ip) bans.add('ip:' + target.ip);
  flushBans();
  return true;
}

function unbanUser(target) {
  let removed = 0;
  if (target.username) { if (bans.delete('u:' + target.username.toLowerCase())) removed++; }
  if (target.ip) { if (bans.delete('ip:' + target.ip)) removed++; }
  flushBans();
  return removed > 0;
}

function isBanned(username, ip) {
  if (username && bans.has('u:' + username.toLowerCase())) return true;
  if (ip && bans.has('ip:' + ip)) return true;
  return false;
}

function listBans() {
  return Array.from(bans);
}

function setSlowMode(roomId, seconds) {
  if (!seconds || seconds <= 0) {
    slowModes.delete(roomId);
    return 0;
  }
  slowModes.set(roomId, parseInt(seconds, 10));
  addMessage(roomId, {
    name: 'System', lvl: 99, badge: 'CSKH',
    text: '🐢 Admin bật slow mode: 1 tin / ' + seconds + 's',
    isSystem: true
  });
  return seconds;
}

function getSlowMode(roomId) {
  return slowModes.get(roomId) || 0;
}

// ===== BOT GENERATOR =====
function generateBotMessage(roomId){
  const room = getRoom(roomId);
  const namePool = room.mode === 'idol' ? NAMES_IDOL : NAMES_SPORTS;
  const name = pickRand(namePool);
  // Pool theo mode — KHÔNG còn mix sports/BLV vào idol nữa
  const pool = makePool(room.mode);
  let text = pickRand(pool);
  if (MSG_REPLY.indexOf(text) > -1 && room.lastNames.length && Math.random() < 0.5) {
    const prev = pickRand(room.lastNames);
    if (prev !== name.n) text = '@' + prev.split(' ')[0] + ' ' + text;
  }
  return {
    name: name.n, lvl: name.l, badge: name.b, text: text, isBot: true
  };
}

// ===== AUTO BOT LOOP =====
// Bot CHỈ chạy khi:
//   1. Có viewer đang active trong room (room.lastViewerAt < 30s)
//   2. VÀ stream đang LIVE thật (idol/blv có liveNow=true hoặc bypassLive=true)
function isStreamLive(roomId) {
  try {
    const db = require('./db');
    const data = db.load();
    // roomId có format "i_yennhi" (idol) hoặc "b_xxx" (blv) hoặc match ID
    // Check idol trước
    const idol = (data.idols || []).find(i => i.id === roomId);
    if (idol) return !!(idol.liveNow || idol.streamActive);
    // Check BLV
    const blv = (data.blvs || []).find(b => b.id === roomId);
    if (blv) return !!(blv.liveNow || blv.streamActive);
    // Không tìm thấy idol/blv → có thể là match từ API thể thao
    // Match thể thao: bot vẫn chạy bình thường (không có khái niệm offline)
    return true;
  } catch(e) {
    return true; // fallback: cho bot chạy nếu lỗi check
  }
}

function startBotLoop(){
  function tick(){
    const now = Date.now();
    rooms.forEach((room, roomId) => {
      const isAlive = (now - room.lastViewerAt) < VIEWER_ALIVE_MS;
      if (!isAlive) return;
      // ⚡ Mới: chặn bot nếu stream chưa LIVE
      if (!isStreamLive(roomId)) return;
      if (Math.random() < 0.2) return;
      const msg = generateBotMessage(roomId);
      addMessage(roomId, msg);
    });
  }
  function loop(){
    tick();
    setTimeout(loop, 3000 + Math.random() * 2000);
  }
  loop();
}

// ===== PRUNE =====
function startPruneLoop(){
  setInterval(() => {
    const now = Date.now();
    let pruned = 0;
    rooms.forEach((room, roomId) => {
      if (now - room.lastViewerAt > ROOM_INACTIVE_PURGE_MS) {
        rooms.delete(roomId);
        pruned++;
      }
    });
    if (pruned > 0) console.log('[CHAT] pruned', pruned, 'inactive rooms');
  }, 60 * 1000);
}

// ===== AUTO FLUSH =====
function startFlushLoop(){
  setInterval(flushHistory, 30 * 1000);
}

// Save on exit
process.on('SIGTERM', flushHistory);
process.on('SIGINT', function(){ flushHistory(); process.exit(0); });

function stats(){
  return {
    rooms: rooms.size,
    totalMessages: Array.from(rooms.values()).reduce((s,r) => s + r.messages.length, 0),
    bans: bans.size,
    slowModes: slowModes.size
  };
}

// ===== INIT =====
loadHistory();
loadBans();
startBotLoop();
startPruneLoop();
startFlushLoop();
console.log('[CHAT] Room chat engine started (bot 3-5s, persist 30s, prune 1m)');

module.exports = {
  addMessage, getMessages, getRoom, stats,
  // Moderation
  deleteMessage, clearRoom, banUser, unbanUser, isBanned, listBans,
  setSlowMode, getSlowMode,
  flushHistory  // for testing
};
