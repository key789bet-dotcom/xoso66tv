/**
 * XOSO66 TV - Express server, Tailwind CSS, clean URL, SEO chuẩn
 */
require('dotenv').config();

// 🛡️ SENTRY phải init TRƯỚC khi require Express/routes để patch http module
const sentry = require('./lib/sentry');
sentry.init();

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
// 🔒 Rate limit login: 15 lần / 5 phút (đủ cho user nhớ sai pass vài lần + dev test)
const loginLimiter = sec.createLimiter({ max: 15, windowMs: 5*60*1000, message: 'Quá nhiều lần đăng nhập, đợi 5 phút' });
const apiLimiter   = sec.createLimiter({ max: 60, windowMs: 60*1000, message: 'Quá nhiều request, đợi 1 phút' });
const analytics= require('./lib/analytics');

const app  = express();
// Trust Cloudflare proxy → req.ip sẽ lấy đúng IP user thật từ CF-Connecting-IP
// (nhưng app sẽ KHÔNG log/expose IP này — chỉ dùng nội bộ cho rate limit + hash)
app.set('trust proxy', true);

// 🛡️ Mục 18: Helmet + CSP — phải attach SỚM, trước mọi route
try {
  const secHeaders = require('./lib/security-headers');
  secHeaders.attachSecurityHeaders(app);
} catch (e) {
  console.warn('[BOOT] ⚠️  Helmet not loaded:', e.message);
}

// Middleware: gán IP đã mask + hash vào req để dùng toàn site
app.use(function(req, res, next){
  req.maskedIp = privacy.getMaskedIp(req);
  req.hashedIp = privacy.getHashedIp(req);
  // KHÔNG để IP thật xuất hiện trong res.locals (template không expose ra HTML)
  res.locals.userIpMasked = req.maskedIp;
  next();
});

// 📊 Mục 9: Prometheus metrics
const metrics = require('./lib/metrics');
metrics.init();
app.use(metrics.middleware());
app.get('/metrics', metrics.metricsEndpoint);

// 🛡️ Mục 20: Turnstile CAPTCHA — expose site key cho EJS templates
const turnstile = require('./lib/turnstile');
app.use(function(req, res, next){
  res.locals.turnstileSiteKey = turnstile.getSiteKey() || '';
  res.locals.turnstileEnabled = turnstile.isConfigured();
  next();
});

// 🛡️ Mục 21: CSRF protection — ensure token cho mọi request + verify trên POST/PUT/DELETE
const csrf = require('./lib/csrf');
app.use(csrf.ensureToken);
// Verify CSRF cho POST/PUT/DELETE — PHẢI sau body-parser
// (sẽ attach sau khi express.json/urlencoded middleware đã chạy → xem dưới)

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

// ⚡ Gzip compression - giảm 70% kích thước HTML/JSON/CSS
try {
  const compression = require('compression');
  app.use(compression({
    level: 6,                              // balance giữa CPU và compression ratio
    threshold: 1024,                       // chỉ nén response > 1KB
    filter: function(req, res){
      // Skip nếu client yêu cầu no-compress
      if (req.headers['x-no-compression']) return false;
      // Không nén video/image stream (đã được nén sẵn)
      const type = res.getHeader('Content-Type') || '';
      if (/^(video|image)\//i.test(type)) return false;
      return compression.filter(req, res);
    }
  }));
  console.log('[perf] compression middleware enabled');
} catch(e) {
  console.warn('[perf] compression not installed, skip (npm i compression)');
}

// (Cache-Control cho HTML page được set ở middleware bên dưới sau apiLimiter để tránh override)

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// 🛡️ Mục 21: CSRF verify — phải SAU body-parser để đọc được req.body._csrf
//    Skip GET/HEAD/OPTIONS + webhook + health (config trong lib/csrf.js)
//    Có thể disable tạm bằng ENV CSRF_DISABLED=1 cho debug
if (process.env.CSRF_DISABLED !== '1') {
  app.use(csrf.verify);
}

// ⚡ Phase 2 Final — HTML CACHE cho guests (Redis 60s) — tăng tốc 5-10×
//    Cache trang chủ, idol-live, tin-tuc, lich-phat-song, ... cho user CHƯA login
//    User đã login → BYPASS (render dynamic). Trang admin/api → BYPASS
//    Disable: ENV HTML_CACHE_DISABLED=1
if (process.env.HTML_CACHE_DISABLED !== '1') {
  try {
    const htmlCache = require('./lib/html-cache');
    app.use(htmlCache.middleware({ ttl: 60 }));
    console.log('[perf] HTML cache middleware enabled (Redis 60s for guests)');
  } catch (e) { console.warn('[perf] HTML cache disabled:', e.message); }
}

// ⚡ Static assets - cache 30 ngày + immutable (file hash bust qua ?v=)
app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: '30d',
  etag: true,
  immutable: true,
  setHeaders: function(res, filepath){
    // CSS/JS/font/image: aggressive cache
    if (/\.(css|js|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|ico)$/i.test(filepath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    }
  }
}));
// User-uploaded avatars (persist outside public/ để không bị git overwrite)
const fs = require('fs');
const AVATAR_DIR = path.join(__dirname, 'uploads', 'avatars');
try { fs.mkdirSync(AVATAR_DIR, { recursive: true }); } catch(e){}
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '30d',
  etag: true,
  setHeaders: function(res){
    res.setHeader('Cache-Control', 'public, max-age=2592000');
  }
}));

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

// Rate limit all /api/* requests - EXCEPT chat polling (GET /api/chat/:roomId/recent)
// vì polling tần suất cao (mỗi 2s) nhưng không có nguy cơ abuse
app.use('/api/', function (req, res, next) {
  // Skip GET /api/chat/.../recent - polling đồng bộ chat, low risk
  if (req.method === 'GET' && req.path.indexOf('/chat/') === 0 && req.path.indexOf('/recent') > 0) {
    return next();
  }
  return apiLimiter(req, res, next);
});

// ⚡ Cache strategy:
//   - Trang public (home, idol, lich, news, etc): cache 60s + SWR 5p → click chuyển trang INSTANT
//   - Trang nhạy cảm (admin, profile, auth, dashboard): no-store để tránh leak data sau logout
//   - Static assets: 30 ngày immutable (đã set ở express.static)
app.use(function (req, res, next) {
  if (req.path.startsWith('/static') || req.path.startsWith('/uploads') || req.path.startsWith('/api')) {
    return next();  // skip, đã có cache header riêng
  }
  // Auth-sensitive paths: cấm cache hoàn toàn
  var sensitive = /^\/(admin|profile|idol-studio|nap-tien|dang-nhap|dang-ky|dang-xuat|quen-mat-khau|2fa|admin-2fa)(\/|$|\?)/i;
  if (sensitive.test(req.path)) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  } else {
    // Trang public - cho browser cache 60s, CDN/proxy cache 5 phút với stale-while-revalidate
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  }
  next();
});

app.use(async function (req, res, next) {
  res.locals.brand     = partners.brand;
  res.locals.partner   = partnerLinks.load();
  res.locals.banners   = bannersStore.listActive().length ? bannersStore.listActive() : partners.banners;
  // 🎁 Header banner (admin upload qua /admin/header-banner) — luôn pass vào template
  try {
    const _hbStore = require('./lib/header-banner-store');
    res.locals.headerBanner = _hbStore.get();
  } catch(e) { res.locals.headerBanner = { enabled: false, image: '', link: '', alt: '' }; }
  res.locals.cats      = api.CATEGORIES;
  res.locals.leagues   = api.FEATURED_LEAGUES;
  res.locals.active    = '';
  res.locals.activeCat = '';
  res.locals.path      = req.path;
  res.locals.siteUrl   = SITE;
  res.locals.seo       = null;
  try { res.locals.catCounts = await api.getCategoryCounts(); }
  catch (e) { res.locals.catCounts = {}; }
  // 🏆 League background map (admin set qua /admin/league-bg) — cần ở đây để mọi
  //    route render view (kể cả GET /) đều thấy. Lazy require tránh cycle.
  try { res.locals.leagueBgs = require('./lib/league-bg-store').list(); }
  catch (e) { res.locals.leagueBgs = {}; }
  // 🎨 Tab icons (admin upload qua /admin/tab-icons)
  try { res.locals.tabIcons = require('./lib/tab-icons-store').list(); }
  catch(e) { res.locals.tabIcons = {}; }
  next();
});

// ═══ Mục 31: ĐIỂM DANH + NHIỆM VỤ DAILY ═══
const checkinStore = require('./lib/checkin-store');
const missionStore = require('./lib/mission-store');

app.get('/api/checkin/status', function(req, res) {
  const u = pubAuth.getUser(req);
  if (!u || !u.username) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
  res.json(checkinStore.getStatus(u.username));
});

app.post('/api/checkin/claim', function(req, res) {
  const u = pubAuth.getUser(req);
  if (!u || !u.username) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
  res.json(checkinStore.claim(u.username));
});

app.get('/api/missions/status', function(req, res) {
  const u = pubAuth.getUser(req);
  if (!u || !u.username) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
  res.json(missionStore.getStatus(u.username));
});

app.post('/api/missions/claim/:id', function(req, res) {
  const u = pubAuth.getUser(req);
  if (!u || !u.username) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
  res.json(missionStore.claim(u.username, req.params.id));
});

// Endpoint chung để client track manually (chat send, gift, game, spin)
app.post('/api/missions/track/:id', function(req, res) {
  const u = pubAuth.getUser(req);
  if (!u || !u.username) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
  const allowedIds = ['send_chat_5','send_gift_1','play_game_1','spin_wheel_1'];
  if (allowedIds.indexOf(req.params.id) === -1) return res.json({ ok:false, error:'invalid mission' });
  const progress = missionStore.track(u.username, req.params.id);
  res.json({ ok:true, progress });
});

// 👀 Auto-track "watch_2_rooms" khi user vào /idol/:id hoặc /live/:id
app.use(function(req, res, next) {
  const p = req.path;
  if (req.method === 'GET' && (p.indexOf('/idol/') === 0 || p.indexOf('/live/') === 0)) {
    try {
      const u = pubAuth.getUser(req);
      if (u && u.username) missionStore.track(u.username, 'watch_2_rooms', 1);
    } catch (_) {}
  }
  next();
});

// Cleanup missions older than 7 days (run on boot + daily)
try { missionStore.cleanup(); } catch (_) {}
setInterval(function(){
  try { missionStore.cleanup(); } catch(_){}
}, 24 * 60 * 60 * 1000);

// ═══ Mục 26: PUSH NOTIFICATION CRONS ═══
// (Chỉ chạy ở worker 0 để tránh duplicate)
if (process.env.NODE_APP_INSTANCE === '0' || !process.env.NODE_APP_INSTANCE) {
  const push = require('./lib/push');

  // 📅 Daily digest 8:00 AM VN (UTC+7) → 1:00 AM UTC
  function scheduleDailyDigest() {
    function nextDigestTime() {
      const now = new Date();
      const vn = new Date(now.getTime() + 7 * 3600 * 1000);
      vn.setUTCHours(8, 0, 0, 0); // 8:00 VN
      const target = new Date(vn.getTime() - 7 * 3600 * 1000);
      if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
      return target - now;
    }
    setTimeout(function loop(){
      push.notifyDailyDigest().catch(function(e){ console.warn('[push] digest fail:', e.message); });
      console.log('[push] 📅 Sent daily digest');
      setTimeout(loop, 24 * 60 * 60 * 1000); // 24h
    }, nextDigestTime());
  }
  scheduleDailyDigest();

  // ⏰ Schedule stream reminder check mỗi 5 phút
  setInterval(function() {
    try {
      const scheduleStore = require('./lib/schedule-store');
      if (!scheduleStore || typeof scheduleStore.list !== 'function') return;
      const data = db.load();
      const schedules = scheduleStore.list ? scheduleStore.list() : (data.schedules || []);
      const now = Date.now();
      schedules.forEach(function(s){
        if (s.status !== 'approved') return;
        if (s._notifiedReminder) return;
        const startTs = new Date(s.startTime || s.startAt || 0).getTime();
        const minutesAway = (startTs - now) / 60000;
        // Notify if starting in 10-15 minutes
        if (minutesAway >= 10 && minutesAway <= 15) {
          const idol = (data.idols || []).find(function(i){ return i.id === s.idolId; });
          push.notifyScheduledStream({
            id: s.id,
            idolId: s.idolId,
            idolName: idol ? idol.name : s.idolId,
            startTime: new Date(startTs).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' }),
            avatar: idol ? idol.avatar : null
          }).catch(function(){});
          s._notifiedReminder = true;
          db.save(data);
        }
      });
    } catch (_) {}
  }, 5 * 60 * 1000);
}

// ═══ Mục 26: PUSH PREFERENCES API ═══
app.get('/api/push/topics', function(req, res){
  try {
    const push = require('./lib/push');
    const u = pubAuth.getUser(req);
    const topics = u && u.username ? push.getUserTopics(u.username) : [];
    res.json({ ok:true, all: push.ALL_TOPICS, subscribed: topics });
  } catch(e){ res.status(500).json({ ok:false, error: e.message }); }
});

app.post('/api/push/topics', function(req, res){
  try {
    const push = require('./lib/push');
    const u = pubAuth.getUser(req);
    if (!u || !u.username) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
    const topics = Array.isArray(req.body && req.body.topics) ? req.body.topics : [];
    push.updateUserTopics(u.username, topics);
    res.json({ ok:true, topics });
  } catch(e){ res.status(500).json({ ok:false, error: e.message }); }
});

// ═══ Mục 23: SSR OG IMAGE dynamic ═══
const ogImage = require('./lib/og-image');

function sendOgImage(res, bufferPromise) {
  bufferPromise.then(function(buf){
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.send(buf);
  }).catch(function(e){
    console.warn('[OG] generate fail:', e.message);
    res.status(500).send('OG generation error');
  });
}

app.get('/og/home.png',         function(req, res){ sendOgImage(res, ogImage.getHome()); });
app.get('/og/default.png',      function(req, res){ sendOgImage(res, ogImage.getDefault()); });
app.get('/og/idol/:id.png',     function(req, res){ sendOgImage(res, ogImage.getIdol(req.params.id)); });
app.get('/og/match/:slug.png',  function(req, res){
  // Try resolve match from API/DB
  api.getLiveStreams().then(function(live){
    const m = (live || []).find(function(x){ return (x.slug || x.id) === req.params.slug; });
    if (m) {
      sendOgImage(res, ogImage.getMatch({
        slug: req.params.slug,
        home: m.home, away: m.away,
        league: m.league || m.competition,
        time: m.time,
        isLive: true
      }));
    } else {
      sendOgImage(res, ogImage.getMatch({ slug: req.params.slug, home: 'TBD', away: 'TBD' }));
    }
  }).catch(function(){
    sendOgImage(res, ogImage.getMatch({ slug: req.params.slug, home: 'TBD', away: 'TBD' }));
  });
});

