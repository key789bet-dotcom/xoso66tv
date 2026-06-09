/**
 * XOSO66 TV - Express server, Tailwind CSS, clean URL, SEO chuẩn
 */
require('dotenv').config();
const path     = require('path');
const express  = require('express');
const api      = require('./lib/api');
const partners = require('./lib/partners');
const bannersStore = require('./lib/banners');
const promosStore  = require('./lib/promos');
const partnerLinks = require('./lib/partner-links');
const db           = require('./lib/db');
const auth     = require('./routes/auth');
const seo      = require('./routes/seo');
const admin    = require('./routes/admin');
const pwdReset = require('./routes/password-reset');
const teleHook = require('./routes/telegram-webhook');
const partnerHook = require('./routes/partner-webhook');
const linkRoute   = require('./routes/account-link');
const applyStreamer = require('./routes/apply-streamer');
const pubAuth     = require('./lib/public-auth');
const adminAuth   = require('./lib/admin-auth');

// Unified admin check: accept EITHER x66_admin cookie (OLD) OR x66_jwt with admin role (NEW)
function requireAnyAdmin(req, res, next) {
  // Check OLD admin cookie first
  const adminSess = adminAuth.isAuthed(req);
  if (adminSess && adminSess.username) {
    res.locals.adminUser = adminSess.username;
    return next();
  }
  // Check NEW JWT cookie with admin role
  const jwtUser = pubAuth.getUser(req);
  if (jwtUser && jwtUser.role === 'admin') {
    res.locals.adminUser = jwtUser.username;
    return next();
  }
  // Neither - reject
  if (req.path.startsWith('/api/')) return res.status(401).json({ ok:false, error:'Cần đăng nhập admin' });
  return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
}
const sec         = require('./lib/security');
const privacy     = require('./lib/privacy');

// Rate limiters
const loginLimiter = sec.createLimiter({ max: 5, windowMs: 5*60*1000, message: 'Quá nhiều lần đăng nhập, đợi 5 phút' });
const apiLimiter   = sec.createLimiter({ max: 60, windowMs: 60*1000, message: 'Quá nhiều request, đợi 1 phút' });
const analytics= require('./lib/analytics');

const app  = express();
// Trust Cloudflare proxy → req.ip sẽ lấy đúng IP user thật từ CF-Connecting-IP
// (nhưng app sẽ KHÔNG log/expose IP này — chỉ dùng nội bộ cho rate limit + hash)
app.set('trust proxy', true);

// Middleware: gán IP đã mask + hash vào req để dùng toàn site
app.use(function(req, res, next){
  req.maskedIp = privacy.getMaskedIp(req);
  req.hashedIp = privacy.getHashedIp(req);
  // KHÔNG để IP thật xuất hiện trong res.locals (template không expose ra HTML)
  res.locals.userIpMasked = req.maskedIp;
  next();
});

const PORT = process.env.PORT || 4000;
const SITE = process.env.SITE_URL || ('http://localhost:' + PORT);