// ═══ Mục 24: SITEMAP + robots.txt ═══
app.get('/sitemap.xml', async function (req, res) {
  try {
    const sg = require('./lib/sitemap-gen');
    const { xml, fromCache } = await sg.getSitemap();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('X-Cache', fromCache);
    res.setHeader('Cache-Control', 'public, max-age=21600, stale-while-revalidate=86400');
    res.send(xml);
  } catch (e) {
    console.error('[SITEMAP] error:', e.message);
    res.status(500).send('Sitemap generation error');
  }
});

app.get('/robots.txt', function (req, res) {
  try {
    const sg = require('./lib/sitemap-gen');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(sg.getRobotsTxt());
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain');
    res.send('User-agent: *\nAllow: /\n');
  }
});

// Sitemap auto-regenerate mỗi 6 giờ (chỉ worker 0 để tránh duplicate)
if (process.env.NODE_APP_INSTANCE === '0' || !process.env.NODE_APP_INSTANCE) {
  setInterval(function() {
    try {
      const sg = require('./lib/sitemap-gen');
      sg.regenerate().then(function(r){
        console.log('[SITEMAP] 🔄 Scheduled regenerate done (' + (r.xml.length/1024).toFixed(1) + ' KB)');
      }).catch(function(e){
        console.warn('[SITEMAP] scheduled regen fail:', e.message);
      });
    } catch (_) {}
  }, 6 * 60 * 60 * 1000); // 6 giờ
}

// ═══ HEALTH CHECK — monitor SQLite + Redis + Backup ═══
app.get('/api/health', async function (req, res) {
  const redis = require('./lib/redis');
  let dbOk = false, dbUsers = 0;
  try {
    const data = require('./lib/db').load();
    dbOk = true;
    dbUsers = (data.users || []).length;
  } catch (_) {}
  // Mục 28: backup health
  let backup = null;
  try { backup = require('./lib/backup-status').getBackupHealth(); }
  catch (_) { backup = { ok: false, reason: 'status_module_error' }; }
  // Nếu backup stale → tự alert Sentry 1 lần/giờ (idempotent qua module cache)
  if (backup && !backup.ok && backup.reason === 'stale') {
    try {
      const sentry = require('./lib/sentry');
      if (sentry.isReady() && !global.__bk_alerted) {
        sentry.captureMessage(
          '🚨 Backup STALE: ' + (backup.hours || '?') + 'h since last backup',
          'warning'
        );
        global.__bk_alerted = true;
        setTimeout(function(){ global.__bk_alerted = false; }, 3600000); // 1h cooldown
      }
    } catch (_) {}
  }
  res.json({
    ok: true,
    service: 'xoso66tv',
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    db: { ok: dbOk, users: dbUsers },
    redis: { ready: redis.isReady() },
    backup: backup,
    pid: process.pid,
    memMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
  });
});

app.get('/', async function (req, res, next) {
  try {
    // Luon fetch tu API de site co noi dung; chi /live/:id can OBS
    const live     = await api.getLiveStreams();
    const upcoming = await api.getUpcomingStreams(null, 12);
    const finished = await api.getFinishedStreams(null, 8);
    const data     = db.load();
    const liveIdols= data.idols.filter(function(i){ return i.status==='active' && i.liveNow; });
    // Top Streamer: gộp BLV + Idol active, ưu tiên đang LIVE trước
    const _allActive = data.blvs.concat(data.idols).filter(function(x){return x.status==='active'});
    _allActive.sort(function(a,b){ return (b.liveNow?1:0) - (a.liveNow?1:0); });
    const _blvIds = (data.blvs || []).map(function(b){ return b.id; });
    const topStreamers = _allActive.slice(0, 16).map(function(s){
      var isBlv = _blvIds.indexOf(s.id) !== -1;
      return {
        id:        s.id,
        name:      s.name,
        avatar:    s.avatar,
        followers: (s.followers || s.viewers || 0).toLocaleString('vi-VN'),
        liveNow:   !!s.liveNow,
        href:      isBlv ? ('/live/' + s.id) : ('/idol/' + s.id),
        type:      isBlv ? 'blv' : 'idol'
      };
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
    // 🆕 Fallback 3: BLV CUSTOM MATCH — tìm trong data.schedules
    if (!match) {
      try {
        const _schedFb = require('./lib/schedule-store');
        const allApproved2 = _schedFb.listAll({ status: 'approved', userType: 'blv', limit: 500 });
        const fullId = String(req.params.id || '');
        const numId = id;
        const customMatch = allApproved2.find(s =>
          String(s.matchId || '') === fullId ||
          String(s.matchId || '') === numId ||
          (s.matchId && String(s.matchId).indexOf(numId) >= 0)
        );
        if (customMatch && customMatch.matchTitle) {
          const mv = customMatch.matchTitle.match(/^(.+?)\s+vs\s+(.+?)(?:\s+•|\s+\(|\s+\-|$)/i);
          const home = mv ? mv[1].trim() : (customMatch.matchTitle.split(' vs ')[0] || 'Đội nhà');
          const away = mv ? mv[2].trim() : (customMatch.matchTitle.split(' vs ')[1] || 'Đội khách');
          const dStart = new Date(customMatch.startTime || Date.now());
          const p = n => String(n).padStart(2,'0');
          match = {
            id: customMatch.matchId || req.params.id,
            sport: 'Soccer',
            league: customMatch.description || 'Trận BLV',
            home: home,
            away: away,
            homeBadge: '', awayBadge: '',
            score: null,
            date: dStart.getFullYear()+'-'+p(dStart.getMonth()+1)+'-'+p(dStart.getDate()),
            time: p(dStart.getHours())+':'+p(dStart.getMinutes()),
            matchTs: customMatch.startTime,
            venue: '',
            status: customMatch.streamActive ? 'live' : 'upcoming',
            statusText: customMatch.streamActive ? 'ĐANG LIVE' : 'Sắp diễn ra',
            poster: '',
            slug: req.params.id,
            _isCustomBlv: true,
            _blvStreamKey: customMatch.streamKey
          };
        }
      } catch(e) { console.warn('[LIVE] custom fallback fail:', e.message); }
    }
    if (!match) return res.status(404).render('tw-404');
    const all = await api.getLiveStreams().catch(function(){ return []; });
    const others = (all || []).filter(function (x) { return x.id !== match.id; }).slice(0, 6);
    let hasObs = hasAnyActiveStream('blv');

    // 🆕 Nếu là BLV custom match + schedule streamActive → có stream
    let blvStreamKey = null;
    try {
      const _schedKey = require('./lib/schedule-store');
      const matchIdFinal = String(match.id || req.params.id || '');
      const matchApprovedBlv = _schedKey.listAll({ status: 'approved', userType: 'blv', limit: 500 })
        .find(s => (String(s.matchId||'') === matchIdFinal ||
                    (s.matchId && String(s.matchId).indexOf(matchIdFinal) >= 0)) &&
                    s.streamKey);
      if (matchApprovedBlv) {
        blvStreamKey = matchApprovedBlv.streamKey;
        if (matchApprovedBlv.streamActive) hasObs = true;
      }
    } catch(e){}
    // 🆕 BLV thật đang stream match này: tìm trong schedules approved có matchId trùng + đang trong khung giờ
    let liveBlvs = [];
    try {
      const _sched = require('./lib/schedule-store');
      const _now = Date.now();
      const matchIdStr = String(match.id || req.params.id || '');
      const allApproved = _sched.listAll({ status: 'approved', userType: 'blv', limit: 500 });
      const dataLocal = db.load();
      liveBlvs = allApproved
        .filter(s => String(s.matchId || '') === matchIdStr || (s.matchTitle && match.title && s.matchTitle.includes(match.title)))
        .filter(s => _now >= (s.startTime - 30*60*1000) && _now <= (s.endTime + 3*3600*1000))
        .map(s => {
          const blv = (dataLocal.blvs || []).find(b => String(b.userId||'').toLowerCase() === s.username || String(b.username||'').toLowerCase() === s.username);
          return {
            name: (blv && blv.name) || s.username || 'BLV',
            avatar: (blv && blv.avatar) || null,
            isLive: !!s.streamActive,
            scheduleId: s.id
          };
        })
        .slice(0, 5);
    } catch(e) { console.warn('[LIVE] liveBlvs fail:', e.message); }
    // Chat banners (3 GIF/PNG trên đầu khung chat)
    let chatBanners = [];
    try {
      const _cbStore = require('./lib/chat-banners-store');
      chatBanners = _cbStore.active();
    } catch(e){}
    // Skin overlay (10 file PNG/JPG admin upload) — null nếu không active
    let skinConfig = null;
    try {
      const _skinStore = require('./lib/skin-store');
      skinConfig = _skinStore.activeConfig();
    } catch(e){}
    res.render('tw-live', { active:'home', match:match, others:others, hasObs: hasObs, liveBlvs: liveBlvs, blvStreamKey: blvStreamKey, chatBanners: chatBanners, skinConfig: skinConfig });
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
    // Data thật từ DB cho mobile: BLV active + Idol active để hiện trên card + filter
    const dbData = db.load();
    const blvs   = (dbData.blvs || []).filter(function(b){ return b.status === 'active'; });
    const idols  = (dbData.idols || []).filter(function(i){ return i.status === 'active'; });
    res.render('tw-lich-phat-song', { active:'lich', list:list, sport:sport, blvs:blvs, idols:idols });
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

// ═══ TIN TỨC - dùng news.json từ AI generate ═══
const newsStore = require('./lib/news-store');

app.get('/tin-tuc', function (req, res, next) {
  try {
    const list = newsStore.listRecent(30);
    res.render('tw-tin-tuc', { active:'news', list: list });
  } catch (e) { next(e); }
});

// GET /tin-tuc/:slug - chi tiết bài
app.get('/tin-tuc/:slug', function (req, res, next) {
  try {
    const article = newsStore.findBySlug(req.params.slug);
    if (!article) return res.status(404).render('tw-404');
    const related = newsStore.listRecent(6).filter(n => n.slug !== article.slug).slice(0, 4);
    res.render('tw-tin-tuc-detail', { active:'news', article: article, related: related });
  } catch (e) { next(e); }
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
  const obsRec = data.obs.find(function(o){
    return o.status==='approved'
        && (o.requesterId === idol.id || (o.requesterName||'').toLowerCase().indexOf((idol.name||'').toLowerCase()) >= 0);
  });
  const hasObs = !!(obsRec && obsRec.streamActive);
  // ⚡ Stream key thật (có random suffix nếu đã regenerate), fallback = idolId
  const actualStreamKey = (obsRec && obsRec.streamKey) ? obsRec.streamKey : idol.id;
  // Lay danh sach idol active de gesture swipe (vuot len/xuong chuyen phong)
  const allIdols = data.idols.filter(function(i){ return i.status==='active'; }).map(function(i){
    return { id: i.id, name: i.name, emoji: i.emoji || '👑', color: i.color || 0, lock: i.lock || 0 };
  });
  // Skin overlay (10 file PNG/JPG admin upload) — null nếu không active
  let skinConfig = null;
  try {
    const _skinStore = require('./lib/skin-store');
    skinConfig = _skinStore.activeConfig();
  } catch(e){}
  res.render('tw-idol-room', { active:'cat', activeCat:'idol', idolKey: req.params.id, dbIdol: idol, hasObs: hasObs, allIdols: allIdols, pinRequired: !!idol.pinCode, actualStreamKey: actualStreamKey, skinConfig: skinConfig });
});

// ===== PUBLIC AUTH (cookie-based for streamer protection) =====
app.post('/api/auth/login', sec.loginStrictLimiter, async function (req, res) {
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

app.post('/api/auth/2fa/verify-setup', sec.twoFaLimiter, requireAnyAdmin, function (req, res){
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
// 🚀 Phase 2.4.A: dùng API db.users.* (relational, scale 100k) — fallback db.load() nếu adapter cũ
app.post('/api/auth/register', sec.registerStrictLimiter, turnstile.middleware(), async function (req, res){
  const b = req.body || {};
  if (!b.username || b.username.length < 3) return res.status(400).json({ ok:false, error:'Username tối thiểu 3 ký tự' });
  if (!b.password || b.password.length < 8) return res.status(400).json({ ok:false, error:'Mật khẩu tối thiểu 8 ký tự' });
  try {
    const hash = await sec.hashPassword(b.password);

    // Check duplicate + create — dùng API mới nếu có
    if (db.users && typeof db.users.findByUsername === 'function') {
      const exists = await db.users.findByUsername(b.username);
      if (exists) return res.status(409).json({ ok:false, error:'Username đã tồn tại' });
      const id = await db.users.create({
        username: b.username,
        fullname: b.fullname || b.username,
        phone:    b.phone || null,
        email:    b.email || null,
        passwordHash: hash,
        role:    'user',
        vip:     0,
        xCoin:   0,
        status:  'active'
      });
      return res.json({ ok:true, username: b.username, id: id });
    }

    // Fallback API cũ (KV pattern)
    const data = db.load();
    if (!data.users) data.users = [];
    const exists = data.users.find(u => (u.username||'').toLowerCase() === b.username.toLowerCase());
    if (exists) return res.status(409).json({ ok:false, error:'Username đã tồn tại' });
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
app.get('/api/auth/me', async function (req, res) {
  const u = pubAuth.getUser(req);
  if (!u) return res.json({ ok:false });
  // Lookup full user để lấy balance + avatar
  let vnd = 0, coin = 0, avatar = '', fullname = '';
  try {
    let full = null;
    if (db.users && typeof db.users.findByUsername === 'function') {
      full = await db.users.findByUsername(u.username);
    } else {
      const data = db.load();
      full = (data.users || []).find(x => (x.username || '').toLowerCase() === (u.username||'').toLowerCase());
    }
    if (full) {
      vnd      = parseInt(full.vnd || 0, 10);
      coin     = parseInt(full.xCoin || full.coin || full.balance || 0, 10);
      avatar   = full.avatar || '';
      fullname = full.fullname || full.displayName || '';
    }
  } catch(e){}
  res.json({
    ok:true, username: u.username, role: u.role,
    user: { username: u.username, role: u.role, vnd: vnd, coin: coin, avatar: avatar, fullname: fullname }
  });
});

// ═══════════════════════════════════════════════════════════════
// 📷 UPLOAD AVATAR — user/idol/BLV
// ═══════════════════════════════════════════════════════════════
const multer = require('multer');
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },                 // tối đa 5MB
  fileFilter: function(req, file, cb){
    if (!/^image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype)) {
      return cb(new Error('Chỉ chấp nhận file ảnh JPG/PNG/WEBP/GIF'));
    }
    cb(null, true);
  }
});

// POST /api/upload/avatar - user upload avatar của mình
// Multipart form-data, field name: "avatar"
app.post('/api/upload/avatar', pubAuth.requireLogin, avatarUpload.single('avatar'), function (req, res) {
  const user = res.locals.publicUser || pubAuth.getUser(req) || {};
  if (!user.username) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
  if (!req.file)       return res.json({ ok:false, error:'Không có file upload' });

  try {
    const ext = (req.file.mimetype.match(/\/(jpe?g|png|webp|gif)/i) || ['','jpg'])[1].toLowerCase().replace('jpeg','jpg');
    const fname = user.username + '_' + Date.now().toString(36) + '.' + ext;
    const filepath = path.join(AVATAR_DIR, fname);
    fs.writeFileSync(filepath, req.file.buffer);
    const url = '/uploads/avatars/' + fname;

    const data = db.load();
    // Update user record
    const uIdx = (data.users || []).findIndex(x => (x.username || '').toLowerCase() === user.username);
    let oldAvatar = '';
    if (uIdx !== -1) {
      oldAvatar = data.users[uIdx].avatar || '';
      data.users[uIdx].avatar = url;
    }
    // Sync sang idol/blv record nếu có
    const role = user.role;
    if (role === 'idol' && Array.isArray(data.idols)) {
      const i = data.idols.findIndex(x => (x.userId || x.username || '').toLowerCase() === user.username);
      if (i !== -1) data.idols[i].avatar = url;
    }
    if (role === 'blv' && Array.isArray(data.blvs)) {
      const i = data.blvs.findIndex(x => (x.userId || x.username || '').toLowerCase() === user.username);
      if (i !== -1) data.blvs[i].avatar = url;
    }
    db.save(data);

    // Xoá ảnh cũ nếu là file upload (không xóa external URL)
    if (oldAvatar && oldAvatar.startsWith('/uploads/avatars/')) {
      try { fs.unlinkSync(path.join(__dirname, oldAvatar)); } catch(e){}
    }

    res.json({ ok:true, avatar: url, message:'Cập nhật ảnh đại diện thành công' });
  } catch (err) {
    console.error('[avatar upload]', err);
    res.json({ ok:false, error: err.message || 'Lỗi server' });
  }
});

// POST /api/upload/avatar/idol/:id - ADMIN upload cho 1 idol cụ thể
app.post('/api/upload/avatar/idol/:id', pubAuth.requireAdmin, avatarUpload.single('avatar'), function (req, res) {
  if (!req.file) return res.json({ ok:false, error:'Không có file' });
  try {
    const data = db.load();
    const i = (data.idols || []).findIndex(x => x.id === req.params.id);
    if (i === -1) return res.json({ ok:false, error:'Idol không tồn tại' });
    const ext = (req.file.mimetype.match(/\/(jpe?g|png|webp|gif)/i) || ['','jpg'])[1].toLowerCase().replace('jpeg','jpg');
    const fname = 'idol_' + req.params.id + '_' + Date.now().toString(36) + '.' + ext;
    fs.writeFileSync(path.join(AVATAR_DIR, fname), req.file.buffer);
    const url = '/uploads/avatars/' + fname;
    const old = data.idols[i].avatar || '';
    data.idols[i].avatar = url;
    // Sync sang user nếu link được
    const uname = (data.idols[i].userId || data.idols[i].username || '').toLowerCase();
    if (uname) {
      const ui = (data.users || []).findIndex(x => (x.username || '').toLowerCase() === uname);
      if (ui !== -1) data.users[ui].avatar = url;
    }
    db.save(data);
    if (old && old.startsWith('/uploads/avatars/')) { try { fs.unlinkSync(path.join(__dirname, old)); } catch(e){} }
    res.json({ ok:true, avatar: url });
  } catch (err) { res.json({ ok:false, error: err.message }); }
});

// POST /api/upload/avatar/blv/:id - ADMIN upload cho 1 BLV
app.post('/api/upload/avatar/blv/:id', pubAuth.requireAdmin, avatarUpload.single('avatar'), function (req, res) {
  if (!req.file) return res.json({ ok:false, error:'Không có file' });
  try {
    const data = db.load();
    const i = (data.blvs || []).findIndex(x => x.id === req.params.id);
    if (i === -1) return res.json({ ok:false, error:'BLV không tồn tại' });
    const ext = (req.file.mimetype.match(/\/(jpe?g|png|webp|gif)/i) || ['','jpg'])[1].toLowerCase().replace('jpeg','jpg');
    const fname = 'blv_' + req.params.id + '_' + Date.now().toString(36) + '.' + ext;
    fs.writeFileSync(path.join(AVATAR_DIR, fname), req.file.buffer);
    const url = '/uploads/avatars/' + fname;
    const old = data.blvs[i].avatar || '';
    data.blvs[i].avatar = url;
    const uname = (data.blvs[i].userId || data.blvs[i].username || '').toLowerCase();
    if (uname) {
      const ui = (data.users || []).findIndex(x => (x.username || '').toLowerCase() === uname);
      if (ui !== -1) data.users[ui].avatar = url;
    }
    db.save(data);
    if (old && old.startsWith('/uploads/avatars/')) { try { fs.unlinkSync(path.join(__dirname, old)); } catch(e){} }
    res.json({ ok:true, avatar: url });
  } catch (err) { res.json({ ok:false, error: err.message }); }
});

// Error handler cho multer (FileSize too large, etc.)
app.use(function(err, req, res, next){
  if (err instanceof multer.MulterError || /Chỉ chấp nhận|File too large/i.test(err.message || '')) {
    return res.status(400).json({ ok:false, error: err.message });
  }
  next(err);
});

// ===== IDOL STUDIO =====
app.get('/idol-studio', pubAuth.requireStreamer, function (req, res) {
  const user = pubAuth.getUser(req);
  // 🆕 BLV → redirect sang trang OBS riêng (clone style diendanbongda)
  if (user && user.role === 'blv') {
    return res.redirect('/blv-obs');
  }
  const data = db.load();
  const dbIdols = data.idols.filter(function(i){ return i.status==='active'; });
  const uname = user ? String(user.username || '').toLowerCase() : '';
  const isBlv = false; // never reach here for BLV (redirect above)
  let myIdol = null;
  let myBlv = null;

  if (isBlv) {
    // 🆕 BLV → CHỈ lookup data.blvs (tránh match nhầm idol có userId trùng)
    const blvs = data.blvs || [];
    const blvRec = blvs.find(function(b){
      return (String(b.userId||'').toLowerCase() === uname) ||
             (String(b.username||'').toLowerCase() === uname) ||
             (String(b.name||'').toLowerCase() === uname);
    });
    if (blvRec) {
      myBlv = blvRec;
      // Convert BLV record thành idol-shape để view tận dụng cấu trúc cũ
      myIdol = {
        id: blvRec.id || ('b_' + (blvRec.username || user.username)).toLowerCase(),
        name: blvRec.name || user.username,
        room: blvRec.room || ('Phòng BLV - ' + (blvRec.name || user.username)),
        emoji: blvRec.emoji || '🎙️',
        color: blvRec.color || 200,
        category: 'bongda',     // BLV mặc định là bóng đá
        streamMethod: 'obs',    // BLV luôn OBS
        userId: blvRec.userId,
        username: blvRec.username,
        _isBlvRecord: true
      };
    } else {
      // BLV chưa có profile → tạo idol-shape minimal từ user info
      myIdol = {
        id: ('b_' + uname),
        name: user.username,
        room: 'Phòng BLV - ' + user.username,
        emoji: '🎙️',
        color: 200,
        category: 'bongda',
        streamMethod: 'obs',
        userId: user.username,
        username: user.username,
        _isBlvRecord: true
      };
    }
  } else {
    // 🆕 IDOL (hoặc admin) → lookup trong dbIdols như cũ
    myIdol = uname ? dbIdols.find(function(i){
      return (String(i.userId||'').toLowerCase() === uname) ||
             (String(i.username||'').toLowerCase() === uname) ||
             (String(i.name||'').toLowerCase() === uname);
    }) : null;
  }

  const isAdmin = user && user.role === 'admin';

  // 📅 Check schedule active của user (approved + đang trong khung giờ)
  let activeSchedule = null;
  try {
    if (user && user.username) {
      const _sched = require('./lib/schedule-store');
      activeSchedule = _sched.getActiveSchedule(user.username);
    }
  } catch(e) {
    console.warn('[STUDIO] getActiveSchedule fail:', e.message);
  }

  res.render('tw-idol-studio', {
    active:'cat', activeCat:'idol',
    dbIdols: dbIdols,
    myIdol: myIdol,
    myBlv: myBlv,
    isAdmin: isAdmin,
    currentUser: user,
    publicUser: user,
    activeSchedule: activeSchedule,
    hasActiveSchedule: !!activeSchedule
  });
});

// ═══════════════════════════════════════════════════════════════
// 📡 BLV OBS PAGE - giao diện kết nối OBS theo từng trận
// (BLV-only, clone style diendanbongda admin/obs)
// ═══════════════════════════════════════════════════════════════
app.get('/blv-obs', pubAuth.requireStreamer, function (req, res) {
  const user = pubAuth.getUser(req);
  if (!user || (user.role !== 'blv' && user.role !== 'admin')) {
    return res.redirect('/idol-studio');
  }
  const data = db.load();
  const _sched = require('./lib/schedule-store');
  const uname = String(user.username || '').toLowerCase();

  // BLV record cho header
  const blvRec = (data.blvs || []).find(b =>
    String(b.userId || '').toLowerCase() === uname ||
    String(b.username || '').toLowerCase() === uname ||
    String(b.name || '').toLowerCase() === uname
  );
  const myBlvName = (blvRec && blvRec.name) || user.username;

  // Filter ngày (YYYY-MM-DD)
  const selectedDate = String(req.query.date || new Date().toISOString().slice(0, 10));
  const dayStart = new Date(selectedDate + 'T00:00:00').getTime();
  const dayEnd = dayStart + 24 * 3600 * 1000;

  // Lấy schedules approved của BLV trong ngày
  let mySchedules = _sched.listAll({ username: uname, status: 'approved', userType: 'blv', limit: 200 });
  if (user.role === 'admin') {
    // Admin xem tất cả BLV
    mySchedules = _sched.listAll({ status: 'approved', userType: 'blv', limit: 200 });
  }
  const dayMatches = mySchedules.filter(s => {
    const ts = s.startTime || 0;
    return ts >= dayStart && ts < dayEnd;
  });

  // Convert thành format match card
  const matches = dayMatches.map(function(s){
    const ts = s.startTime || 0;
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    // Parse home/away từ matchTitle nếu có "X vs Y"
    let home = '', away = '';
    if (s.matchTitle) {
      const mv = s.matchTitle.match(/^(.+?)\s+vs\s+(.+?)(?:\s+•|\s+\(|\s+\-|$)/i);
      if (mv) { home = mv[1].trim(); away = mv[2].trim(); }
      else { home = s.matchTitle; }
    }
    return {
      scheduleId: s.id,
      id: s.matchId || s.id,
      home: home || (s.matchTitle || s.title || 'Match'),
      away: away,
      league: s.description || '',
      time: p(d.getHours()) + ':' + p(d.getMinutes()),
      dateStr: p(d.getDate()) + '/' + p(d.getMonth()+1) + '/' + d.getFullYear(),
      streamKey: s.streamKey || null,
      rtmpUrl: s.streamKey ? (process.env.RTMP_SERVER_URL || 'rtmp://stream.xoso66tv.com:1936/live') : null,
      hlsUrl: s.streamKey ? ('https://live.xoso66tv.com/live/' + s.streamKey + '.m3u8') : null,
      isLive: !!s.streamActive,
      isEnded: !!s.streamEnded || (Date.now() > (s.endTime || 0) + 3 * 3600 * 1000),
      score: s.score || null
    };
  });

  res.render('tw-blv-obs', {
    active: 'cat', activeCat: 'idol',
    publicUser: user,
    myBlvName: myBlvName,
    selectedDate: selectedDate,
    matches: matches,
    maxConcurrent: 3
  });
});

// ═══ Helper: get BLV name + check role ═══
function _blvCtx(req) {
  const user = pubAuth.getUser(req);
  const data = db.load();
  const uname = user ? String(user.username || '').toLowerCase() : '';
  const blvRec = (data.blvs || []).find(b =>
    String(b.userId||'').toLowerCase() === uname ||
    String(b.username||'').toLowerCase() === uname ||
    String(b.name||'').toLowerCase() === uname);
  return {
    user, data, uname,
    myBlvName: (blvRec && blvRec.name) || (user && user.username) || 'BLV',
    blvRec
  };
}

// ═══ /blv-register - Đăng Ký BLV (chọn từ lịch thi đấu) ═══
app.get('/blv-register', pubAuth.requireStreamer, function(req, res){
  const { user, myBlvName } = _blvCtx(req);
  if (user.role !== 'blv' && user.role !== 'admin') return res.redirect('/idol-studio');
  const selectedDate = String(req.query.date || new Date().toISOString().slice(0, 10));
  res.render('tw-blv-register', { active:'cat', activeCat:'idol', publicUser: user, myBlvName, selectedDate });
});

// ═══ /blv-history - Lịch sử BLV (mọi status) ═══
app.get('/blv-history', pubAuth.requireStreamer, function(req, res){
  const { user, uname, myBlvName } = _blvCtx(req);
  if (user.role !== 'blv' && user.role !== 'admin') return res.redirect('/idol-studio');
  const _sched = require('./lib/schedule-store');
  const schedules = _sched.listAll({ username: uname, limit: 200 });
  res.render('tw-blv-history', { active:'cat', activeCat:'idol', publicUser: user, myBlvName, schedules });
});

// ═══ /blv-create - Tạo trận live tự do ═══
app.get('/blv-create', pubAuth.requireStreamer, function(req, res){
  const { user, myBlvName } = _blvCtx(req);
  if (user.role !== 'blv' && user.role !== 'admin') return res.redirect('/idol-studio');
  res.render('tw-blv-create', { active:'cat', activeCat:'idol', publicUser: user, myBlvName });
});

// ═══ /blv-matches - Trận đã duyệt ═══
app.get('/blv-matches', pubAuth.requireStreamer, function(req, res){
  const { user, uname, myBlvName } = _blvCtx(req);
  if (user.role !== 'blv' && user.role !== 'admin') return res.redirect('/idol-studio');
  const _sched = require('./lib/schedule-store');
  const schedules = _sched.listAll({ username: uname, status: 'approved', limit: 200 });
  res.render('tw-blv-matches', { active:'cat', activeCat:'idol', publicUser: user, myBlvName, schedules });
});

// ═══ /blv-share - Cấu hình share buttons ═══
app.get('/blv-share', pubAuth.requireStreamer, function(req, res){
  const { user, uname, myBlvName, data, blvRec } = _blvCtx(req);
  if (user.role !== 'blv' && user.role !== 'admin') return res.redirect('/idol-studio');
  const shareCfg = (blvRec && blvRec.shareConfig) || {};
  res.render('tw-blv-share', { active:'cat', activeCat:'idol', publicUser: user, myBlvName, shareCfg });
});

// API: lưu share config cho BLV
app.post('/api/blv/share-config', pubAuth.requireStreamer, function(req, res){
  try {
    const user = pubAuth.getUser(req);
    if (!user) return res.json({ ok:false, error:'Chưa đăng nhập' });
    const data = db.load();
    if (!Array.isArray(data.blvs)) data.blvs = [];
    const uname = String(user.username || '').toLowerCase();
    const idx = data.blvs.findIndex(b =>
      String(b.userId||'').toLowerCase() === uname ||
      String(b.username||'').toLowerCase() === uname);
    if (idx === -1) return res.json({ ok:false, error:'BLV record không tồn tại' });
    const body = req.body || {};
    data.blvs[idx].shareConfig = {
      cskhUrl: String(body.cskhUrl||'').slice(0,300),
      telegramUrl: String(body.telegramUrl||'').slice(0,300),
      registerUrl: String(body.registerUrl||'').slice(0,300),
      zaloUrl: String(body.zaloUrl||'').slice(0,300),
      pinnedMessage: String(body.pinnedMessage||'').slice(0,200),
      updatedAt: Date.now()
    };
    db.save(data);
    res.json({ ok:true });
  } catch(e){ res.json({ ok:false, error: e.message }); }
});

// API: BLV tạo stream key cho 1 trận (schedule approved)
app.post('/api/blv/match/:scheduleId/stream-key', pubAuth.requireStreamer, function(req, res){
  try {
    const user = pubAuth.getUser(req);
    if (!user || (user.role !== 'blv' && user.role !== 'admin')) {
      return res.json({ ok:false, error:'Chỉ BLV/admin' });
    }
    const _sched = require('./lib/schedule-store');
    const sId = String(req.params.scheduleId || '');
    const s = _sched.findById(sId);
    if (!s) return res.json({ ok:false, error:'Schedule không tồn tại' });
    if (s.status !== 'approved') return res.json({ ok:false, error:'Chưa được duyệt' });
    if (user.role !== 'admin' && s.username !== String(user.username||'').toLowerCase()) {
      return res.json({ ok:false, error:'Không phải schedule của bạn' });
    }
    // Sinh stream key duy nhất cho schedule này
    const data = db.load();
    if (!Array.isArray(data.schedules)) data.schedules = [];
    const idx = data.schedules.findIndex(x => x.id === sId);
    if (idx === -1) return res.json({ ok:false, error:'Không tìm thấy trong DB' });
    if (!data.schedules[idx].streamKey) {
      data.schedules[idx].streamKey = 'live_' + sId.slice(2) + '_' + Math.random().toString(36).slice(2, 10);
      db.save(data);
    }
    res.json({ ok:true, streamKey: data.schedules[idx].streamKey });
  } catch(e) { res.json({ ok:false, error: e.message }); }
});

// API: BLV sinh lại stream key
app.post('/api/blv/match/:scheduleId/regen-key', pubAuth.requireStreamer, function(req, res){
  try {
    const user = pubAuth.getUser(req);
    const sId = String(req.params.scheduleId || '');
    const data = db.load();
    if (!Array.isArray(data.schedules)) data.schedules = [];
    const idx = data.schedules.findIndex(x => x.id === sId);
    if (idx === -1) return res.json({ ok:false, error:'Không tìm thấy' });
    if (user.role !== 'admin' && data.schedules[idx].username !== String(user.username||'').toLowerCase()) {
      return res.json({ ok:false, error:'Không có quyền' });
    }
    data.schedules[idx].streamKey = 'live_' + sId.slice(2) + '_' + Math.random().toString(36).slice(2, 10);
    db.save(data);
    res.json({ ok:true, streamKey: data.schedules[idx].streamKey });
  } catch(e) { res.json({ ok:false, error: e.message }); }
});

// API: BLV manual go-live (mark streamActive=true ngay, không đợi OBS)
app.post('/api/blv/match/:scheduleId/go-live', pubAuth.requireStreamer, function(req, res){
  try {
    const user = pubAuth.getUser(req);
    const sId = String(req.params.scheduleId || '');
    const data = db.load();
    if (!Array.isArray(data.schedules)) data.schedules = [];
    const idx = data.schedules.findIndex(x => x.id === sId);
    if (idx === -1) return res.json({ ok:false, error:'Schedule không tồn tại' });
    if (user.role !== 'admin' && data.schedules[idx].username !== String(user.username||'').toLowerCase()) {
      return res.json({ ok:false, error:'Không có quyền' });
    }
    if (!data.schedules[idx].streamKey) return res.json({ ok:false, error:'Chưa tạo Stream Key' });
    if (data.schedules[idx].status !== 'approved') return res.json({ ok:false, error:'Schedule chưa được duyệt' });

    data.schedules[idx].streamActive = true;
    data.schedules[idx].streamEnded = false;
    data.schedules[idx].publishedAt = Date.now();
    db.save(data);
    res.json({ ok:true, schedule: data.schedules[idx] });
  } catch(e){ res.json({ ok:false, error: e.message }); }
});

// API: poll status stream (frontend gọi mỗi 3-5s)
app.get('/api/blv/match/:scheduleId/status', pubAuth.requireStreamer, function(req, res){
  try {
    const sId = String(req.params.scheduleId || '');
    const data = db.load();
    const s = (data.schedules || []).find(x => x.id === sId);
    if (!s) return res.json({ ok:false, error:'Schedule không tồn tại' });
    res.json({
      ok: true,
      scheduleId: sId,
      streamActive: !!s.streamActive,
      hasKey: !!s.streamKey,
      publishedAt: s.publishedAt || null,
      unpublishedAt: s.unpublishedAt || null
    });
  } catch(e){ res.json({ ok:false, error: e.message }); }
});

// API: BLV chủ động end live (kill stream từ phía server)
app.post('/api/blv/match/:scheduleId/end-live', pubAuth.requireStreamer, function(req, res){
  try {
    const user = pubAuth.getUser(req);
    const sId = String(req.params.scheduleId || '');
    const data = db.load();
    if (!Array.isArray(data.schedules)) data.schedules = [];
    const idx = data.schedules.findIndex(x => x.id === sId);
    if (idx === -1) return res.json({ ok:false, error:'Không tìm thấy' });
    if (user.role !== 'admin' && data.schedules[idx].username !== String(user.username||'').toLowerCase()) {
      return res.json({ ok:false, error:'Không có quyền' });
    }
    data.schedules[idx].streamActive = false;
    data.schedules[idx].streamEnded = true;
    data.schedules[idx].unpublishedAt = Date.now();
    db.save(data);
    res.json({ ok:true });
  } catch(e){ res.json({ ok:false, error: e.message }); }
});

// API: BLV xóa stream
app.post('/api/blv/match/:scheduleId/delete', pubAuth.requireStreamer, function(req, res){
  try {
    const user = pubAuth.getUser(req);
    const sId = String(req.params.scheduleId || '');
    const data = db.load();
    if (!Array.isArray(data.schedules)) data.schedules = [];
    const idx = data.schedules.findIndex(x => x.id === sId);
    if (idx === -1) return res.json({ ok:false, error:'Không tìm thấy' });
    if (user.role !== 'admin' && data.schedules[idx].username !== String(user.username||'').toLowerCase()) {
      return res.json({ ok:false, error:'Không có quyền' });
    }
    delete data.schedules[idx].streamKey;
    data.schedules[idx].streamActive = false;
    data.schedules[idx].streamEnded = true;
    db.save(data);
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, error: e.message }); }
});

// RTMP server URL (config qua env)
// Mặc định trỏ về SRS đang chạy trên VPS (port 1935)
const RTMP_SERVER_URL = process.env.RTMP_SERVER_URL || 'rtmp://xoso66tv.com:1935/live';

const scheduleStore = require('./lib/schedule-store');

app.get('/api/studio/get-key', pubAuth.requireStreamer, function (req, res){
  const data = db.load();
  const idolId = String(req.query.idolId||'');
  if (!idolId) return res.json({ ok:false, error:'Missing idolId' });

  // 🔐 SCHEDULE GATING: chỉ admin bypass, idol/BLV phải có schedule approved active
  const user = res.locals.publicUser || {};
  if (user.role !== 'admin') {
    const active = scheduleStore.getActiveSchedule(user.username);
    if (!active) {
      return res.json({
        ok: false,
        needSchedule: true,
        error: 'Bạn chưa có lịch live được duyệt. Vào "Đăng ký lịch live" để submit, đợi admin duyệt rồi quay lại.'
      });
    }
    // Hiện lịch active cho UI
    res.locals._activeSchedule = active;
  }

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
  const _active = res.locals._activeSchedule || null;
  res.json({
    ok:true,
    streamKey: obs.streamKey,
    rtmpServer: obs.rtmpServer,
    schedule: _active ? {
      title: _active.title,
      startTime: _active.startTime,
      endTime: _active.endTime,
      type: _active.type,
      matchTitle: _active.matchTitle
    } : null
  });
});

// ═══════════════════════════════════════════════════════════════
// SCHEDULE - đăng ký lịch live cho idol/BLV
// ═══════════════════════════════════════════════════════════════

// POST /api/schedule/request - idol/BLV submit lịch live mới
app.post('/api/schedule/request', pubAuth.requireStreamer, function (req, res) {
  const user = res.locals.publicUser || {};
  const b = req.body || {};
  const type = (b.type === 'match') ? 'match' : 'time';

  // Validate
  if (type === 'time') {
    if (!b.startTime || !b.endTime) return res.json({ ok:false, error:'Cần startTime + endTime' });
    if (parseInt(b.endTime,10) <= parseInt(b.startTime,10)) return res.json({ ok:false, error:'endTime phải sau startTime' });
    const minDuration = 30 * 60 * 1000;
    const maxDuration = 6 * 3600 * 1000;
    const dur = parseInt(b.endTime,10) - parseInt(b.startTime,10);
    if (dur < minDuration) return res.json({ ok:false, error:'Lịch tối thiểu 30 phút' });
    if (dur > maxDuration) return res.json({ ok:false, error:'Lịch tối đa 6 giờ' });
  } else if (type === 'match') {
    if (!b.matchId) return res.json({ ok:false, error:'Cần matchId' });
    if (!b.startTime) return res.json({ ok:false, error:'Cần startTime (giờ trận đấu)' });
    if (!b.endTime) b.endTime = parseInt(b.startTime,10) + 2.5 * 3600 * 1000;  // mặc định 2.5h cho trận
  }

  const item = scheduleStore.add({
    username: user.username,
    userType: user.role === 'blv' ? 'blv' : 'idol',
    type: type,
    startTime: b.startTime,
    endTime: b.endTime,
    title: b.title,
    description: b.description,
    matchId: b.matchId || null,
    matchTitle: b.matchTitle || null
  });
  res.json({ ok:true, schedule: item });
});

// GET /api/schedule/mine - xem lịch của mình
app.get('/api/schedule/mine', pubAuth.requireStreamer, function (req, res) {
  const user = res.locals.publicUser || {};
  const list = scheduleStore.listByUser(user.username);
  const active = scheduleStore.getActiveSchedule(user.username);
  res.json({ ok:true, list: list, active: active });
});

// DELETE /api/schedule/:id - cancel pending của mình
app.delete('/api/schedule/:id', pubAuth.requireStreamer, function (req, res) {
  const user = res.locals.publicUser || {};
  const ok = scheduleStore.cancel(req.params.id, user.username);
  if (!ok) return res.json({ ok:false, error:'Không thể huỷ (đã được duyệt hoặc không phải lịch của bạn)' });
  res.json({ ok:true });
});

// GET /api/schedule/notifications - xem bell notif (cho idol/BLV)
app.get('/api/schedule/notifications', pubAuth.requireLogin, function (req, res) {
  const user = res.locals.publicUser || {};
  const list = scheduleStore.listNotifications(user.username, { limit: 20 });
  res.json({ ok:true, list: list, unread: list.filter(n => !n.read).length });
});

// POST /api/schedule/notifications/:id/read
app.post('/api/schedule/notifications/:id/read', pubAuth.requireLogin, function (req, res) {
  const user = res.locals.publicUser || {};
  const ok = scheduleStore.markNotifRead(user.username, req.params.id);
  res.json({ ok: ok });
});

// ═══ ADMIN: review schedule ═══
app.get('/api/admin/schedules/list', pubAuth.requireAdmin, function (req, res) {
  const status = req.query.status || null;
  const list = scheduleStore.listAll({ status: status, limit: 200 });
  res.json({ ok:true, list: list, stats: scheduleStore.stats() });
});

app.post('/api/admin/schedules/:id/approve', pubAuth.requireAdmin, function (req, res) {
  const user = res.locals.publicUser || {};
  const item = scheduleStore.approve(req.params.id, user.username);
  if (!item) return res.json({ ok:false, error:'Schedule không tồn tại' });
  // Notify idol/BLV
  scheduleStore.pushNotification(item.username, {
    title: '✅ Lịch live đã được duyệt!',
    body: '"' + item.title + '" - ' + new Date(item.startTime).toLocaleString('vi-VN'),
    type: 'schedule-approved',
    link: '/idol-studio'
  });
  res.json({ ok:true, schedule: item });
});

app.post('/api/admin/schedules/:id/reject', pubAuth.requireAdmin, function (req, res) {
  const user = res.locals.publicUser || {};
  const reason = String((req.body && req.body.reason) || '').trim();
  if (!reason) return res.json({ ok:false, error:'Cần nhập lý do từ chối' });
  const item = scheduleStore.reject(req.params.id, reason, user.username);
  if (!item) return res.json({ ok:false, error:'Schedule không tồn tại' });
  scheduleStore.pushNotification(item.username, {
    title: '❌ Lịch live bị từ chối',
    body: 'Lý do: ' + reason,
    type: 'schedule-rejected',
    link: '/idol-studio'
  });
  res.json({ ok:true, schedule: item });
});

// Helper endpoint: list upcoming matches để idol pick khi đăng ký theo trận
app.get('/api/upcoming-list', pubAuth.requireStreamer, async function (req, res) {
  try {
    const list = await api.getUpcomingStreams(null, 40);
    res.json({ ok:true, list: list });
  } catch (e) { res.json({ ok:false, error: e.message }); }
});

// Admin page render
app.get('/admin/schedules', pubAuth.requireAdmin, function (req, res) {
  res.render('admin/schedules', { active:'schedules' });
});

// ═══════════════════════════════════════════════════════════════
// 📊 LIVE SESSIONS - thống kê + tiền công
// ═══════════════════════════════════════════════════════════════
const sessionStore = require('./lib/session-store');

// GET /api/sessions/mine - idol/blv xem session của mình
app.get('/api/sessions/mine', pubAuth.requireStreamer, function (req, res) {
  const user = res.locals.publicUser || {};
  const list = sessionStore.listByUser(user.username, { limit: 100 });
  const stats = sessionStore.stats(user.username);
  res.json({ ok: true, list: list, stats: stats });
});

// ADMIN: GET /api/admin/sessions/list - xem TẤT CẢ sessions
app.get('/api/admin/sessions/list', pubAuth.requireAdmin, function (req, res) {
  const opts = {
    userType: req.query.userType || null,
    username: req.query.username || null,
    paidStatus: req.query.paid || null,  // 'paid' | 'unpaid'
    limit: parseInt(req.query.limit, 10) || 200
  };
  if (req.query.from) opts.from = parseInt(req.query.from, 10);
  if (req.query.to) opts.to = parseInt(req.query.to, 10);
  const list = sessionStore.listAll(opts);
  res.json({ ok: true, list: list, total: list.length });
});

// ADMIN: GET /api/admin/sessions/stats?username=
app.get('/api/admin/sessions/stats', pubAuth.requireAdmin, function (req, res) {
  const username = req.query.username || null;
  const stats = sessionStore.stats(username);
  res.json({ ok: true, stats: stats });
});

// ADMIN: POST /api/admin/sessions/:id/mark-paid
app.post('/api/admin/sessions/:id/mark-paid', pubAuth.requireAdmin, function (req, res) {
  const user = res.locals.publicUser || {};
  const s = sessionStore.markPaid(req.params.id, user.username);
  if (!s) return res.json({ ok:false, error:'Session không tồn tại' });
  res.json({ ok: true, session: s });
});

// ADMIN: POST /api/admin/sessions/:id/unmark-paid
app.post('/api/admin/sessions/:id/unmark-paid', pubAuth.requireAdmin, function (req, res) {
  const s = sessionStore.unmarkPaid(req.params.id);
  if (!s) return res.json({ ok:false, error:'Session không tồn tại' });
  res.json({ ok: true, session: s });
});

// ADMIN: POST /api/admin/payment-rate
// body: { userType: 'idol'|'blv', idOrUsername, perHour, perMatch, useMatchRate }
app.post('/api/admin/payment-rate', pubAuth.requireAdmin, function (req, res) {
  const b = req.body || {};
  const userType = b.userType === 'blv' ? 'blv' : 'idol';
  if (!b.idOrUsername) return res.json({ ok:false, error:'Cần idOrUsername' });
  const item = sessionStore.setRate(userType, b.idOrUsername, {
    perHour: b.perHour,
    perMatch: b.perMatch,
    useMatchRate: b.useMatchRate
  });
  if (!item) return res.json({ ok:false, error:'Không tìm thấy user' });
  res.json({ ok:true, rate: item.paymentRate, name: item.name });
});

// ADMIN: GET /api/admin/payment-rate?userType=idol&idOrUsername=...
app.get('/api/admin/payment-rate', pubAuth.requireAdmin, function (req, res) {
  const userType = req.query.userType === 'blv' ? 'blv' : 'idol';
  const rate = sessionStore.getRate(userType, req.query.idOrUsername);
  res.json({ ok:true, rate: rate });
});

// Admin page render: thống kê + payment
app.get('/admin/payment', pubAuth.requireAdmin, function (req, res) {
  const dbData = db.load();
  res.render('admin/payment', {
    active:'payment',
    idols: (dbData.idols || []).filter(i => i.status === 'active'),
    blvs:  (dbData.blvs  || []).filter(b => b.status === 'active')
  });
});

// ═══════════════════════════════════════════════════════════════
// 💰 NẠP TIỀN (Deposit) — Ngân hàng + USDT
// ═══════════════════════════════════════════════════════════════
const depositStore = require('./lib/deposit-store');
const paymentCfg   = require('./lib/payment-config');

// GET /api/payment/config - lấy thông tin TK ngân hàng/USDT để hiển thị cho user
app.get('/api/payment/config', function (req, res) {
  const c = paymentCfg.load();
  // KHÔNG trả tỉ giá riêng tư, KHÔNG ẩn account info
  res.json({
    ok: true,
    config: {
      bank: c.enabled.bank ? {
        bankName: c.bank.bankName,
        bankCode: c.bank.bankCode,
        accountNo: c.bank.accountNo,
        accountName: c.bank.accountName,
        branch: c.bank.branch
      } : null,
      usdt: c.enabled.usdt ? {
        network: c.usdt.network,
        address: c.usdt.address,
        rateVnd: c.usdt.rateVnd
      } : null,
      bonus: c.bonus,
      enabled: c.enabled
    }
  });
});

// POST /api/payment/qr - sinh URL QR VietQR
app.post('/api/payment/qr', pubAuth.requireLogin, function (req, res) {
  const b = req.body || {};
  const amount = parseInt(b.amount, 10) || 0;
  const addInfo = String(b.addInfo || '').slice(0, 100);
  res.json({ ok:true, url: paymentCfg.vietQrUrl(amount, addInfo) });
});

// POST /api/deposit/request - user gửi yêu cầu nạp tiền
app.post('/api/deposit/request', pubAuth.requireLogin, function (req, res) {
  const user = res.locals.publicUser || pubAuth.getUser(req) || {};
  if (!user.username) return res.json({ ok:false, error:'Cần đăng nhập' });
  const b = req.body || {};
  const cfg = paymentCfg.load();
  const method = (b.method === 'usdt') ? 'usdt' : 'bank';

  let amountVnd = parseInt(b.amountVnd, 10) || 0;
  let usdtAmount = parseFloat(b.usdtAmount) || 0;

  if (method === 'bank') {
    if (amountVnd < (cfg.bonus.minDepositVnd || 50000)) {
      return res.json({ ok:false, error:'Tối thiểu nạp ' + (cfg.bonus.minDepositVnd || 50000).toLocaleString('vi-VN') + ' VND' });
    }
    if (amountVnd > 500000000) {
      return res.json({ ok:false, error:'Tối đa 500.000.000 VND/lần. Liên hệ admin nếu cần nạp nhiều hơn.' });
    }
  } else {
    if (usdtAmount < 1) return res.json({ ok:false, error:'Tối thiểu nạp 1 USDT' });
    if (usdtAmount > 100000) return res.json({ ok:false, error:'Tối đa 100,000 USDT/lần' });
    // VND tương đương theo tỉ giá hiện tại (admin chỉnh sau khi check)
    amountVnd = Math.floor(usdtAmount * (cfg.usdt.rateVnd || 26000));
  }

  const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
  const dep = depositStore.add({
    username: user.username,
    method: method,
    amountVnd: amountVnd,
    usdtAmount: usdtAmount,
    usdtNetwork: b.usdtNetwork,
    usdtTxHash: b.usdtTxHash,
    proofImage: b.proofImage,
    note: b.note,
    ip: ip
  });

  // Noti admin
  try {
    scheduleStore.pushNotification('admin', {
      title: '💰 Yêu cầu nạp tiền mới',
      body: '@' + user.username + ' nạp ' + amountVnd.toLocaleString('vi-VN') + ' VND qua ' + (method === 'bank' ? 'Ngân hàng' : 'USDT ' + (b.usdtNetwork || 'TRC20')) + ' • Mã: ' + dep.id,
      type: 'deposit-request',
      link: '/admin/payment?tab=deposit'
    });
  } catch(e){}

  res.json({
    ok: true,
    deposit: dep,
    requestId: dep.id,
    transferContent: dep.id,        // user PHẢI ghi mã này vào nội dung CK
    bankInfo: cfg.enabled.bank ? cfg.bank : null,
    usdtInfo: cfg.enabled.usdt ? cfg.usdt : null,
    qrUrl: method === 'bank' ? paymentCfg.vietQrUrl(amountVnd, dep.id) : ''
  });
});

// GET /api/deposit/mine - user xem lịch sử nạp
app.get('/api/deposit/mine', pubAuth.requireLogin, function (req, res) {
  const user = res.locals.publicUser || pubAuth.getUser(req) || {};
  if (!user.username) return res.json({ ok:false, error:'Cần đăng nhập' });
  const list = depositStore.listByUser(user.username, { limit: 50 });
  res.json({ ok:true, list: list });
});

// POST /api/deposit/cancel/:id - user huỷ pending
app.post('/api/deposit/cancel/:id', pubAuth.requireLogin, function (req, res) {
  const user = res.locals.publicUser || pubAuth.getUser(req) || {};
  if (!user.username) return res.json({ ok:false, error:'Cần đăng nhập' });
  const ok = depositStore.cancel(req.params.id, user.username);
  if (!ok) return res.json({ ok:false, error:'Không huỷ được (đã xử lý hoặc không tồn tại)' });
  res.json({ ok:true });
});

// ═══ ADMIN ═══
// GET /api/admin/payment-config
app.get('/api/admin/payment-config', pubAuth.requireAdmin, function (req, res) {
  res.json({ ok:true, config: paymentCfg.load() });
});

// POST /api/admin/payment-config - save
app.post('/api/admin/payment-config', pubAuth.requireAdmin, function (req, res) {
  const cfg = paymentCfg.save(req.body || {});
  res.json({ ok:true, config: cfg });
});

// GET /api/admin/deposit/list
app.get('/api/admin/deposit/list', pubAuth.requireAdmin, function (req, res) {
  const opts = {
    status: req.query.status || null,
    method: req.query.method || null,
    username: req.query.username || null,
    limit: parseInt(req.query.limit, 10) || 200
  };
  res.json({ ok:true, list: depositStore.listAll(opts), stats: depositStore.stats() });
});

// POST /api/admin/deposit/:id/credit - admin duyệt + cộng VND
// body: { creditedVnd }
app.post('/api/admin/deposit/:id/credit', pubAuth.requireAdmin, function (req, res) {
  const adminUser = res.locals.publicUser || pubAuth.getUser(req) || {};
  const b = req.body || {};
  const dep = depositStore.findById(req.params.id);
  if (!dep) return res.json({ ok:false, error:'Không tìm thấy yêu cầu' });

  // Default = amountVnd request
  const credited = parseInt(b.creditedVnd, 10) || dep.amountVnd || 0;
  const r = depositStore.credit(req.params.id, credited, adminUser.username || 'admin');
  if (!r) return res.json({ ok:false, error:'Không duyệt được (đã xử lý hoặc user không tồn tại)' });

  // Noti user
  try {
    scheduleStore.pushNotification(r.deposit.username, {
      title: '💰 Nạp tiền thành công!',
      body: 'Đã cộng ' + credited.toLocaleString('vi-VN') + ' VND vào ví. Số dư: ' + r.newBalance.toLocaleString('vi-VN') + ' VND',
      type: 'deposit-credited',
      link: '/profile?tab=wallet'
    });
  } catch(e){}

  res.json({ ok:true, deposit: r.deposit, newBalance: r.newBalance });
});

// POST /api/admin/deposit/:id/reject
app.post('/api/admin/deposit/:id/reject', pubAuth.requireAdmin, function (req, res) {
  const adminUser = res.locals.publicUser || pubAuth.getUser(req) || {};
  const b = req.body || {};
  const d = depositStore.reject(req.params.id, b.reason, adminUser.username || 'admin');
  if (!d) return res.json({ ok:false, error:'Không từ chối được' });
  try {
    scheduleStore.pushNotification(d.username, {
      title: '❌ Yêu cầu nạp tiền bị từ chối',
      body: (d.rejectReason || 'Vui lòng kiểm tra lại thông tin') + '. Mã: ' + d.id,
      type: 'deposit-rejected',
      link: '/profile?tab=wallet'
    });
  } catch(e){}
  res.json({ ok:true, deposit: d });
});

// Render trang nạp tiền riêng (full UI)
app.get('/nap-tien', pubAuth.requireLogin, function (req, res) {
  const user = pubAuth.getUser(req);
  res.render('tw-nap-tien', {
    active:'profile',
    publicUser: user,
    paymentConfig: paymentCfg.load()
  });
});

// ═══════════════════════════════════════════════════════════════
// 🎁 PREMIUM GIFTS - Quà THẬT (mua bằng VND nạp) → tính earnings cho streamer
// ═══════════════════════════════════════════════════════════════
const giftsLib   = require('./lib/gifts');
const giftTxStore= require('./lib/gift-tx-store');

// Expose PREMIUM_GIFTS cho EJS template (modal tặng quà thật) - EJS không có require()
app.locals.PREMIUM_GIFTS = giftsLib.PREMIUM_GIFTS;

// ⚡ Tailwind precompiled detection - check file đã build chưa
try {
  const builtCssPath = path.join(__dirname, 'public', 'css', 'tailwind-built.css');
  app.locals.tailwindBuilt = fs.existsSync(builtCssPath);
  if (app.locals.tailwindBuilt) {
    const stat = fs.statSync(builtCssPath);
    console.log('[perf] tailwind precompiled: ' + (stat.size / 1024).toFixed(1) + 'KB (vs CDN ~270KB)');
  } else {
    console.warn('[perf] tailwind FALLBACK CDN - chạy `npm run build:css` để tối ưu');
  }
} catch(e) { app.locals.tailwindBuilt = false; }

// GET /api/gifts/premium - danh sách quà thật
app.get('/api/gifts/premium', function (req, res) {
  res.json({ ok:true, list: giftsLib.PREMIUM_GIFTS });
});

// POST /api/gift/send - user tặng quà thật cho idol/BLV
// body: { giftId, qty, toIdolId? hoặc toUsername }
app.post('/api/gift/send', pubAuth.requireLogin, function (req, res) {
  const user = res.locals.publicUser || {};
  const b = req.body || {};
  const giftId = String(b.giftId || '');
  const qty = Math.max(1, Math.min(99, parseInt(b.qty, 10) || 1));

  const gift = giftsLib.findPremium(giftId);
  if (!gift) return res.json({ ok:false, error:'Quà không hợp lệ hoặc không phải quà thật' });

  // Xác định người nhận
  const data = db.load();
  let toUsername = String(b.toUsername || '').toLowerCase();
  let toIdolId = b.toIdolId || null;
  if (toIdolId && !toUsername) {
    const idol = (data.idols || []).find(i => i.id === toIdolId);
    if (idol) toUsername = (idol.userId || idol.username || '').toLowerCase();
  }
  if (!toUsername) {
    const blv = (data.blvs || []).find(x => x.id === toIdolId);
    if (blv) toUsername = (blv.userId || blv.username || '').toLowerCase();
  }
  if (!toUsername) return res.json({ ok:false, error:'Không xác định được người nhận' });
  if (toUsername === user.username) return res.json({ ok:false, error:'Không thể tự tặng quà' });

  const totalVnd = gift.priceVnd * qty;

  // Trừ VND của user (số dư nạp thật từ xoso66)
  const userIdx = (data.users || []).findIndex(u => (u.username || '').toLowerCase() === user.username);
  if (userIdx === -1) return res.json({ ok:false, error:'User không tồn tại' });
  const userObj = data.users[userIdx];
  const balVnd = parseInt(userObj.vnd || 0, 10);
  if (balVnd < totalVnd) {
    return res.json({
      ok:false,
      error:'Số dư VND không đủ. Cần ' + totalVnd.toLocaleString('vi-VN') + 'đ, hiện có ' + balVnd.toLocaleString('vi-VN') + 'đ. Vui lòng nạp thêm.',
      needTopup: true,
      currentBalance: balVnd,
      required: totalVnd
    });
  }
  userObj.vnd = balVnd - totalVnd;
  db.save(data);

  // Tạo tx + tính earnings cho streamer
  const tx = giftTxStore.add({
    fromUser: user.username,
    toUser: toUsername,
    toIdolId: toIdolId,
    gift: gift,
    qty: qty
  });

  // Notification cho streamer
  try {
    scheduleStore.pushNotification(toUsername, {
      title: '🎁 Nhận được quà THẬT!',
      body: '@' + user.username + ' tặng ' + qty + 'x ' + gift.icon + ' ' + gift.name + ' (+' + tx.earnedVnd.toLocaleString('vi-VN') + 'đ)',
      type: 'gift-received',
      link: '/profile?tab=studio'
    });
  } catch(e){}

  res.json({
    ok: true,
    tx: tx,
    newBalance: userObj.vnd,
    streamerEarned: tx.earnedVnd
  });
});

// GET /api/gifts/received - streamer xem quà thật nhận được
app.get('/api/gifts/received', pubAuth.requireStreamer, function (req, res) {
  const user = res.locals.publicUser || {};
  const list = giftTxStore.listByStreamer(user.username, { limit: 200 });
  const stats = giftTxStore.stats(user.username);
  const top = giftTxStore.topDonors(user.username, 10);
  res.json({ ok:true, list: list, stats: stats, topDonors: top });
});

// ADMIN: GET /api/admin/gifts/list - xem tất cả gift tx
app.get('/api/admin/gifts/list', pubAuth.requireAdmin, function (req, res) {
  const opts = {
    toUser: req.query.toUser || null,
    fromUser: req.query.fromUser || null,
    paid: req.query.paid || null,
    limit: parseInt(req.query.limit, 10) || 200
  };
  const list = giftTxStore.listAll(opts);
  res.json({ ok:true, list: list, stats: giftTxStore.stats() });
});

// ═══════════════════════════════════════════════════════════════
// 💸 WITHDRAW - Idol/BLV rút tiền công
// ═══════════════════════════════════════════════════════════════
const withdrawStore = require('./lib/withdraw-store');

// ═══════════════════════════════════════════════════════════════
// 🪙 COIN/PHÚT XEM — Idol set giá, viewer auto trừ mỗi phút
// ═══════════════════════════════════════════════════════════════
const coinRateStore = require('./lib/coin-rate-store');

// GET /api/idol/:id/coin-rate - lấy giá phòng (public)
app.get('/api/idol/:id/coin-rate', function(req, res) {
  const rate = coinRateStore.getRate(req.params.id);
  res.json({ ok:true, idolId: req.params.id, coinPerMin: rate });
});

// POST /api/idol/:id/coin-rate - idol/admin set giá
// body: { rate }
app.post('/api/idol/:id/coin-rate', pubAuth.requireStreamer, function(req, res) {
  const user = res.locals.publicUser || pubAuth.getUser(req) || {};
  const r = parseInt((req.body && req.body.rate) || 0, 10);
  const newRate = coinRateStore.setRate(req.params.id, r, user.username);
  if (newRate === null) return res.json({ ok:false, error:'Idol không tồn tại' });
  if (newRate === false) return res.json({ ok:false, error:'Không có quyền (chỉ idol đó hoặc admin)' });
  res.json({ ok:true, coinPerMin: newRate });
});

// ═══════════════════════════════════════════════════════════════
// 📡 STREAM METHOD — idol chọn 'mobile' (camera điện thoại) hoặc 'obs'
// BLV mặc định luôn là 'obs' (cố định, không đổi được)
// ═══════════════════════════════════════════════════════════════
app.get('/api/idol/:id/stream-method', function(req, res) {
  try {
    const data = db.load();
    const idol = (data.idols || []).find(i => i.id === req.params.id);
    if (!idol) return res.json({ ok:false, error:'Idol không tồn tại' });
    const method = idol.streamMethod || 'mobile';
    res.json({ ok:true, idolId: req.params.id, streamMethod: method });
  } catch(e) {
    res.json({ ok:false, error: e.message });
  }
});

app.post('/api/idol/:id/stream-method', pubAuth.requireStreamer, function(req, res) {
  try {
    const user = res.locals.publicUser || pubAuth.getUser(req) || {};
    const method = String((req.body && req.body.method) || '').toLowerCase();
    if (method !== 'mobile' && method !== 'obs') {
      return res.json({ ok:false, error:'method phải là mobile hoặc obs' });
    }
    const data = db.load();
    const idx = (data.idols || []).findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.json({ ok:false, error:'Idol không tồn tại' });

    // Permission: chỉ idol owner hoặc admin
    const idol = data.idols[idx];
    const owner = String(idol.userId || idol.username || '').toLowerCase();
    const me = String(user.username || '').toLowerCase();
    const isAdminUser = (user.role === 'admin');
    if (owner !== me && !isAdminUser) {
      return res.json({ ok:false, error:'Không có quyền (chỉ idol đó hoặc admin)' });
    }

    data.idols[idx].streamMethod = method;
    db.save(data);
    res.json({ ok:true, streamMethod: method });
  } catch(e) {
    res.json({ ok:false, error: e.message });
  }
});

// POST /api/room/:idolId/charge - viewer auto tick mỗi phút
app.post('/api/room/:idolId/charge', pubAuth.requireLogin, function(req, res) {
  const user = res.locals.publicUser || pubAuth.getUser(req) || {};
  if (!user.username) return res.json({ ok:false, error:'Cần đăng nhập' });
  const result = coinRateStore.chargeViewer(user.username, req.params.idolId);
  res.json(result);
});

// ═══════════════════════════════════════════════════════════════
// 🏆 LEAGUE BACKGROUND — ảnh nền card cho từng giải đấu
// ═══════════════════════════════════════════════════════════════
const leagueBgStore = require('./lib/league-bg-store');
const LEAGUE_BG_DIR = path.join(__dirname, 'uploads', 'leagues');
try { fs.mkdirSync(LEAGUE_BG_DIR, { recursive: true }); } catch(e){}

// Expose toàn bộ league bg map cho mọi request (để tw-stream-card đọc được)
app.use(function(req, res, next){
  try { res.locals.leagueBgs = leagueBgStore.list(); } catch(e){ res.locals.leagueBgs = {}; }
  next();
});

// Multer cho upload league bg (riêng vì size lớn hơn avatar)
const leagueBgUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB cho banner ngang
  fileFilter: function(req, file, cb){
    if (!/^image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype)) {
      return cb(new Error('Chỉ chấp nhận JPG/PNG/WEBP/GIF'));
    }
    cb(null, true);
  }
});

// ADMIN: GET danh sách giải đấu đã set ảnh + auto detect từ matches live/upcoming
app.get('/api/admin/league-bg/list', pubAuth.requireAdmin, async function(req, res) {
  try {
    const map = leagueBgStore.list();
    // Detect tất cả league đang xuất hiện
    let detected = new Set();
    try {
      const [live, upcoming] = await Promise.all([api.getLiveStreams(), api.getUpcomingStreams(null, 50)]);
      [].concat(live, upcoming).forEach(function(m){
        if (m && m.league) detected.add(m.league);
      });
    } catch(e){}
    // Merge với những giải đã có ảnh
    Object.keys(map).forEach(function(k){ detected.add(k); });
    res.json({
      ok: true,
      backgrounds: map,
      detectedLeagues: Array.from(detected).sort()
    });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// ADMIN: POST upload ảnh cho 1 giải
// form-data: leagueName=string, file=image
app.post('/api/admin/league-bg/upload', pubAuth.requireAdmin, leagueBgUpload.single('file'), function(req, res) {
  try {
    const leagueName = String((req.body && req.body.leagueName) || '').trim();
    if (!leagueName) return res.json({ ok:false, error:'Thiếu tên giải đấu' });
    if (!req.file)   return res.json({ ok:false, error:'Thiếu file ảnh' });

    const ext = (req.file.mimetype.match(/\/(jpe?g|png|webp|gif)/i) || ['','jpg'])[1].toLowerCase().replace('jpeg','jpg');
    const slug = leagueName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
    const fname = 'league_' + slug + '_' + Date.now().toString(36) + '.' + ext;
    fs.writeFileSync(path.join(LEAGUE_BG_DIR, fname), req.file.buffer);
    const url = '/uploads/leagues/' + fname;

    // Xoá ảnh cũ nếu có
    const old = leagueBgStore.get(leagueName);
    leagueBgStore.set(leagueName, url);
    if (old && old.startsWith('/uploads/leagues/')) {
      try { fs.unlinkSync(path.join(__dirname, old)); } catch(e){}
    }
    res.json({ ok:true, leagueName: leagueName, url: url });
  } catch(e) { res.json({ ok:false, error:e.message }); }
});

// ADMIN: POST xoá ảnh
app.post('/api/admin/league-bg/remove', pubAuth.requireAdmin, function(req, res) {
  const leagueName = String((req.body && req.body.leagueName) || '').trim();
  if (!leagueName) return res.json({ ok:false, error:'Thiếu tên giải' });
  const old = leagueBgStore.remove(leagueName);
  if (old && old.startsWith('/uploads/leagues/')) {
    try { fs.unlinkSync(path.join(__dirname, old)); } catch(e){}
  }
  res.json({ ok:true });
});

// Trang admin
app.get('/admin/league-bg', pubAuth.requireAdmin, function(req, res) {
  res.render('admin/league-bg', { active: 'league-bg' });
});

// POST /api/withdraw/request - idol/BLV gửi yêu cầu rút tiền
app.post('/api/withdraw/request', pubAuth.requireStreamer, function (req, res) {
  const user = res.locals.publicUser || {};
  const b = req.body || {};
  const amount = parseInt(b.amount, 10) || 0;

  if (amount < 50000)     return res.json({ ok:false, error:'Số tiền tối thiểu 50.000 VND' });
  if (amount > 100000000) return res.json({ ok:false, error:'Số tiền tối đa 100.000.000 VND/lần' });

  const method = (b.method === 'usdt') ? 'usdt' : 'bank';

  if (method === 'bank') {
    if (!b.bankName)    return res.json({ ok:false, error:'Cần chọn ngân hàng' });
    if (!b.bankAccount || !/^\d{6,20}$/.test(String(b.bankAccount))) {
      return res.json({ ok:false, error:'STK phải gồm 6-20 chữ số' });
    }
    if (!b.bankHolder || String(b.bankHolder).trim().length < 3) {
      return res.json({ ok:false, error:'Tên chủ TK quá ngắn' });
    }
  } else {
    if (!b.usdtAddress || String(b.usdtAddress).trim().length < 25) {
      return res.json({ ok:false, error:'Địa chỉ USDT không hợp lệ' });
    }
  }

  // Check balance available: sessions earned + GIFT earnings - paid - pending
  let earned = 0;
  try {
    const stats = sessionStore.stats(user.username);
    earned = (stats && (stats.totalEarned || stats.earned)) || 0;
  } catch(e){}
  try {
    earned += giftTxStore.totalEarnedByStreamer(user.username);
  } catch(e){}
  const alreadyPaid    = withdrawStore.totalPaidByUser(user.username);
  const alreadyPending = withdrawStore.totalPendingByUser(user.username);
  const available = Math.max(0, earned - alreadyPaid - alreadyPending);

  if (amount > available) {
    return res.json({
      ok:false,
      error:'Số dư khả dụng không đủ. Bạn có ' + available.toLocaleString('vi-VN') + ' VND khả dụng.'
    });
  }

  // Determine userType
  let userType = 'user';
  try {
    const d = db.load();
    if ((d.idols || []).some(i => (i.username || '').toLowerCase() === user.username)) userType = 'idol';
    else if ((d.blvs || []).some(x => (x.username || '').toLowerCase() === user.username)) userType = 'blv';
  } catch(e){}

  const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();

  const item = withdrawStore.add({
    username: user.username,
    userType: userType,
    amount: amount,
    method: method,
    bankName: b.bankName,
    bankAccount: b.bankAccount,
    bankHolder: b.bankHolder,
    usdtNetwork: b.usdtNetwork,
    usdtAddress: b.usdtAddress,
    note: b.note,
    ip: ip
  });

  // Notification cho admin (qua schedule-store notification queue dùng chung)
  try {
    const scheduleStore = require('./lib/schedule-store');
    scheduleStore.pushNotification('admin', {
      title: '💸 Yêu cầu rút tiền mới',
      body: '@' + user.username + ' rút ' + amount.toLocaleString('vi-VN') + ' VND qua ' + (method === 'bank' ? 'Ngân hàng' : 'USDT'),
      type: 'withdraw-request',
      link: '/admin/payment?tab=withdraw'
    });
  } catch(e){}

  res.json({ ok:true, requestId: item.id, id: item.id, available: available - amount });
});

// GET /api/withdraw/mine - idol/blv xem lịch sử rút tiền của mình
app.get('/api/withdraw/mine', pubAuth.requireStreamer, function (req, res) {
  const user = res.locals.publicUser || {};
  const list = withdrawStore.listByUser(user.username, { limit: 50 });

  let sessionEarned = 0, giftEarned = 0;
  try {
    const s = sessionStore.stats(user.username);
    sessionEarned = (s && (s.totalEarned || s.earned)) || 0;
  } catch(e){}
  try { giftEarned = giftTxStore.totalEarnedByStreamer(user.username); } catch(e){}
  const earned  = sessionEarned + giftEarned;
  const paid    = withdrawStore.totalPaidByUser(user.username);
  const pending = withdrawStore.totalPendingByUser(user.username);
  res.json({
    ok:true, list: list,
    balance: {
      earned: earned,
      sessionEarned: sessionEarned,
      giftEarned: giftEarned,
      paid: paid,
      pending: pending,
      available: Math.max(0, earned - paid - pending)
    }
  });
});

// POST /api/withdraw/cancel/:id - user cancel pending của mình
app.post('/api/withdraw/cancel/:id', pubAuth.requireStreamer, function (req, res) {
  const user = res.locals.publicUser || {};
  const ok = withdrawStore.cancel(req.params.id, user.username);
  if (!ok) return res.json({ ok:false, error:'Không huỷ được (đã xử lý hoặc không tồn tại)' });
  res.json({ ok:true });
});

// ADMIN: GET /api/admin/withdraw/list
app.get('/api/admin/withdraw/list', pubAuth.requireAdmin, function (req, res) {
  const opts = {
    status: req.query.status || null,
    method: req.query.method || null,
    username: req.query.username || null,
    limit: parseInt(req.query.limit, 10) || 200
  };
  const list = withdrawStore.listAll(opts);
  res.json({ ok:true, list: list, stats: withdrawStore.stats() });
});

// ADMIN: POST /api/admin/withdraw/:id/approve
app.post('/api/admin/withdraw/:id/approve', pubAuth.requireAdmin, function (req, res) {
  const adminUser = res.locals.publicUser || {};
  const w = withdrawStore.approve(req.params.id, adminUser.username || 'admin');
  if (!w) return res.json({ ok:false, error:'Không duyệt được' });
  try {
    const scheduleStore = require('./lib/schedule-store');
    scheduleStore.pushNotification(w.username, {
      title: '✅ Yêu cầu rút tiền đã được duyệt',
      body: 'Rút ' + w.amount.toLocaleString('vi-VN') + ' VND đang được xử lý chuyển khoản.',
      type: 'withdraw-approved',
      link: '/profile?tab=wallet'
    });
  } catch(e){}
  res.json({ ok:true, withdraw: w });
});

// ADMIN: POST /api/admin/withdraw/:id/paid
// body: { txId }
app.post('/api/admin/withdraw/:id/paid', pubAuth.requireAdmin, function (req, res) {
  const adminUser = res.locals.publicUser || {};
  const b = req.body || {};
  const w = withdrawStore.markPaid(req.params.id, adminUser.username || 'admin', b.txId);
  if (!w) return res.json({ ok:false, error:'Không đánh dấu được' });
  try {
    const scheduleStore = require('./lib/schedule-store');
    scheduleStore.pushNotification(w.username, {
      title: '💰 Đã chuyển tiền thành công',
      body: 'Bạn đã nhận ' + w.amount.toLocaleString('vi-VN') + ' VND. ' + (w.paidTxId ? 'Mã GD: ' + w.paidTxId : ''),
      type: 'withdraw-paid',
      link: '/profile?tab=wallet'
    });
  } catch(e){}
  res.json({ ok:true, withdraw: w });
});

// ADMIN: POST /api/admin/withdraw/:id/reject
// body: { reason }
app.post('/api/admin/withdraw/:id/reject', pubAuth.requireAdmin, function (req, res) {
  const adminUser = res.locals.publicUser || {};
  const b = req.body || {};
  const w = withdrawStore.reject(req.params.id, b.reason, adminUser.username || 'admin');
  if (!w) return res.json({ ok:false, error:'Không từ chối được' });
  try {
    const scheduleStore = require('./lib/schedule-store');
    scheduleStore.pushNotification(w.username, {
      title: '❌ Yêu cầu rút tiền bị từ chối',
      body: (w.rejectReason || 'Vui lòng kiểm tra lại thông tin') + '. Số tiền không bị trừ.',
      type: 'withdraw-rejected',
      link: '/profile?tab=wallet'
    });
  } catch(e){}
  res.json({ ok:true, withdraw: w });
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
  // ⚡ Stream key mới: idolId + random suffix 8 ký tự
  // Format: i_yennhi_a1b2c3d4 → bảo mật + dễ trace
  var randomSuffix = Math.random().toString(36).slice(2, 10);
  obs.streamKey = idolId + '_' + randomSuffix;
  obs.rtmpServer = RTMP_SERVER_URL;
  obs.streamActive = false;
  obs.regeneratedAt = Date.now();
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

// ═══════════════════════════════════════════════════════════════
// 🔐 SRS HTTP CALLBACK HOOKS — verify stream key trước khi cho push
// ═══════════════════════════════════════════════════════════════
// SRS sẽ gọi POST endpoint khi có ai push/pull stream.
// Response body "0" = allowed, anything else = rejected.
// Config trong srs.conf:
//   http_hooks {
//     enabled         on;
//     on_publish      http://127.0.0.1:4001/api/srs/on-publish;
//     on_unpublish    http://127.0.0.1:4001/api/srs/on-unpublish;
//   }
//
// SRS request body:
// { "action":"on_publish", "client_id":"...", "ip":"...", "vhost":"...",
//   "app":"live", "stream":"i_yennhi_k3f9p2x1", "param":"?..." }
//
// Bảo mật: chỉ idol có obs.streamKey khớp + còn lịch active mới được publish.

// POST /api/srs/on-publish - check stream key có hợp lệ không
app.post('/api/srs/on-publish', function(req, res) {
  const body = req.body || {};
  const streamName = String(body.stream || '');
  const clientIp = String(body.ip || '');
  console.log('[SRS hook] on_publish:', streamName, 'from', clientIp);

  if (!streamName) {
    console.warn('[SRS hook] ❌ Reject: no stream name');
    return res.status(403).send('1');
  }

  try {
    const data = db.load();

    // ═══ 🆕 Check key trong data.schedules (BLV per-match key) ═══
    if (streamName.startsWith('live_') && Array.isArray(data.schedules)) {
      const sIdx = data.schedules.findIndex(s => s.streamKey === streamName);
      if (sIdx !== -1) {
        const s = data.schedules[sIdx];
        if (s.status !== 'approved') {
          console.warn('[SRS hook BLV] ❌ Reject: schedule chưa approved:', streamName);
          return res.status(403).send('1');
        }
        // Single publisher protect
        if (s.streamActive && s.publisherIp && s.publisherIp !== clientIp) {
          const sinceLast = Date.now() - (s.publishedAt || 0);
          if (sinceLast < 30000) {
            console.warn('[SRS hook BLV] ❌ Reject: stream đã active từ IP khác');
            return res.status(403).send('1');
          }
        }
        // Mark active
        data.schedules[sIdx].streamActive = true;
        data.schedules[sIdx].publishedAt = Date.now();
        data.schedules[sIdx].publisherIp = clientIp;
        db.save(data);
        console.log('[SRS hook BLV] ✅ Accept publish:', streamName, '→ schedule:', s.id, 'match:', s.matchId);
        return res.status(200).send('0');
      }
    }

    // ═══ Legacy: check data.obs (idol/blv cũ) ═══
    const obs = (data.obs || []).find(o => o.streamKey === streamName);
    if (!obs) {
      console.warn('[SRS hook] ❌ Reject: stream key không tồn tại trong obs/schedules:', streamName);
      return res.status(403).send('1');
    }
    if (obs.status !== 'approved') {
      console.warn('[SRS hook] ❌ Reject: OBS chưa approved:', streamName);
      return res.status(403).send('1');
    }
    if (obs.streamActive && obs.publisherIp && obs.publisherIp !== clientIp) {
      const sinceLast = Date.now() - (obs.publishedAt || 0);
      if (sinceLast < 30000) {
        console.warn('[SRS hook] ❌ Reject: stream đã active từ IP khác:', obs.publisherIp, '≠', clientIp);
        return res.status(403).send('1');
      }
    }
    const idolId = obs.requesterId;
    const idol = (data.idols || []).find(i => i.id === idolId);
    const blv  = (data.blvs  || []).find(b => b.id === idolId);
    const subject = idol || blv;
    if (!subject) {
      console.warn('[SRS hook] ❌ Reject: idol/blv không tồn tại:', idolId);
      return res.status(403).send('1');
    }
    if (subject.status !== 'active' || subject.canLive === false) {
      console.warn('[SRS hook] ❌ Reject: idol/blv không active hoặc bị ban:', idolId);
      return res.status(403).send('1');
    }
    try {
      const sched = scheduleStore.getActiveSchedule(subject.userId || subject.username || '');
      if (!sched) {
        console.warn('[SRS hook] ❌ Reject: không có lịch approved active:', idolId);
        return res.status(403).send('1');
      }
    } catch(e) {
      console.warn('[SRS hook] ⚠️ schedule check error, allowing:', e.message);
    }
    obs.streamActive = true;
    obs.publishedAt = Date.now();
    obs.publisherIp = clientIp;
    db.save(data);
    console.log('[SRS hook] ✅ Accept publish (obs):', streamName, '→ idol:', idolId);
    return res.status(200).send('0');
  } catch(e) {
    console.error('[SRS hook] Error:', e);
    return res.status(403).send('1');
  }
});

// POST /api/srs/on-unpublish - cleanup khi OBS disconnect
app.post('/api/srs/on-unpublish', function(req, res) {
  const body = req.body || {};
  const streamName = String(body.stream || '');
  console.log('[SRS hook] on_unpublish:', streamName);
  try {
    const data = db.load();
    // BLV schedule key cleanup
    if (Array.isArray(data.schedules)) {
      const sIdx = data.schedules.findIndex(s => s.streamKey === streamName);
      if (sIdx !== -1) {
        data.schedules[sIdx].streamActive = false;
        data.schedules[sIdx].unpublishedAt = Date.now();
        db.save(data);
        console.log('[SRS hook BLV] on_unpublish schedule:', streamName);
        return res.status(200).send('0');
      }
    }
    // Legacy obs
    const obs = (data.obs || []).find(o => o.streamKey === streamName);
    if (obs) {
      obs.streamActive = false;
      obs.unpublishedAt = Date.now();
      db.save(data);
    }
    try {
      const idol = (data.idols || []).find(i => obs && i.id === obs.requesterId);
      if (idol) {
        idol.liveNow = false;
        db.save(data);
      }
    } catch(e){}
  } catch(e) {
    console.error('[SRS hook] on_unpublish error:', e);
  }
  return res.status(200).send('0');
});

// POST /api/srs/on-play - optional log viewer (không reject)
app.post('/api/srs/on-play', function(req, res) {
  // Cho phép tất cả viewer xem (KHÔNG check key vì URL FLV public)
  return res.status(200).send('0');
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

app.get('/profile',      function (req, res) {
  // Lấy user từ JWT cookie để view biết role (idol/blv/admin → show tab "Quản Lý Kênh")
  const user = pubAuth.getUser(req);
  res.render('tw-profile', {
    active:'profile',
    tabName: (req.query.tab || 'checkin'),
    publicUser: user  // ← truyền role vào view
  });
});

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

// ═══════════════════════════════════════════════════════════════
// CHAT SERVER-SIDE: tất cả viewer trong phòng thấy CÙNG tin nhắn
// ⚠️ PHẢI ĐĂNG KÝ TRƯỚC 404 catch-all middleware
// ═══════════════════════════════════════════════════════════════
const roomChat = require('./lib/room-chat');

// GET /api/chat/:roomId/recent?since=<lastMsgId>
app.get('/api/chat/:roomId/recent', function (req, res) {
  const roomId = String(req.params.roomId || '').slice(0, 64);
  if (!roomId) return res.json({ ok:false, error:'roomId required' });
  const sinceId = parseInt(req.query.since || '0', 10);
  const msgs = roomChat.getMessages(roomId, sinceId);
  res.set('Cache-Control', 'no-store');
  res.json({ ok:true, messages: msgs, serverTime: Date.now() });
});

// POST /api/chat/:roomId/send  body {text}
app.post('/api/chat/:roomId/send', function (req, res) {
  const roomId = String(req.params.roomId || '').slice(0, 64);
  if (!roomId) return res.json({ ok:false, error:'roomId required' });
  const text = String((req.body && req.body.text) || '').trim().slice(0, 200);
  if (!text) return res.json({ ok:false, error:'text empty' });

  // Detect user từ JWT cookie
  let user = null;
  try { user = require('./lib/public-auth').getUser(req); } catch(e){}

  const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();

  // 🛡️ Check ban
  if (roomChat.isBanned(user ? user.username : null, ip)) {
    return res.json({ ok:false, error:'Bạn đã bị admin chặn chat. Liên hệ CSKH nếu nhầm.' });
  }

  // 🐢 Slow mode override: nếu admin set slow mode → áp dụng cho TẤT CẢ (kể cả member)
  const slowSec = roomChat.getSlowMode(roomId);
  const key = (user && user.username) ? ('u:' + user.username) : ('ip:' + ip);
  const now = Date.now();
  if (!global.__chatLastSent) global.__chatLastSent = new Map();
  const last = global.__chatLastSent.get(key) || 0;
  let cooldown;
  if (user && user.role === 'admin') cooldown = 0;          // Admin không cooldown
  else if (slowSec > 0) cooldown = slowSec * 1000;          // Slow mode đè lên
  else if (user) cooldown = 3000;                            // Member 3s
  else cooldown = 5 * 60 * 1000;                             // Guest 5p
  if (cooldown > 0 && now - last < cooldown) {
    const remain = Math.ceil((cooldown - (now - last)) / 1000);
    return res.json({ ok:false, error:'Cooldown', remain: remain, slowMode: slowSec });
  }
  global.__chatLastSent.set(key, now);

  // 📊 Mục 9: Track chat message metric cho Prometheus
  try {
    const roomType = (roomId && (roomId.startsWith('i') || roomId.startsWith('u_'))) ? 'idol' : 'sports';
    metrics.trackChatMessage(roomType);
  } catch (_) {}

  // Build msg
  const msg = {
    name: user ? (user.username || 'User') : ('Khách' + (Math.floor(Math.random()*9000) + 1000)),
    lvl: user ? (user.role === 'admin' ? 99 : user.role === 'idol' ? 50 : user.role === 'blv' ? 50 : 1) : 0,
    badge: user ? (user.role === 'admin' ? 'SVIP' : user.role === 'idol' ? 'VIP' : user.role === 'blv' ? 'VIP' : '') : '',
    text: text,
    isUser: true,
    by: user ? user.username : null,
    ip: ip  // lưu IP để admin có thể ban
  };
  const saved = roomChat.addMessage(roomId, msg);
  // Không trả IP về client
  const safeMsg = Object.assign({}, saved); delete safeMsg.ip;
  res.json({ ok:true, message: safeMsg });
});

// ═══ ADMIN MODERATION ═══
function requireAdmin(req, res, next) {
  let user = null;
  try { user = require('./lib/public-auth').getUser(req); } catch(e){}
  if (!user || user.role !== 'admin') return res.status(403).json({ ok:false, error:'Cần admin' });
  next();
}

// DELETE /api/admin/chat/:roomId/msg/:msgId
app.delete('/api/admin/chat/:roomId/msg/:msgId', requireAdmin, function (req, res) {
  const ok = roomChat.deleteMessage(req.params.roomId, req.params.msgId);
  res.json({ ok: ok });
});

// POST /api/admin/chat/:roomId/clear
app.post('/api/admin/chat/:roomId/clear', requireAdmin, function (req, res) {
  const ok = roomChat.clearRoom(req.params.roomId);
  res.json({ ok: ok });
});

// POST /api/admin/chat/:roomId/slow  body {seconds}
app.post('/api/admin/chat/:roomId/slow', requireAdmin, function (req, res) {
  const sec = parseInt((req.body && req.body.seconds) || '0', 10);
  const result = roomChat.setSlowMode(req.params.roomId, sec);
  res.json({ ok:true, slowMode: result });
});

// POST /api/admin/chat/ban  body {username|ip}
app.post('/api/admin/chat/ban', requireAdmin, function (req, res) {
  const b = req.body || {};
  if (!b.username && !b.ip) return res.json({ ok:false, error:'Cần username hoặc ip' });
  roomChat.banUser({ username: b.username, ip: b.ip });
  res.json({ ok:true, bans: roomChat.listBans() });
});

// POST /api/admin/chat/unban  body {username|ip}
app.post('/api/admin/chat/unban', requireAdmin, function (req, res) {
  const b = req.body || {};
  const ok = roomChat.unbanUser({ username: b.username, ip: b.ip });
  res.json({ ok: ok, bans: roomChat.listBans() });
});

// GET /api/admin/chat/bans
app.get('/api/admin/chat/bans', requireAdmin, function (req, res) {
  res.json({ ok:true, bans: roomChat.listBans(), stats: roomChat.stats() });
});

// 404 + error handler (đăng ký CUỐI CÙNG - sau mọi route)
app.use(function (req, res) { res.status(404).render('tw-404'); });
// 🛡️ Sentry error handler — phải chạy TRƯỚC error handler của Express
sentry.attachExpressAfter(app);
app.use(function (err, req, res, next) {
  console.error(err);
  // Sentry đã capture qua middleware ở trên, không cần manual
  res.status(500).render('tw-500', { err: err });
});

const HOST = process.env.HOST || '0.0.0.0';

// 🚀 Mục 10: Tạo HTTP server explicit để Socket.io attach được
const http = require('http');
const httpServer = http.createServer(app);

// Attach Socket.io
try {
  const socketServer = require('./lib/socket-server');
  socketServer.attach(httpServer);
} catch (e) {
  console.warn('[SOCKET] attach fail (fallback polling):', e.message);
}

// 🐬 Nếu dùng MySQL backend → preload DB từ MySQL trước khi listen
//    (SQLite backend: initAsync() là no-op, listen ngay)
(async function bootServer() {
  try {
    if (typeof db.initAsync === 'function') {
      await db.initAsync();
    }
  } catch (e) {
    console.error('[BOOT] ❌ DB init fail:', e.message);
    process.exit(1);
  }
  httpServer.listen(PORT, HOST, function () {
    console.log('XOSO66 TV (Tailwind) chạy tại ' + SITE);
    console.log('  Local:    http://localhost:' + PORT);
    console.log('  Network:  http://<YOUR-IP>:' + PORT + ' (truy cập từ điện thoại cùng WiFi)');
    console.log('  HTTPS:    Để bật camera trên điện thoại, dùng ngrok: ngrok http ' + PORT);
    console.log('[SYNC] Auto sync SRS publish → DB liveNow: enabled (10s interval)');
  });
})();

// ╔════════════════════════════════════════════════════════════════════╗
// ║ AUTO SYNC SRS publish state → DB liveNow                          ║
// ║ - Poll SRS API mỗi 10s                                            ║
// ║ - Match stream.name === idol.id / blv.id                          ║
// ║ - Set liveNow=true/false tương ứng publish.active                 ║
// ║ - Tránh: OBS push nhưng DB không cập nhật (mismatch hôm nay)      ║
// ╚════════════════════════════════════════════════════════════════════╝
const SRS_API_URL = process.env.SRS_API_URL || 'http://127.0.0.1:1985/api/v1/streams/';
async function syncLiveStatusFromSRS() {
  try {
    const fetchFn = (typeof fetch === 'function') ? fetch : require('node-fetch');
    const resp = await fetchFn(SRS_API_URL);
    if (!resp.ok) return;
    const data = await resp.json();
    const activeStreamNames = (data.streams || [])
      .filter(function(s){ return s && s.publish && s.publish.active; })
      .map(function(s){ return s.name; });

    const dbData = db.load();
    let changed = false;

    const sessionStore = require('./lib/session-store');
    const scheduleStore = require('./lib/schedule-store');

    (dbData.idols || []).forEach(function(idol){
      // 🔧 FIX: stream key có thể có suffix random (vd i_yennhi_vagsxf8a)
      //    → match prefix thay vì exact để cover cả 2 case (key gốc + key + suffix)
      const shouldLive = activeStreamNames.some(function(name){
        return name === idol.id || name.indexOf(idol.id + '_') === 0;
      });
      if (!!idol.liveNow !== shouldLive) {
        const wasOff = !idol.liveNow;
        idol.liveNow = shouldLive;
        if (shouldLive) {
          idol.liveStartedAt = Date.now();
        } else {
          delete idol.liveStartedAt;
        }
        changed = true;
        console.log('[SYNC] idol', idol.id, '(' + idol.name + ') → liveNow=' + shouldLive);

        // 📊 SESSION TRACKING: start khi go live, end khi off
        const _idolUsername = idol.userId || idol.username || idol.id;
        if (shouldLive && wasOff) {
          const active = scheduleStore.getActiveSchedule(_idolUsername);
          sessionStore.startSession({
            username: _idolUsername,
            userType: 'idol',
            idolId: idol.id,
            scheduleId: active ? active.id : null,
            matchId: active ? active.matchId : null,
            matchTitle: active ? active.matchTitle : null
          });
        } else if (!shouldLive && !wasOff) {
          sessionStore.endSession(_idolUsername);
        }

        // 🔔 NOTIFY FOLLOWERS: chỉ khi transition false→true (vừa go live)
        if (shouldLive && wasOff) {
          try {
            const pushLib = require('./lib/push');
            pushLib.sendToTopic('idol_live', {
              title: '🔴 ' + idol.name + ' đang LIVE!',
              body: (idol.category === 'casino' ? 'Show casino' :
                     idol.category === 'bongda' ? 'Bình luận bóng đá' :
                     idol.category === 'esport' ? 'Stream esport' : 'Idol Live Show') +
                    ' - Vào ngay để xem và tặng quà!',
              icon: idol.avatar || '/static/img/logoxoso66tv.webp',
              url: '/idol/' + idol.id,
              tag: 'idol_' + idol.id
            }).then(function(r){
              console.log('[PUSH] Notified', r.sent, 'followers cho', idol.name);
            }).catch(function(e){
              console.error('[PUSH] Fail:', e.message);
            });
          } catch (e) { console.error('[PUSH] Error:', e.message); }
        }
      }
    });

    (dbData.blvs || []).forEach(function(blv){
      // 🔧 FIX: match prefix để cover stream key có suffix random
      const shouldLive = activeStreamNames.some(function(name){
        return name === blv.id || name.indexOf(blv.id + '_') === 0;
      });
      if (!!blv.liveNow !== shouldLive) {
        const wasOff = !blv.liveNow;
        blv.liveNow = shouldLive;
        if (shouldLive) {
          blv.liveStartedAt = Date.now();
        } else {
          delete blv.liveStartedAt;
        }
        changed = true;
        console.log('[SYNC] blv', blv.id, '(' + blv.name + ') → liveNow=' + shouldLive);

        // 📊 SESSION TRACKING for BLV
        const _blvUsername = blv.userId || blv.username || blv.id;
        if (shouldLive && wasOff) {
          const active = scheduleStore.getActiveSchedule(_blvUsername);
          sessionStore.startSession({
            username: _blvUsername,
            userType: 'blv',
            idolId: blv.id,
            scheduleId: active ? active.id : null,
            matchId: active ? active.matchId : null,
            matchTitle: active ? active.matchTitle : null
          });
        } else if (!shouldLive && !wasOff) {
          sessionStore.endSession(_blvUsername);
        }

        // 🔔 NOTIFY khi BLV vừa lên sóng
        if (shouldLive && wasOff) {
          try {
            const pushLib = require('./lib/push');
            pushLib.sendToTopic('blv_live', {
              title: '⚽ ' + blv.name + ' đang bình luận!',
              body: 'BLV vừa lên sóng - vào ngay xem trận đấu',
              icon: blv.avatar || '/static/img/logoxoso66tv.webp',
              url: '/live/' + blv.id,
              tag: 'blv_' + blv.id
            }).then(function(r){
              console.log('[PUSH] Notified', r.sent, 'followers cho BLV', blv.name);
            }).catch(function(){});
          } catch (e) {}
        }
      }
    });

    if (changed) db.save(dbData);
  } catch (e) {
    // SRS down, network error → bỏ qua silent (không spam log)
  }
}
// Run lần đầu sau 5s (đợi SRS sẵn sàng), sau đó mỗi 10s
setTimeout(function(){
  syncLiveStatusFromSRS();
  setInterval(syncLiveStatusFromSRS, 10000);
}, 5000);

// ╔════════════════════════════════════════════════════════════════════╗
// ║ AUTO-END SCHEDULED LIVE — tự động cắt live khi hết giờ đăng ký    ║
// ║   - Grace period 5 phút (cho idol kết thúc đẹp)                   ║
// ║   - Cắt cả idol VÀ blv                                            ║
// ║   - Khoá stream key cũ → phải đăng ký lịch mới                    ║
// ║   - Kick OBS publisher qua SRS API (cắt connection ngay)          ║
// ║ ⚠️ CHỈ chạy ở Worker đầu tiên (instance 0) để tránh duplicate     ║
// ║    khi cluster mode 2+ workers cùng chạy cron                     ║
// ╚════════════════════════════════════════════════════════════════════╝
if (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0') {
  const autoEndLive = require('./lib/auto-end-scheduled-live');
  autoEndLive.start(30 * 1000);  // tick mỗi 30s
}

// ╔════════════════════════════════════════════════════════════════════╗
// ║ AUTO GENERATE NEWS - chạy hàng ngày lúc 6h sáng VN (UTC+7 = 23h UTC)║
// ║ Cần env CLAUDE_API_KEY (set trong ecosystem.config.js)             ║
// ║ Run thủ công: node scripts/generate-news.js                        ║
// ╚════════════════════════════════════════════════════════════════════╝
function runNewsGenerator() {
  const { exec } = require('child_process');
  const path = require('path');
  const script = path.join(__dirname, 'scripts', 'generate-news.js');
  console.log('[NEWS-CRON] 🤖 Bắt đầu auto generate news...');
  exec('node ' + script, { env: process.env, maxBuffer: 10 * 1024 * 1024 }, function(err, stdout, stderr){
    if (err) console.error('[NEWS-CRON] ❌ Error:', err.message);
    if (stdout) console.log('[NEWS-CRON]', stdout.trim());
    if (stderr) console.error('[NEWS-CRON] stderr:', stderr.trim());
  });
}

// Schedule: check mỗi phút, run khi đúng 6h sáng VN
let __lastNewsRunDate = null;
setInterval(function(){
  const now = new Date();
  // Convert sang VN time (UTC+7)
  const vnHour = (now.getUTCHours() + 7) % 24;
  const vnMin = now.getUTCMinutes();
  const dateKey = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0,10);
  // Chạy lúc 6:00-6:05 VN, chỉ 1 lần/ngày
  if (vnHour === 6 && vnMin < 5 && __lastNewsRunDate !== dateKey) {
    __lastNewsRunDate = dateKey;
    if (process.env.CLAUDE_API_KEY) {
      runNewsGenerator();
    } else {
      console.log('[NEWS-CRON] ⏸️  Skipped - CLAUDE_API_KEY chưa set');
    }
  }
}, 60 * 1000); // check mỗi phút

console.log('[NEWS-CRON] Schedule enabled: auto generate news lúc 6:00 sáng VN');