// Helper: chi tra ve TRUE neu co BLV/Idol da approve OBS + dang stream
function hasAnyActiveStream(type){
  try {
    const data = db.load();
    return data.obs.some(function(o){
      if (o.status !== 'approved' || !o.streamActive) return false;
      if (type === 'blv'  && o.requesterType !== 'blv')  return false;
      if (type === 'idol' && o.requesterType !== 'idol') return false;
      return true;
    });
  } catch(e){ return false; }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('siteUrl', SITE);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

// ===== PWA assets (phải serve ở root scope) =====
app.get('/sw.js', function(req, res){
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache'); // luôn check update SW
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});
app.get('/manifest.json', function(req, res){
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

// ===== Push notification API =====
const pushLib = require('./lib/push');
app.get('/api/push/vapid-key', function(req, res){
  res.json({ publicKey: pushLib.VAPID.publicKey || null });
});
app.post('/api/push/subscribe', function(req, res){
  const b = req.body || {};
  if (!b.subscription || !b.subscription.endpoint) return res.json({ ok:false, error:'subscription thiếu endpoint' });
  const user = pubAuth.getUser(req);
  const ok = pushLib.saveSubscription(b.subscription, b.topics, user ? user.username : null);
  res.json({ ok: ok, message: ok ? 'Đã bật thông báo' : 'Lưu thất bại' });
});
app.post('/api/push/unsubscribe', function(req, res){
  const endpoint = req.body && req.body.endpoint;
  if (!endpoint) return res.json({ ok:false });
  const removed = pushLib.removeSubscription(endpoint);
  res.json({ ok:true, removed: removed });
});
// 🆕 Idol/BLV self-set category (chuyên mục live - không cần admin)
app.post('/api/idol-self/set-category', function(req, res){
  const user = pubAuth.getUser(req);
  if (!user) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
  if (!['idol','blv','admin'].includes(user.role)) return res.status(403).json({ ok:false, error:'Cần quyền streamer' });
  const cat = String((req.body && req.body.category) || '').toLowerCase();
  if (!['idol','bongda','casino','esport'].includes(cat)) return res.json({ ok:false, error:'Category không hợp lệ' });
  const data = db.load();
  const uname = String(user.username || '').toLowerCase();
  // Tìm idol record của user (giống logic ở /idol-studio)
  const idol = (data.idols || []).find(function(i){
    return (String(i.userId||'').toLowerCase() === uname) ||
           (String(i.username||'').toLowerCase() === uname) ||
           (String(i.name||'').toLowerCase() === uname);
  });
  if (!idol) return res.json({ ok:false, error:'Không tìm thấy profile idol của bạn' });
  idol.category = cat;
  idol.categoryUpdatedAt = Date.now();
  db.save(data);
  res.json({ ok:true, category: cat });
});

// Idol/BLV set quality khi go live
app.post('/api/streamer/set-quality', function(req, res){
  const user = pubAuth.getUser(req);
  if (!user) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
  if (!['idol','blv','admin'].includes(user.role)) return res.status(403).json({ ok:false, error:'Cần quyền streamer' });
  const q = String((req.body && req.body.quality) || '').trim();
  if (!['1080p','720p','480p','360p'].includes(q)) return res.json({ ok:false, error:'Quality không hợp lệ' });
  const data = db.load();
  // Tìm trong idols và blvs
  const all = (data.idols || []).concat(data.blvs || []);
  const item = all.find(function(x){ return (x.userId === user.username) || (x.username === user.username); });
  if (!item) return res.json({ ok:false, error:'Không tìm thấy profile streamer' });
  item.quality = q;
  item.qualityUpdatedAt = Date.now();
  db.save(data);
  res.json({ ok:true, quality: q });
});

// Test push (chỉ admin)
app.post('/api/push/test', function(req, res){
  const user = pubAuth.getUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ ok:false });
  const b = req.body || {};
  pushLib.sendToTopic(b.topic || 'idol_live', {
    title: b.title || '🎬 Test notification',
    body: b.body || 'Đây là tin nhắn test từ admin',
    url: b.url || '/'
  }).then(function(r){ res.json(r); }).catch(function(e){ res.json({ ok:false, error:e.message }); });
});

app.use(analytics.track);

// Rate limit all /api/* requests
app.use('/api/', apiLimiter);

// Disable browser cache for HTML to prevent stale broken renders
app.use(function (req, res, next) {
  // Only set no-cache for HTML pages (not /static assets which keep 7d cache)
  if (!req.path.startsWith('/static') && !req.path.startsWith('/api')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

app.use(async function (req, res, next) {
  res.locals.brand     = partners.brand;
  res.locals.partner   = partnerLinks.load();
  res.locals.banners   = bannersStore.listActive().length ? bannersStore.listActive() : partners.banners;
  res.locals.cats      = api.CATEGORIES;
  res.locals.leagues   = api.FEATURED_LEAGUES;
  res.locals.active    = '';
  res.locals.activeCat = '';
  res.locals.path      = req.path;
  res.locals.siteUrl   = SITE;
  res.locals.seo       = null;
  try { res.locals.catCounts = await api.getCategoryCounts(); }
  catch (e) { res.locals.catCounts = {}; }
  next();
});

app.get('/', async function (req, res, next) {
  try {
    // Luon fetch tu API de site co noi dung; chi /live/:id can OBS
    const live     = await api.getLiveStreams();
    const upcoming = await api.getUpcomingStreams(null, 12);
    const finished = await api.getFinishedStreams(null, 8);
    const data     = db.load();
    const liveIdols= data.idols.filter(function(i){ return i.status==='active' && i.liveNow; });
    const topStreamers = data.blvs.concat(data.idols).filter(function(x){return x.status==='active'}).slice(0, 16).map(function(s){
      return { name: s.name, avatar: s.avatar, followers: (s.followers||s.viewers||0).toLocaleString('vi-VN'), liveNow: !!s.liveNow };
    });
    res.render('tw-home', { active:'home', live:live, upcoming:upcoming, finished:finished, dbIdols:liveIdols, topStreamers:topStreamers });
  } catch (e) { next(e); }
});

app.get('/live/:id', async function (req, res, next) {
  // KHÔNG cho Cloudflare cache route này (data thay đổi liên tục)
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('CDN-Cache-Control', 'no-store');
  try {
    const m  = req.params.id.match(/(\d+)$/);
    const id = m ? m[1] : req.params.id;
    let match = await api.getEvent(id);
    // Fallback 1: tìm trong tất cả fixtures 5 ngày gần (thay vì 404 ngay)
    if (!match) {
      const range = await api.getEventsRange(null, -2, 2);
      match = range.find(function(x){ return String(x.id) === String(id); });
    }
    // Fallback 2: reconstruct match info từ slug nếu vẫn không tìm thấy
    if (!match) {
      const slugPart = req.params.id.replace(/-\d+$/, ''); // bỏ id ở cuối
      const parts = slugPart.split('-vs-');
      if (parts.length === 2) {
        const cap = function(s){ return s.split('-').map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); };
        match = {
          id: id,
          sport: 'Soccer',
          league: 'Trận đấu',
          home: cap(parts[0]),
          away: cap(parts[1]),
          homeBadge: '', awayBadge: '',
          score: null, date: '', time: '', matchTs: null,
          venue: '', status: 'upcoming', statusText: 'Sắp diễn ra',
          poster: '', slug: req.params.id
        };
      }
    }
    if (!match) return res.status(404).render('tw-404');
    const all = await api.getLiveStreams().catch(function(){ return []; });
    const others = (all || []).filter(function (x) { return x.id !== match.id; }).slice(0, 6);
    const hasObs = hasAnyActiveStream('blv');
    res.render('tw-live', { active:'home', match:match, others:others, hasObs: hasObs });
  } catch (e) {
    console.error('[live/:id]', e.message);
    next(e);
  }
});

app.get('/lich-phat-song', async function (req, res, next) {
  try {
    const sport = req.query.mon || null;
    const cat   = sport ? api.CATEGORIES[sport] : null;
    const list = await api.getUpcomingStreams(cat ? cat.sport : null, 50);
    res.render('tw-lich-phat-song', { active:'lich', list:list, sport:sport });
  } catch (e) { next(e); }
});

app.get('/su-kien',  function (req, res) { res.render('tw-su-kien',  { active:'su-kien', promos: promosStore.listActive() }); });
app.get('/qua-tang', function (req, res) { res.render('tw-qua-tang', { active:'qua-tang' }); });
app.get('/mini-game',function (req, res) { res.render('tw-mini-game',{ active:'mini' }); });
app.get('/game/tai-xiu',  function (req, res) { res.render('games/tw-tai-xiu',  { active:'mini' }); });
app.get('/game/xoc-dia',  function (req, res) { res.render('games/tw-xoc-dia',  { active:'mini' }); });
app.get('/game/xuc-xac', function (req, res) { res.redirect(301, '/game/xoc-dia'); });
app.get('/game/vong-quay',function (req, res) { res.render('games/tw-vong-quay',{ active:'mini' }); });


app.get('/video-noi-bat', async function (req, res, next) {
  try { res.render('tw-video-noi-bat', { active:'video', list: await api.getFinishedStreams(null, 24) }); }
  catch (e) { next(e); }
});

app.get('/tin-tuc', async function (req, res, next) {
  try { res.render('tw-tin-tuc', { active:'news', list: await api.getNews(18) }); }
  catch (e) { next(e); }
});

app.get('/the-thao/:cat', async function (req, res, next) {
  try {
    const cat = api.CATEGORIES[req.params.cat];
    if (!cat || cat.partnerOnly) return res.status(404).render('tw-404');
    const live     = await api.getLiveStreams(cat.sport);
    const upcoming = await api.getUpcomingStreams(cat.sport, 16);
    const finished = await api.getFinishedStreams(cat.sport, 8);
    res.render('tw-the-thao', { active:'cat', activeCat:req.params.cat, cat:cat, live:live, upcoming:upcoming, finished:finished });
  } catch (e) { next(e); }
});

app.get('/esports', async function (req, res, next) {
  try {
    const cat = api.CATEGORIES['esports'];
    const upcoming = await api.getUpcomingStreams('eSports', 16);
    res.render('tw-the-thao', { active:'cat', activeCat:'esports', cat:cat, live:[], upcoming:upcoming, finished:[] });
  } catch (e) { next(e); }
});

app.get('/casino', function (req, res) {
  res.render('tw-partner-landing', {
    active:'cat', activeCat:'casino', cat: api.CATEGORIES['casino'],
    target: partnerLinks.load().casino,
    title: 'Casino Trực Tuyến HD - Live Dealer 24/7',
    desc:  'Hàng nghìn game casino, baccarat, blackjack, roulette, slot từ các nhà cung cấp lớn. Live dealer 24/7.',
    games: [
      { name:'Baccarat',  icon:'BC', desc:'Game bài đỉnh cao' },
      { name:'Blackjack', icon:'BJ', desc:'Chiến thuật và may mắn' },
      { name:'Roulette',  icon:'RL', desc:'Vòng quay may mắn' },
      { name:'Sicbo',     icon:'SC', desc:'Tài xỉu cổ điển' },
      { name:'Slot Game', icon:'SL', desc:'Hàng nghìn slot' },
      { name:'Poker',     icon:'PK', desc:'Texas Holdem & Omaha' }
    ]
  });
});

app.get('/idol-live', function (req, res) {
  const data = db.load();
  const idols = data.idols.filter(function(i){ return i.status==='active'; });
  res.render('tw-idol-live', { active:'cat', activeCat:'idol', cat: api.CATEGORIES['idol'], dbIdols: idols });
});

app.get('/idol/:id', function (req, res) {
  const data = db.load();
  const idol = data.idols.find(function(i){ return i.id === req.params.id; });
  if (!idol) return res.status(404).render('tw-404');
  // Chi live khi idol nay co OBS approved + streamActive
  const hasObs = data.obs.some(function(o){
    return o.status==='approved' && o.streamActive
        && (o.requesterId === idol.id || (o.requesterName||'').toLowerCase().indexOf((idol.name||'').toLowerCase()) >= 0);
  });
  // Lay danh sach idol active de gesture swipe (vuot len/xuong chuyen phong)
  const allIdols = data.idols.filter(function(i){ return i.status==='active'; }).map(function(i){
    return { id: i.id, name: i.name, emoji: i.emoji || '👑', color: i.color || 0, lock: i.lock || 0 };
  });
  res.render('tw-idol-room', { active:'cat', activeCat:'idol', idolKey: req.params.id, dbIdol: idol, hasObs: hasObs, allIdols: allIdols, pinRequired: !!idol.pinCode });
});

// ===== PUBLIC AUTH (cookie-based for streamer protection) =====
app.post('/api/auth/login', loginLimiter, async function (req, res) {
  const b = req.body || {};
  try {
    const result = await pubAuth.login(b.username || '', b.password || '', res, { otp: b.otp });
    if (!result.ok) {
      if (result.needs2FA) return res.json({ ok:false, needs2FA:true, error:result.error });
      return res.status(401).json({ ok:false, error: result.error || 'Sai tài khoản hoặc mật khẩu' });
    }
    res.json({ ok:true, username: result.username, role: result.role });
  } catch(e) {
    res.status(500).json({ ok:false, error:'Lỗi server: ' + e.message });
  }
});

// ===== 2FA SETUP ROUTES (admin only) =====
app.post('/api/auth/2fa/setup', requireAnyAdmin, async function (req, res){
  const data = db.load();
  const secret = sec.generate2FASecret('XOSO66 Admin (' + (res.locals.adminUser || res.locals.publicUser?.username || 'admin') + ')');
  const qr = await sec.generate2FAQRCode(secret.otpauthUrl);
  // Store TEMP secret (not enabled until verified)
  data.admin2faPending = { secret: secret.base32, createdAt: Date.now() };
  db.save(data);
  res.json({ ok:true, secret: secret.base32, qrCode: qr, otpauthUrl: secret.otpauthUrl });
});

app.post('/api/auth/2fa/verify-setup', requireAnyAdmin, function (req, res){
  const data = db.load();
  const pending = data.admin2faPending;
  if (!pending || !pending.secret) return res.json({ ok:false, error:'Chưa setup 2FA' });
  const token = String((req.body && req.body.token) || '');
  const ok = sec.verify2FAToken(pending.secret, token);
  if (!ok) return res.json({ ok:false, error:'Mã OTP không đúng' });
  data.admin2fa = { secret: pending.secret, enabledAt: Date.now() };
  delete data.admin2faPending;
  db.save(data);
  res.json({ ok:true, message:'2FA đã được kích hoạt' });
});

app.post('/api/auth/2fa/disable', requireAnyAdmin, function (req, res){
  const data = db.load();
  delete data.admin2fa;
  delete data.admin2faPending;
  db.save(data);
  res.json({ ok:true, message:'2FA đã tắt' });
});

app.get('/api/auth/2fa/status', requireAnyAdmin, function (req, res){
  const data = db.load();
  res.json({ ok:true, enabled: !!(data.admin2fa && data.admin2fa.secret) });
});

// ===== USER REGISTRATION với bcrypt =====
app.post('/api/auth/register', loginLimiter, async function (req, res){
  const b = req.body || {};
  if (!b.username || b.username.length < 3) return res.status(400).json({ ok:false, error:'Username tối thiểu 3 ký tự' });
  if (!b.password || b.password.length < 8) return res.status(400).json({ ok:false, error:'Mật khẩu tối thiểu 8 ký tự' });
  try {
    const data = db.load();
    if (!data.users) data.users = [];
    const exists = data.users.find(u => (u.username||'').toLowerCase() === b.username.toLowerCase());
    if (exists) return res.status(409).json({ ok:false, error:'Username đã tồn tại' });
    const hash = await sec.hashPassword(b.password);
    const newUser = {
      id: 'u_' + Date.now(),
      username: b.username,
      fullname: b.fullname || b.username,
      phone: b.phone || '',
      email: b.email || '',
      passwordHash: hash,
      vip: 0,
      balance: 0,
      status: 'active',
      joinedAt: Date.now()
    };
    data.users.push(newUser);
    db.save(data);
    res.json({ ok:true, username: newUser.username });
  } catch(e) {
    res.status(500).json({ ok:false, error:'Lỗi: ' + e.message });
  }
});
app.post('/api/auth/logout', function (req, res) {
  pubAuth.logout(req, res);
  res.json({ ok:true });
});
app.get('/api/auth/me', function (req, res) {
  const u = pubAuth.getUser(req);
  if (!u) return res.json({ ok:false });
  res.json({ ok:true, username: u.username, role: u.role });
});

// ===== IDOL STUDIO =====
app.get('/idol-studio', pubAuth.requireStreamer, function (req, res) {
  const data = db.load();
  const user = pubAuth.getUser(req);
  const dbIdols = data.idols.filter(function(i){ return i.status==='active'; });
  // 🆕 Auto-detect idol record của user đang login
  const uname = user ? String(user.username || '').toLowerCase() : '';
  const myIdol = uname ? dbIdols.find(function(i){
    return (String(i.userId||'').toLowerCase() === uname) ||
           (String(i.username||'').toLowerCase() === uname) ||
           (String(i.name||'').toLowerCase() === uname);
  }) : null;
  const isAdmin = user && user.role === 'admin';
  res.render('tw-idol-studio', {
    active:'cat', activeCat:'idol',
    dbIdols: dbIdols,
    myIdol: myIdol,           // idol record của user đang đăng nhập
    isAdmin: isAdmin,         // admin được switch sang idol khác
    currentUser: user
  });
});

// RTMP server URL (config qua env)
// Mặc định trỏ về SRS đang chạy trên VPS (port 1935)
const RTMP_SERVER_URL = process.env.RTMP_SERVER_URL || 'rtmp://xoso66tv.com:1935/live';

app.get('/api/studio/get-key', pubAuth.requireStreamer, function (req, res){
  const data = db.load();
  const idolId = String(req.query.idolId||'');
  if (!idolId) return res.json({ ok:false, error:'Missing idolId' });
  if (!data.obs) data.obs = [];
  let obs = data.obs.find(function(o){ return o.requesterType==='idol' && o.requesterId===idolId; });
  // 🆕 AUTO-CREATE nếu chưa có (cho idol đã được cấp quyền canLive)
  if (!obs) {
    const idol = (data.idols || []).find(function(i){ return i.id === idolId; });
    if (!idol) return res.json({ ok:false, error:'Idol không tồn tại' });
    if (!idol.canLive) return res.json({ ok:false, error:'Idol chưa được admin cấp quyền LIVE' });
    obs = {
      id: 'obs_' + idolId + '_' + Date.now(),
      requesterType: 'idol',
      requesterId: idolId,
      requesterName: idol.name,
      // 🆕 Stream key = idolId (để FLV URL match: /live/{idolId}.flv)
      streamKey: idolId,
      rtmpServer: RTMP_SERVER_URL,
      status: 'approved',
      streamActive: false,
      autoCreated: true,
      createdAt: Date.now()
    };
    data.obs.push(obs);
    db.save(data);
  }
  // 🆕 MIGRATE: nếu streamKey cũ có prefix lạ (webrtc_, sk_) → đổi lại = idolId
  // để viewer FLV URL match đúng
  if (obs.streamKey && obs.streamKey !== idolId) {
    obs.streamKey = idolId;
    db.save(data);
  }
  // Đảm bảo RTMP URL luôn fresh
  if (!obs.rtmpServer || obs.rtmpServer.indexOf('stream.xoso66tv.com:1935') >= 0 || obs.rtmpServer.indexOf('xoso66tv.com:1935') >= 0) {
    obs.rtmpServer = RTMP_SERVER_URL;
    db.save(data);
  }
  res.json({ ok:true, streamKey: obs.streamKey, rtmpServer: obs.rtmpServer });
});

app.post('/api/studio/regenerate-key', pubAuth.requireStreamer, function (req, res){
  const idolId = String((req.body && req.body.idolId) || '');
  if (!idolId) return res.json({ ok:false, error:'Missing idolId' });
  const data = db.load();
  if (!data.obs) data.obs = [];
  let obs = data.obs.find(function(o){ return o.requesterType==='idol' && o.requesterId===idolId; });
  if (!obs) {
    const idol = (data.idols || []).find(function(i){ return i.id === idolId; });
    if (!idol) return res.json({ ok:false, error:'Idol không tồn tại' });
    obs = {
      id: 'obs_' + idolId + '_' + Date.now(),
      requesterType: 'idol', requesterId: idolId, requesterName: idol.name,
      status: 'approved', streamActive: false, autoCreated: true, createdAt: Date.now()
    };
    data.obs.push(obs);
  }
  // 🆕 Regenerate vẫn dùng idolId cho khớp viewer URL
  obs.streamKey = idolId;
  obs.rtmpServer = RTMP_SERVER_URL;
  obs.streamActive = false;
  db.save(data);
  res.json({ ok:true, streamKey: obs.streamKey, rtmpServer: obs.rtmpServer });
});

// 🆕 REAL test kết nối RTMP - check TCP socket SRS có sẵn sàng không
app.post('/api/studio/test-rtmp', pubAuth.requireStreamer, function (req, res){
  const net = require('net');
  const RTMP_HOST = process.env.RTMP_HOST || 'xoso66tv.com';
  const RTMP_PORT = parseInt(process.env.RTMP_PORT || '1935', 10);
  // Cho test localhost nếu Node chạy cùng server SRS
  const targets = ['127.0.0.1', RTMP_HOST];
  const tryHost = function(host, done){
    const sock = new net.Socket();
    let resolved = false;
    sock.setTimeout(3000);
    sock.connect(RTMP_PORT, host, function(){
      resolved = true;
      sock.destroy();
      done(null, { host: host, ok: true, latency: '<3s' });
    });
    sock.on('error', function(err){
      if (resolved) return;
      resolved = true;
      done(err);
    });
    sock.on('timeout', function(){
      if (resolved) return;
      resolved = true;
      sock.destroy();
      done(new Error('Timeout 3s'));
    });
  };
  // Thử 127.0.0.1 trước
  tryHost('127.0.0.1', function(err, result){
    if (!err && result) return res.json({ ok:true, host:'127.0.0.1', port: RTMP_PORT, message: '✅ RTMP server đang hoạt động (localhost)' });
    // Fallback domain
    tryHost(RTMP_HOST, function(err2, result2){
      if (!err2 && result2) return res.json({ ok:true, host: RTMP_HOST, port: RTMP_PORT, message: '✅ RTMP server đang hoạt động (' + RTMP_HOST + ')' });
      res.json({ ok:false, error: 'Không kết nối được RTMP port ' + RTMP_PORT + ' (' + (err2 ? err2.message : 'unknown') + ')' });
    });
  });
});

app.post('/api/studio/go-live', pubAuth.requireStreamer, function (req, res){
  const idolId   = String((req.body && req.body.idolId) || '');
  const title    = String((req.body && req.body.title) || '');
  const source   = String((req.body && req.body.source) || 'mobile');
  // 🆕 Chuyên mục stream (mặc định 'idol' nếu không gửi)
  const category = String((req.body && req.body.category) || '').toLowerCase();
  const validCats = ['idol','bongda','casino','esport'];
  if (!idolId) return res.json({ ok:false, error:'Missing idolId' });
  const data = db.load();
  let obs = data.obs.find(function(o){ return o.requesterType==='idol' && o.requesterId===idolId; });
  if (!obs) {
    // Auto-create entry for mobile webrtc (no OBS approval needed)
    obs = {
      id: 'o_' + Date.now(),
      requesterType: 'idol',
      requesterId: idolId,
      requesterName: 'Idol ' + idolId,
      rtmpServer: '',
      streamKey: 'webrtc_' + idolId,
      status: 'approved',
      createdAt: Date.now(),
      approvedAt: Date.now(),
      device: source === 'obs' ? 'OBS Studio' : 'Mobile WebRTC',
      streamActive: true,
      liveTitle: title
    };
    data.obs.push(obs);
  } else {
    obs.streamActive = true;
    obs.liveTitle = title;
    obs.liveStartedAt = Date.now();
  }
  // Also update idol.liveNow + category
  let idol = data.idols.find(function(i){ return i.id === idolId; });
  if (idol) {
    idol.liveNow = true;
    idol.liveTitle = title;
    if (validCats.indexOf(category) >= 0) idol.category = category;
    idol.liveStartedAt = Date.now();
  }
  db.save(data);
  // Push notify idol go live (nếu có VAPID + subscribers)
  try {
    if (idol) require('./lib/push').notifyIdolLive(idol).catch(function(){});
  } catch(e){}
  res.json({ ok:true, category: idol ? idol.category : null });
});

app.post('/api/studio/end-live', pubAuth.requireStreamer, function (req, res){
  const idolId = String((req.body && req.body.idolId) || '');
  const data = db.load();
  let obs = data.obs.find(function(o){ return o.requesterType==='idol' && o.requesterId===idolId && o.streamActive; });
  if (obs) {
    obs.streamActive = false;
    obs.liveEndedAt = Date.now();
  }
  let idol = data.idols.find(function(i){ return i.id === idolId; });
  if (idol) { idol.liveNow = false; }
  db.save(data);
  res.json({ ok:true });
});

app.post('/api/studio/set-pin', pubAuth.requireStreamer, function (req, res){
  const idolId = String((req.body && req.body.idolId) || '');
  const pin    = String((req.body && req.body.pin) || '');
  if (!idolId) return res.json({ ok:false, error:'Missing idolId' });
  if (!/^[0-9]{4}$/.test(pin)) return res.json({ ok:false, error:'PIN phải đúng 4 chữ số' });
  const data = db.load();
  const idol = data.idols.find(function(i){ return i.id === idolId; });
  if (!idol) return res.json({ ok:false, error:'Idol not found' });
  idol.pinCode = pin;
  idol.pinSetAt = Date.now();
  db.save(data);
  res.json({ ok:true });
});

app.post('/api/studio/remove-pin', pubAuth.requireStreamer, function (req, res){
  const idolId = String((req.body && req.body.idolId) || '');
  if (!idolId) return res.json({ ok:false, error:'Missing idolId' });
  const data = db.load();
  const idol = data.idols.find(function(i){ return i.id === idolId; });
  if (!idol) return res.json({ ok:false, error:'Idol not found' });
  delete idol.pinCode;
  delete idol.pinSetAt;
  db.save(data);
  res.json({ ok:true });
});

app.get('/api/studio/get-pin-status', function (req, res){
  const idolId = String(req.query.idolId || '');
  const data = db.load();
  const idol = data.idols.find(function(i){ return i.id === idolId; });
  if (!idol) return res.json({ ok:false, error:'Idol not found' });
  res.json({ ok:true, hasPin: !!idol.pinCode, pinSetAt: idol.pinSetAt || null });
});

// Brute-force tracking per IP
const pinAttempts = {};
app.post('/api/idol/verify-pin', function (req, res){
  const idolId = String((req.body && req.body.idolId) || '');
  const pin    = String((req.body && req.body.pin) || '');
  const ip     = req.ip || req.connection.remoteAddress || '';
  const key    = ip + ':' + idolId;
  // Throttle: max 5 attempts per minute
  if (!pinAttempts[key]) pinAttempts[key] = [];
  const now = Date.now();
  pinAttempts[key] = pinAttempts[key].filter(function(t){ return now - t < 60000; });
  if (pinAttempts[key].length >= 5) {
    return res.json({ ok:false, error:'Quá nhiều lần thử. Chờ 1 phút.' });
  }
  pinAttempts[key].push(now);
  const data = db.load();
  const idol = data.idols.find(function(i){ return i.id === idolId; });
  if (!idol) return res.json({ ok:false, error:'Idol not found' });
  if (!idol.pinCode) return res.json({ ok:true, message:'Phòng không cần PIN' });
  if (String(idol.pinCode) === pin) {
    delete pinAttempts[key]; // reset on success
    return res.json({ ok:true });
  }
  res.json({ ok:false, error:'Mã PIN không đúng' });
});

app.get('/api/live',     async function (req, res) { res.json({ updatedAt: Date.now(), list: await api.getLiveStreams(req.query.mon || null) }); });
app.get('/api/upcoming', async function (req, res) { res.json({ updatedAt: Date.now(), list: await api.getUpcomingStreams(req.query.mon || null, 20) }); });

app.get('/dang-nhap',     function (req, res) { res.render('tw-dang-nhap',     { active:'auth' }); });
app.get('/dang-ky',       function (req, res) { res.render('tw-dang-ky',       { active:'auth' }); });
app.get('/quen-mat-khau', function (req, res) { res.render('tw-quen-mat-khau', { active:'auth' }); });

app.get('/profile',      function (req, res) { res.render('tw-profile', { active:'profile', tabName: (req.query.tab || 'checkin') }); });

app.get('/gioi-thieu',             function (req, res) { res.render('tw-gioi-thieu',             { active:'static' }); });
app.get('/lien-he',                function (req, res) { res.render('tw-lien-he',                { active:'static' }); });
app.get('/chinh-sach-bao-mat',     function (req, res) { res.render('tw-chinh-sach-bao-mat',     { active:'static' }); });
app.get('/thoa-thuan-phat-song',   function (req, res) { res.render('tw-thoa-thuan-phat-song',   { active:'static' }); });
app.get('/dieu-khoan-su-dung',     function (req, res) { res.render('tw-dieu-khoan-su-dung',     { active:'static' }); });
app.get('/bo-suu-tap-qua',         function (req, res) { res.render('tw-bo-suu-tap-qua',         { active:'static' }); });

app.use('/admin', admin);
app.use('/', applyStreamer);  // /dang-ky-idol, /dang-ky-blv, /api/apply/*
app.use(pwdReset);
app.use(teleHook);
app.use(partnerHook);
app.use(linkRoute);
app.use(auth);
app.use(seo);

app.use(function (req, res) { res.status(404).render('tw-404'); });
app.use(function (err, req, res, next) {
  console.error(err);
  res.status(500).render('tw-500', { err: err });
});

const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, function () {
  console.log('XOSO66 TV (Tailwind) chạy tại ' + SITE);
  console.log('  Local:    http://localhost:' + PORT);
  console.log('  Network:  http://<YOUR-IP>:' + PORT + ' (truy cập từ điện thoại cùng WiFi)');
  console.log('  HTTPS:    Để bật camera trên điện thoại, dùng ngrok: ngrok http ' + PORT);
});
