/**
 * Admin router - quan ly User, BLV, Idol, OBS approval.
 * Mount qua: app.use('/admin', require('./routes/admin'))
 */
const express   = require('express');
const db        = require('../lib/db');
const auth      = require('../lib/admin-auth');
const sec       = require('../lib/security'); // 🛡️ Mục 19+22: rate limit + fail2ban log
const adminGuard = require('../lib/admin-guard'); // 🔒 Unified admin guard (cookie + JWT role)
const banners   = require('../lib/banners');
const promos    = require('../lib/promos');
const partnerSync = require('../lib/partner-sync');
const partnerLinks = require('../lib/partner-links');
const multer    = require('multer');
const path      = require('path');

// Multer cau hinh upload banner
const _bnStorage = multer.diskStorage({
  destination: function(req,file,cb){ cb(null, path.join(__dirname,'..','public','uploads','banners')); },
  filename: function(req,file,cb){ cb(null, 'banner-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)+path.extname(file.originalname).toLowerCase()); }
});
const _bnUpload = multer({
  storage: _bnStorage,
  limits:  { fileSize: 2*1024*1024 }, // 2MB max
  fileFilter: function(req,file,cb){
    var ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
    cb(ok ? null : new Error('Chi cho phep JPG/PNG/WEBP'), ok);
  }
});

// Multer cau hinh upload card cover image (idol/blv)
const _cardStorage = multer.diskStorage({
  destination: function(req,file,cb){
    var dir = path.join(__dirname,'..','public','uploads','cards');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req,file,cb){ cb(null, 'card-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)+path.extname(file.originalname).toLowerCase()); }
});
const _cardUpload = multer({
  storage: _cardStorage,
  limits:  { fileSize: 3*1024*1024 }, // 3MB max
  fileFilter: function(req,file,cb){
    var ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Chi cho phep JPG/PNG/WEBP/GIF'), ok);
  }
});
const analytics = require('../lib/analytics');
const giftsStore = require('../lib/gifts-store');
const chatBannersStore = require('../lib/chat-banners-store');
const skinStore = require('../lib/skin-store');
const imgProcessor = require('../lib/image-processor'); // 🖼️ auto-optimize uploads

// Multer for skin overlay files (PNG/JPG/WebP for player + chat frames)
// ⚠️ Path: public/img/skin/ (KHÔNG phải public/static/img/skin)
//    vì server mount: app.use('/static', express.static('public')) → /static/* maps to public/*
const _skinStorage = multer.diskStorage({
  destination: function(req,file,cb){
    var dir = path.join(__dirname,'..','public','img','skin');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req,file,cb){
    // Tên file = slotId-timestamp.ext để cache-bust khi upload mới
    var slot = (req.params && req.params.id) ? req.params.id : 'unknown';
    cb(null, 'skin-' + slot + '-' + Date.now() + path.extname(file.originalname).toLowerCase());
  }
});
const _skinUpload = multer({
  storage: _skinStorage,
  limits:  { fileSize: 8*1024*1024 }, // 8MB cho file lớn (page-bg 1920x1080)
  fileFilter: function(req,file,cb){
    var ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
    cb(ok ? null : new Error('Chi cho phep JPG/PNG/WEBP'), ok);
  }
});

// Multer for chat banners
const _cbStorage = multer.diskStorage({
  destination: function(req,file,cb){
    var dir = path.join(__dirname,'..','public','uploads','chat-banners');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req,file,cb){ cb(null, 'cb-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)+path.extname(file.originalname).toLowerCase()); }
});
const _cbUpload = multer({
  storage: _cbStorage,
  limits:  { fileSize: 5*1024*1024 }, // 5MB cho GIF animated
  fileFilter: function(req,file,cb){
    var ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Chi cho phep JPG/PNG/WEBP/GIF'), ok);
  }
});

// Multer upload for gifts
const _giftStorage = multer.diskStorage({
  destination: function(req,file,cb){
    var dir = path.join(__dirname,'..','public','uploads','gifts');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req,file,cb){ cb(null, 'gift-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)+path.extname(file.originalname).toLowerCase()); }
});
const _giftUpload = multer({
  storage: _giftStorage,
  limits:  { fileSize: 3*1024*1024 },
  fileFilter: function(req,file,cb){
    var ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Chi cho phep JPG/PNG/WEBP/GIF'), ok);
  }
});

const router = express.Router();

// ===== Login / logout (public) =====
router.get('/login', function (req, res) {
  if (auth.isAuthed(req)) return res.redirect('/admin');
  // Check if 2FA is enabled - if yes, show OTP field always
  let twoFactorEnabled = false;
  try { const data = db.load(); twoFactorEnabled = !!(data.admin2fa && data.admin2fa.secret); } catch(e){}
  res.render('admin/login', { 
    nextUrl: req.query.next || '/admin', 
    err: null, 
    show2FA: twoFactorEnabled,
    savedUsername: '', 
    savedPassword: '' 
  });
});
router.post('/login', sec.adminLoginLimiter, function (req, res) {
  const { username, password, otp, next } = req.body || {};
  const result = auth.login(username, password, res, otp);
  if (result && result.ok) return res.redirect(next || '/admin');
  // Handle 2FA prompt
  if (result && result.needs2FA) {
    return res.render('admin/login', { 
      nextUrl: next || '/admin', 
      err: 'Vui lòng nhập mã OTP từ app Authenticator',
      show2FA: true,
      savedUsername: username,
      savedPassword: password
    });
  }
  res.render('admin/login', { 
    nextUrl: next || '/admin', 
    err: result.error || 'Sai tai khoan hoac mat khau',
    show2FA: !!(result && result.needs2FA),
    savedUsername: username
  });
});
router.get('/logout', function (req, res) {
  auth.logout(req, res);
  res.redirect('/admin/login');
});

// ╔══════════════════════════════════════════════════════════════╗
// ║ 🔒 KHÓA TOÀN BỘ ROUTES BÊN DƯỚI                              ║
// ║ Chỉ cho phép user có (1 trong 2):                              ║
// ║   - Cookie x66_admin (login qua /admin/login)                  ║
// ║   - Cookie x66_jwt với role='admin' trong DB                   ║
// ║ Mọi truy cập khác → redirect /admin/login hoặc 401             ║
// ╚══════════════════════════════════════════════════════════════╝
router.use(adminGuard);

function adminCtx() {
  const data = db.load();
  return {
    data: data,
    obsPending: data.obs.filter(function(o){ return o.status==='pending' }).length
  };
}

// ===== Dashboard =====
router.get('/', function (req, res) {
  const ctx = adminCtx();
  const data = ctx.data;
  const vipDist = db.VIP_TIERS.map(function(t){
    return { tier: t, count: data.users.filter(function(u){ return u.vip === t.id }).length };
  });
  const live = analytics.stats();
  const stats = {
    users:        data.users.length,
    blvs:         data.blvs.length,
    blvPending:   data.blvs.filter(function(b){ return b.status==='pending' }).length,
    idols:        data.idols.length,
    idolPending:  data.idols.filter(function(i){ return i.status==='pending' }).length,
    obsPending:   ctx.obsPending,
    vipDist:      vipDist,
    recentLog:    data.auditLog.slice(0, 12),
    online:       live.online,
    newToday:     live.newToday,
    uniqueToday:  live.uniqueToday,
    requestsToday:live.requestsToday,
    newYesterday: live.newYesterday,
    uniqueYesterday: live.uniqueYesterday,
    totalVisitors:   live.totalVisitors,
    days7:        live.days7
  };
  res.render('admin/dashboard', { stats: stats, obsPending: ctx.obsPending, adminUser: res.locals.adminUser });
});

// JSON live stats for auto-refresh widget
router.get('/api/live-stats', function (req, res) {
  res.json(analytics.stats());
});

// ===== USERS =====
router.get('/users', function (req, res) {
  const ctx = adminCtx();
  const q = (req.query.q || '').toLowerCase();
  const vip = req.query.vip;
  const status = req.query.status;
  let list = ctx.data.users.slice();
  if (q) list = list.filter(function(u){ return [u.username,u.fullname,u.phone,u.email].join(' ').toLowerCase().indexOf(q)>=0 });
  if (vip !== undefined && vip !== '') list = list.filter(function(u){ return String(u.vip) === String(vip) });
  if (status) list = list.filter(function(u){ return u.status === status });
  res.render('admin/users', {
    list: list, q: q, vipFilter: vip || '', statusFilter: status || '',
    VIP_TIERS: db.VIP_TIERS, obsPending: ctx.obsPending, adminUser: res.locals.adminUser
  });
});


// CREATE user (admin tao tay)
router.post('/users/create', function (req, res) {
  const b = req.body || {};
  const username = (b.username || '').trim().toLowerCase();
  const phone    = (b.phone    || '').trim();
  if (!username || !phone) return res.redirect('/admin/users?err=missing');

  const data = db.load();
  // Check trung username
  if (data.users.find(function(u){ return (u.username||'').toLowerCase() === username; })) {
    return res.redirect('/admin/users?err=duplicate');
  }
  const newUser = {
    id:       db.genId('u'),
    username: username,
    fullname: (b.fullname || username).trim(),
    phone:    phone,
    email:    (b.email || '').trim(),
    password: b.password || '',
    vip:      parseInt(b.vip, 10) || 0,
    balance:  parseInt(b.balance, 10) || 0,
    coin:     parseInt(b.coin, 10) || 0,
    status:   (b.status === 'banned') ? 'banned' : 'active',
    joinedAt: Date.now()
  };
  data.users.push(newUser);
  db.audit(data, 'Tao user moi: ' + username, res.locals.adminUser || 'admin', 'admin');
  db.save(data);
  res.redirect('/admin/users?ok=created&id=' + newUser.id);
});

router.post('/api/users/:id/vip', function (req, res) {
  const data = db.load();
  const u = data.users.find(function(x){ return x.id === req.params.id });
  if (!u) return res.json({ ok:false, message:'User khong ton tai' });
  const newVip = parseInt(req.body.vip);
  if (isNaN(newVip) || newVip < 0 || newVip >= db.VIP_TIERS.length) return res.json({ ok:false, message:'VIP tier khong hop le' });
  const old = u.vip; u.vip = newVip;
  db.audit(data, 'Update VIP', u.username + ' (VIP ' + old + ' -> ' + newVip + ')', res.locals.adminUser);
  db.save(data);
  res.json({ ok:true, message:'Da cap nhat VIP ' + db.VIP_TIERS[newVip].name });
});

router.post('/api/users/:id/ban', function (req, res) {
  const data = db.load();
  const u = data.users.find(function(x){ return x.id === req.params.id });
  if (!u) return res.json({ ok:false, message:'User khong ton tai' });
  u.status = 'banned'; u.banReason = req.body.reason || 'Vi pham';
  db.audit(data, 'Ban user', u.username + ' (' + u.banReason + ')', res.locals.adminUser);
  db.save(data);
  res.json({ ok:true, message:'Da ban user ' + u.username });
});

router.post('/api/users/:id/unban', function (req, res) {
  const data = db.load();
  const u = data.users.find(function(x){ return x.id === req.params.id });
  if (!u) return res.json({ ok:false, message:'User khong ton tai' });
  u.status = 'active'; delete u.banReason;
  db.audit(data, 'Unban user', u.username, res.locals.adminUser);
  db.save(data);
  res.json({ ok:true, message:'Da mo khoa ' + u.username });
});

router.post('/api/users/:id/delete', function (req, res) {
  const data = db.load();
  const i = data.users.findIndex(function(x){ return x.id === req.params.id });
  if (i < 0) return res.json({ ok:false, message:'Khong ton tai' });
  const u = data.users.splice(i, 1)[0];
  db.audit(data, 'Delete user', u.username, res.locals.adminUser);
  db.save(data);
  res.json({ ok:true, message:'Da xoa ' + u.username });
});

// ===== BLV =====
router.get('/blv', function (req, res) {
  const ctx = adminCtx();
  const status = req.query.status || '';
  const all = ctx.data.blvs;
  const counts = {
    all: all.length,
    active:   all.filter(function(b){ return b.status==='active' }).length,
    pending:  all.filter(function(b){ return b.status==='pending' }).length,
    rejected: all.filter(function(b){ return b.status==='rejected' }).length
  };
  const list = status ? all.filter(function(b){ return b.status === status }) : all;
  res.render('admin/blv', { list: list, counts: counts, statusFilter: status, obsPending: ctx.obsPending, adminUser: res.locals.adminUser });
});

function actionOn(kind) {
  return {
    approve: function (req, res) {
      const data = db.load();
      const arr = data[kind];
      const item = arr.find(function(x){ return x.id === req.params.id });
      if (!item) return res.json({ ok:false, message:'Khong ton tai' });
      item.status = 'active';
      item.approvedAt = Date.now();
      // 🆙 Auto update user.role để họ có quyền streamer khi login
      const targetRole = kind === 'idols' ? 'idol' : 'blv';
      if (item.userId && data.users) {
        const u = data.users.find(function(x){ return x.username === item.userId; });
        if (u) {
          u.role = targetRole;
          u.upgradedAt = Date.now();
        }
      }
      db.audit(data, 'Approve ' + targetRole.toUpperCase() + ' (role → ' + targetRole + ')', item.name + ' [user:' + (item.userId||'?') + ']', res.locals.adminUser);
      db.save(data);
      res.json({ ok:true, message:'Da duyet ' + item.name + ' (role user: ' + targetRole + ')' });
    },
    reject: function (req, res) {
      const data = db.load();
      const arr = data[kind];
      const item = arr.find(function(x){ return x.id === req.params.id });
      if (!item) return res.json({ ok:false, message:'Khong ton tai' });
      item.status = 'rejected'; item.rejectReason = req.body.reason || 'Khong dat yeu cau';
      db.audit(data, 'Reject ' + kind.slice(0,-1).toUpperCase(), item.name + ' (' + item.rejectReason + ')', res.locals.adminUser);
      db.save(data);
      res.json({ ok:true, message:'Da tu choi ' + item.name });
    },
    del: function (req, res) {
      const data = db.load();
      const i = data[kind].findIndex(function(x){ return x.id === req.params.id });
      if (i < 0) return res.json({ ok:false, message:'Khong ton tai' });
      const item = data[kind].splice(i, 1)[0];
      db.audit(data, 'Delete ' + kind.slice(0,-1).toUpperCase(), item.name, res.locals.adminUser);
      db.save(data);
      res.json({ ok:true, message:'Da xoa ' + item.name });
    },
    toggleLive: function (req, res) {
      const data = db.load();
      const arr = data[kind];
      const item = arr.find(function(x){ return x.id === req.params.id });
      if (!item) return res.json({ ok:false, message:'Khong ton tai' });
      const wasLive = !!item.canLive;
      item.canLive = !item.canLive;
      // Đánh dấu live "khởi tạo" khi bật quyền
      if (item.canLive && !wasLive) item.liveNow = true;
      if (!item.canLive) item.liveNow = false;
      db.audit(data, (item.canLive ? 'GRANT' : 'REVOKE') + ' live permission ' + kind.slice(0,-1).toUpperCase(), item.name, res.locals.adminUser);
      db.save(data);
      // 🔔 PUSH NOTIFY khi idol bắt đầu được phép LIVE
      if (item.canLive && !wasLive && kind === 'idols') {
        try {
          require('../lib/push').notifyIdolLive(item).catch(function(e){ console.log('[push] notify err:', e.message); });
        } catch(e){}
      }
      res.json({ ok:true, canLive: item.canLive, message: item.name + (item.canLive ? ' ✅ ĐƯỢC PHÉP LIVE (đã push notify)' : ' ❌ ĐÃ THU HỒI QUYỀN LIVE') });
    },
    setCategory: function (req, res) {
      const data = db.load();
      const arr = data[kind];
      const item = arr.find(function(x){ return x.id === req.params.id });
      if (!item) return res.json({ ok:false, message:'Khong ton tai' });
      const validCats = ['idol','bongda','casino','esport'];
      const cat = String((req.body && req.body.category) || '').toLowerCase();
      if (!validCats.includes(cat)) return res.json({ ok:false, message:'Category không hợp lệ' });
      item.category = cat;
      db.audit(data, 'SET category=' + cat + ' for ' + kind.slice(0,-1).toUpperCase(), item.name, res.locals.adminUser);
      db.save(data);
      const labels = { idol:'👑 Idol Show', bongda:'⚽ BLV Bóng đá', casino:'🎰 Live Sòng Bài', esport:'🎮 BLV Esports' };
      res.json({ ok:true, category: cat, message: item.name + ' → ' + (labels[cat] || cat) });
    },
    setCardImage: function (req, res) {
      const data = db.load();
      const arr = data[kind];
      const item = arr.find(function(x){ return x.id === req.params.id });
      if (!item) return res.json({ ok:false, message:'Khong ton tai' });
      const url = String((req.body && req.body.imageUrl) || '').trim();
      // Cho phép xóa bằng cách gửi empty string
      if (url && !/^(https?:\/\/|\/static\/|\/uploads\/)/i.test(url)) {
        return res.json({ ok:false, message:'URL phải bắt đầu https:// hoặc /static/ hoặc /uploads/' });
      }
      item.cardImage = url || null;
      db.audit(data, 'SET cardImage for ' + kind.slice(0,-1).toUpperCase(), item.name, res.locals.adminUser);
      db.save(data);
      res.json({ ok:true, cardImage: item.cardImage, message: item.name + (url ? ' ✅ đã đặt ảnh nền card' : ' đã xóa ảnh nền card') });
    }
  };
}

const blvActions = actionOn('blvs');
router.post('/api/blv/:id/approve', blvActions.approve);
router.post('/api/blv/:id/reject',  blvActions.reject);
router.post('/api/blv/:id/delete',  blvActions.del);
router.post('/api/blv/:id/toggle-live', blvActions.toggleLive);
router.post('/api/blv/:id/set-category', blvActions.setCategory);
router.post('/api/blv/:id/set-card-image', blvActions.setCardImage);

// ===== IDOL =====
router.get('/idol', function (req, res) {
  const ctx = adminCtx();
  const status = req.query.status || '';
  const all = ctx.data.idols;
  const counts = {
    all: all.length,
    active:   all.filter(function(b){ return b.status==='active' }).length,
    pending:  all.filter(function(b){ return b.status==='pending' }).length,
    rejected: all.filter(function(b){ return b.status==='rejected' }).length
  };
  const list = status ? all.filter(function(b){ return b.status === status }) : all;
  res.render('admin/idol', { list: list, counts: counts, statusFilter: status, obsPending: ctx.obsPending, adminUser: res.locals.adminUser });
});
const idolActions = actionOn('idols');
router.post('/api/idol/:id/approve', idolActions.approve);
router.post('/api/idol/:id/reject',  idolActions.reject);
router.post('/api/idol/:id/delete',  idolActions.del);
router.post('/api/idol/:id/toggle-live', idolActions.toggleLive);
router.post('/api/idol/:id/set-category', idolActions.setCategory);
router.post('/api/idol/:id/set-card-image', idolActions.setCardImage);
// Upload file ảnh card (multipart)
router.post('/api/idol/:id/upload-card-image', _cardUpload.single('image'), imgProcessor.afterUploadOptimize({ maxWidth: 1200 }), function(req, res){
  if (!req.file) return res.json({ ok:false, message:'Không có file upload' });
  const url = '/uploads/cards/' + req.file.filename;
  const data = db.load();
  const item = data.idols.find(function(x){ return x.id === req.params.id });
  if (!item) return res.json({ ok:false, message:'Idol không tồn tại' });
  item.cardImage = url;
  db.audit(data, 'UPLOAD cardImage for IDOL', item.name, res.locals.adminUser);
  db.save(data);
  res.json({ ok:true, url:url, cardImage:url, message:'✅ Upload ảnh nền thành công cho ' + item.name });
});
router.post('/api/blv/:id/upload-card-image', _cardUpload.single('image'), imgProcessor.afterUploadOptimize({ maxWidth: 1200 }), function(req, res){
  if (!req.file) return res.json({ ok:false, message:'Không có file upload' });
  const url = '/uploads/cards/' + req.file.filename;
  const data = db.load();
  const item = data.blvs.find(function(x){ return x.id === req.params.id });
  if (!item) return res.json({ ok:false, message:'BLV không tồn tại' });
  item.cardImage = url;
  db.audit(data, 'UPLOAD cardImage for BLV', item.name, res.locals.adminUser);
  db.save(data);
  res.json({ ok:true, url:url, cardImage:url, message:'✅ Upload ảnh nền thành công cho ' + item.name });
});

// ===== OBS =====
const RTMP_SERVER = process.env.RTMP_SERVER || 'rtmp://stream.xoso66tv.com/live';

router.get('/obs', function (req, res) {
  const ctx = adminCtx();
  const status = req.query.status || '';
  const all = ctx.data.obs.sort(function(a,b){ return b.createdAt - a.createdAt });
  const counts = {
    all: all.length,
    pending:  all.filter(function(o){ return o.status==='pending' }).length,
    approved: all.filter(function(o){ return o.status==='approved' }).length,
    rejected: all.filter(function(o){ return o.status==='rejected' }).length
  };
  const list = status ? all.filter(function(o){ return o.status === status }) : all;
  res.render('admin/obs', { list: list, counts: counts, statusFilter: status, obsPending: ctx.obsPending, adminUser: res.locals.adminUser });
});

router.post('/api/obs/:id/approve', function (req, res) {
  const data = db.load();
  const o = data.obs.find(function(x){ return x.id === req.params.id });
  if (!o) return res.json({ ok:false, message:'Khong ton tai' });
  o.status = 'approved';
  o.rtmpServer = RTMP_SERVER;
  o.streamKey = db.genStreamKey(o.requesterName);
  o.approvedAt = Date.now();
  delete o.rejectReason;
  db.audit(data, 'Approve OBS', o.requesterName + ' (' + o.streamKey + ')', res.locals.adminUser);
  db.save(data);
  res.json({ ok:true, message:'Da duyet va cap stream key cho ' + o.requesterName });
});

router.post('/api/obs/:id/reject', function (req, res) {
  const data = db.load();
  const o = data.obs.find(function(x){ return x.id === req.params.id });
  if (!o) return res.json({ ok:false, message:'Khong ton tai' });
  o.status = 'rejected';
  o.rejectReason = req.body.reason || 'Khong dat yeu cau';
  o.rejectedAt = Date.now();
  o.streamKey = ''; o.rtmpServer = '';
  db.audit(data, 'Reject OBS', o.requesterName + ' (' + o.rejectReason + ')', res.locals.adminUser);
  db.save(data);
  res.json({ ok:true, message:'Da tu choi yeu cau' });
});

router.post('/api/obs/:id/revoke', function (req, res) {
  const data = db.load();
  const o = data.obs.find(function(x){ return x.id === req.params.id });
  if (!o) return res.json({ ok:false, message:'Khong ton tai' });
  o.status = 'rejected';
  o.rejectReason = 'Thu hoi boi admin';
  o.streamKey = ''; o.rtmpServer = '';
  o.rejectedAt = Date.now();
  db.audit(data, 'Revoke OBS', o.requesterName, res.locals.adminUser);
  db.save(data);
  res.json({ ok:true, message:'Da thu hoi stream key' });
});

router.post('/api/obs/:id/toggle-stream', function (req, res) {
  const data = db.load();
  const o = data.obs.find(function(x){ return x.id === req.params.id; });
  if (!o) return res.json({ ok:false, message:'Khong tim thay' });
  if (o.status !== 'approved') return res.json({ ok:false, message:'Phai approve OBS truoc' });
  o.streamActive = !o.streamActive;
  db.audit(data, (o.streamActive?'Bat':'Tat') + ' stream cho ' + o.requesterName, res.locals.adminUser || 'admin', 'admin');
  db.save(data);
  res.json({ ok:true, streamActive: o.streamActive });
});

router.post('/api/obs/:id/regenerate', function (req, res) {
  const data = db.load();
  const o = data.obs.find(function(x){ return x.id === req.params.id });
  if (!o) return res.json({ ok:false, message:'Khong ton tai' });
  if (o.status !== 'approved') return res.json({ ok:false, message:'Chi cap moi cho request da duyet' });
  o.streamKey = db.genStreamKey(o.requesterName);
  o.approvedAt = Date.now();
  db.audit(data, 'Regenerate stream key', o.requesterName + ' (' + o.streamKey + ')', res.locals.adminUser);
  db.save(data);
  res.json({ ok:true, message:'Da cap stream key moi' });
});

router.post('/api/obs/:id/delete', function (req, res) {
  const data = db.load();
  const i = data.obs.findIndex(function(x){ return x.id === req.params.id });
  if (i < 0) return res.json({ ok:false, message:'Khong ton tai' });
  const o = data.obs.splice(i, 1)[0];
  db.audit(data, 'Delete OBS request', o.requesterName, res.locals.adminUser);
  db.save(data);
  res.json({ ok:true, message:'Da xoa yeu cau' });
});

// Public API: BLV/Idol gui yeu cau ket noi OBS (tu front-end cua ho)
router.post('/api/obs/request', function (req, res) {
  const data = db.load();
  const b = req.body || {};
  if (!b.requesterType || !b.requesterId || !b.requesterName) {
    return res.json({ ok:false, message:'Thieu thong tin' });
  }
  const newReq = {
    id: db.genId('o'),
    requesterType: b.requesterType,
    requesterId:   b.requesterId,
    requesterName: b.requesterName,
    rtmpServer:    '',
    streamKey:     '',
    status:        'pending',
    createdAt:     Date.now(),
    // 🔒 PRIVACY: KHÔNG lưu IP thật vào DB. Chỉ lưu hash + masked cho admin xem
    ipHash:        require('../lib/privacy').getHashedIp(req),
    ipMasked:      require('../lib/privacy').getMaskedIp(req),
    ip:            require('../lib/privacy').getMaskedIp(req),  // backward compat - admin chỉ thấy masked
    device:        b.device || (req.headers['user-agent']||'Unknown').slice(0, 60),
    note:          b.note || ''
  };
  data.obs.push(newReq);
  db.audit(data, 'New OBS request', newReq.requesterName, 'system');
  db.save(data);
  res.json({ ok:true, message:'Yeu cau da gui, vui long cho admin duyet', requestId: newReq.id });
});

// ===== Audit Log =====
router.get('/2fa', function (req, res) {
  const ctx = adminCtx();
  res.render('admin/2fa', { obsPending: ctx.obsPending, adminUser: res.locals.adminUser });
});

router.get('/audit', function (req, res) {
  const ctx = adminCtx();
  res.render('admin/audit', { log: ctx.data.auditLog, obsPending: ctx.obsPending, adminUser: res.locals.adminUser });
});


// ===== BANNERS =====
router.get('/banners', function (req, res) {
  const ctx = adminCtx();
  res.render('admin/banners', {
    banners: banners.load(),
    obsPending: ctx.obsPending,
    adminUser: res.locals.adminUser
  });
});

router.post('/banners', _bnUpload.single('image'), imgProcessor.afterUploadOptimize({ maxWidth: 1920 }), function (req, res) {
  const b = req.body || {};
  const data = {
    title:  (b.title || '').trim().slice(0, 80),
    desc:   (b.desc  || '').trim().slice(0, 200),
    cta:    (b.cta   || 'Nhan ngay').trim().slice(0, 20),
    url:    (b.url   || '#').trim(),
    bg:     (b.bg    || 'linear-gradient(90deg,#c0392b,#e67e22,#f1c40f)').trim(),
    image:  req.file ? '/static/uploads/banners/' + req.file.filename : '',
    active: !!b.active
  };
  if (!data.title || !data.url) return res.status(400).send('Thieu tieu de hoac URL');
  banners.create(data);
  res.redirect('/admin/banners');
});

router.post('/banners/:id', _bnUpload.single('image'), imgProcessor.afterUploadOptimize({ maxWidth: 1920 }), function (req, res) {
  const b = req.body || {};
  const patch = {
    title:  (b.title || '').trim().slice(0, 80),
    desc:   (b.desc  || '').trim().slice(0, 200),
    cta:    (b.cta   || '').trim().slice(0, 20),
    url:    (b.url   || '').trim(),
    bg:     (b.bg    || '').trim(),
    active: !!b.active
  };
  if (req.file) patch.image = '/static/uploads/banners/' + req.file.filename;
  banners.update(req.params.id, patch);
  res.redirect('/admin/banners');
});

router.get('/banners/:id/delete', function (req, res) {
  banners.remove(req.params.id);
  res.redirect('/admin/banners');
});



// ===== PROMOS =====
router.get('/promos', function (req, res) {
  const ctx = adminCtx();
  res.render('admin/promos', { promos: promos.load(), obsPending: ctx.obsPending, adminUser: res.locals.adminUser });
});

router.post('/promos', _bnUpload.single('image'), imgProcessor.afterUploadOptimize({ maxWidth: 1920 }), function (req, res) {
  const b = req.body || {};
  const data = {
    title:  (b.title || '').trim().slice(0, 80),
    desc:   (b.desc  || '').trim().slice(0, 200),
    cta:    (b.cta   || 'Nhan ngay').trim().slice(0, 20),
    url:    (b.url   || '#').trim(),
    bg:     (b.bg    || 'linear-gradient(135deg,#c0392b,#e67e22,#f1c40f)').trim(),
    image:  req.file ? '/static/uploads/banners/' + req.file.filename : '',
    active: !!b.active
  };
  if (!data.title || !data.url) return res.status(400).send('Thieu thong tin');
  promos.create(data);
  res.redirect('/admin/promos');
});

router.post('/promos/:id', _bnUpload.single('image'), imgProcessor.afterUploadOptimize({ maxWidth: 1920 }), function (req, res) {
  const b = req.body || {};
  const patch = {
    title:  (b.title || '').trim().slice(0, 80),
    desc:   (b.desc  || '').trim().slice(0, 200),
    cta:    (b.cta   || '').trim().slice(0, 20),
    url:    (b.url   || '').trim(),
    bg:     (b.bg    || '').trim(),
    active: !!b.active
  };
  if (req.file) patch.image = '/static/uploads/banners/' + req.file.filename;
  promos.update(req.params.id, patch);
  res.redirect('/admin/promos');
});

router.get('/promos/:id/delete', function (req, res) {
  promos.remove(req.params.id);
  res.redirect('/admin/promos');
});



// ===== PARTNER XOSO66 INTEGRATION =====
router.get('/partner', function (req, res) {
  const ctx = adminCtx();
  res.render('admin/partner', { cfg: partnerSync.loadConfig(), log: partnerSync.loadLog(), obsPending: ctx.obsPending, adminUser: res.locals.adminUser });
});

router.post('/partner', function (req, res) {
  const b = req.body || {};
  const cfg = partnerSync.loadConfig();
  cfg.webhookSecret  = (b.webhookSecret || '').trim();
  cfg.vndPerCoin     = parseInt(b.vndPerCoin, 10) || 1000;
  cfg.coinPerVndK    = parseInt(b.coinPerVndK, 10) || 1;
  cfg.enabled        = !!b.enabled;
  cfg.autoCreateUser = !!b.autoCreateUser;
  // Bonus tiers
  var tiers = [];
  for (var i=0; i<10; i++) {
    var f = b['tier_from_' + i], bn = b['tier_bonus_' + i];
    if (f && bn) tiers.push({ fromVnd: parseInt(f,10), bonusCoin: parseInt(bn,10) });
  }
  if (tiers.length) cfg.bonusTiers = tiers;
  partnerSync.saveConfig(cfg);
  res.redirect('/admin/partner');
});



// ===== PARTNER LINKS =====
router.get('/links', function (req, res) {
  const ctx = adminCtx();
  res.render('admin/links', { grouped: partnerLinks.listGrouped(), obsPending: ctx.obsPending, adminUser: res.locals.adminUser });
});

router.post('/links', function (req, res) {
  partnerLinks.update(req.body || {});
  res.redirect('/admin/links');
});

router.get('/links/reset', function (req, res) {
  partnerLinks.resetDefaults();
  res.redirect('/admin/links');
});


// ═══════════════ 🎁 GIFTS MANAGEMENT ═══════════════
router.get('/gifts', function(req, res){
  if (!auth.isAuthed(req)) return res.redirect('/admin/login');
  res.render('admin/gifts', { gifts: giftsStore.list() });
});

// CREATE
router.post('/api/gifts', _giftUpload.single('imageFile'), imgProcessor.afterUploadOptimize({ maxWidth: 600 }), function(req, res){
  if (!auth.isAuthed(req)) return res.status(401).json({ ok:false, error:'Cần đăng nhập admin' });
  try {
    const b = req.body || {};
    let image = b.image || '';
    if (req.file) image = '/uploads/gifts/' + req.file.filename;
    if (!image) return res.json({ ok:false, error:'Cần ảnh (upload hoặc URL)' });
    const item = giftsStore.add({
      name: b.name, image: image,
      price: b.price, tier: b.tier,
      enabled: b.enabled !== '0' && b.enabled !== false,
      order: b.order
    });
    res.json({ ok:true, gift: item });
  } catch(e){ res.json({ ok:false, error: e.message }); }
});

// UPDATE
router.put('/api/gifts/:id', _giftUpload.single('imageFile'), imgProcessor.afterUploadOptimize({ maxWidth: 600 }), function(req, res){
  if (!auth.isAuthed(req)) return res.status(401).json({ ok:false, error:'Cần đăng nhập admin' });
  try {
    const b = req.body || {};
    const patch = { name: b.name, price: b.price, tier: b.tier, order: b.order };
    if (req.file) patch.image = '/uploads/gifts/' + req.file.filename;
    else if (b.image) patch.image = b.image;
    if (b.enabled !== undefined) patch.enabled = b.enabled !== '0' && b.enabled !== false;
    const item = giftsStore.update(req.params.id, patch);
    if (!item) return res.json({ ok:false, error:'Không tìm thấy' });
    res.json({ ok:true, gift: item });
  } catch(e){ res.json({ ok:false, error: e.message }); }
});

// TOGGLE enabled
router.post('/api/gifts/:id/toggle', express.json(), function(req, res){
  if (!auth.isAuthed(req)) return res.status(401).json({ ok:false, error:'Cần đăng nhập admin' });
  const item = giftsStore.update(req.params.id, { enabled: !!(req.body && req.body.enabled) });
  if (!item) return res.json({ ok:false, error:'Không tìm thấy' });
  res.json({ ok:true });
});

// DELETE
router.delete('/api/gifts/:id', function(req, res){
  if (!auth.isAuthed(req)) return res.status(401).json({ ok:false, error:'Cần đăng nhập admin' });
  const ok = giftsStore.remove(req.params.id);
  res.json({ ok: ok });
});

// PUBLIC API: list gifts cho gift panel
router.get('/api/gifts-public', function(req, res){
  res.json({ ok:true, gifts: giftsStore.activeGifts() });
});

// ═══════════════ 🎀 CHAT BANNERS ═══════════════
router.get('/chat-banners', function(req, res){
  if (!auth.isAuthed(req)) return res.redirect('/admin/login');
  res.render('admin/chat-banners', { banners: chatBannersStore.list() });
});

router.put('/api/chat-banners/:id', _cbUpload.single('imageFile'), imgProcessor.afterUploadOptimize({ maxWidth: 800 }), function(req, res){
  if (!auth.isAuthed(req)) return res.status(401).json({ ok:false, error:'Cần đăng nhập admin' });
  try {
    const b = req.body || {};
    const patch = { link: b.link || '' };
    if (req.file) patch.image = '/uploads/chat-banners/' + req.file.filename;
    else if (b.image !== undefined) patch.image = b.image;
    patch.enabled = b.enabled === '1' || b.enabled === true || b.enabled === 'true';
    const item = chatBannersStore.update(req.params.id, patch);
    if (!item) return res.json({ ok:false, error:'Không tìm thấy banner' });
    res.json({ ok:true, banner: item });
  } catch(e){ res.json({ ok:false, error: e.message }); }
});

// PUBLIC API
router.get('/api/chat-banners-public', function(req, res){
  res.json({ ok:true, banners: chatBannersStore.active() });
});

// ════════════════════════════════════════════════════════
// SKIN MANAGER — Quản lý 10 file overlay PNG/JPG/WebP cho phòng live
// ════════════════════════════════════════════════════════
router.get('/skin', function(req, res){
  res.render('admin/skin', {
    active: 'skin',
    title:  'Skin phòng live',
    slots:  skinStore.list(),
    config: skinStore.config()
  });
});

// Upload 1 slot
router.post('/api/skin/upload/:id', _skinUpload.single('imageFile'), imgProcessor.afterUploadOptimize({ maxWidth: 1920 }), function(req, res){
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:'Khong co file' });
    var slotId = req.params.id;
    var validIds = skinStore.SLOTS.map(function(s){ return s.id; });
    if (validIds.indexOf(slotId) < 0) {
      return res.status(400).json({ ok:false, error:'Slot khong hop le' });
    }
    var url = '/static/img/skin/' + req.file.filename;
    var data = skinStore.setFile(slotId, url);
    res.json({ ok:true, slotId: slotId, url: url, config: data });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

// Xóa 1 slot (không xóa file vật lý — chỉ unlink config)
router.delete('/api/skin/:id', function(req, res){
  try {
    var data = skinStore.removeFile(req.params.id);
    res.json({ ok:true, config: data });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

// Master toggle ON/OFF
router.post('/api/skin/toggle', function(req, res){
  try {
    var enabled = !!(req.body && req.body.enabled);
    var data = skinStore.toggle(enabled);
    res.json({ ok:true, config: data });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════
// HEADER BANNER — banner ảnh dải trên cùng header (thay text hardcode)
// ════════════════════════════════════════════════════════
const headerBannerStore = require('../lib/header-banner-store');
const _hbStorage = multer.diskStorage({
  destination: function(req, file, cb){
    var dir = path.join(__dirname, '..', 'public', 'img', 'header-banner');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req, file, cb){
    cb(null, 'header-banner-' + Date.now() + path.extname(file.originalname).toLowerCase());
  }
});
const _hbUpload = multer({
  storage: _hbStorage,
  limits: { fileSize: 8*1024*1024 },
  fileFilter: function(req, file, cb){
    var ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
    cb(ok ? null : new Error('Chỉ chấp nhận JPG/PNG/WebP'), ok);
  }
});

router.get('/header-banner', function(req, res){
  res.render('admin/header-banner', {
    active: 'header-banner',
    title:  'Banner header',
    cfg:    headerBannerStore.get()
  });
});

router.post('/api/header-banner/upload', _hbUpload.single('imageFile'), imgProcessor.afterUploadOptimize({ maxWidth: 1400 }), function(req, res){
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:'Không có file' });
    var url = '/static/img/header-banner/' + req.file.filename;
    var data = headerBannerStore.setImage(url);
    res.json({ ok:true, url: url, config: data });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

router.post('/api/header-banner/update', function(req, res){
  try {
    var b = req.body || {};
    var data = headerBannerStore.update({ link: b.link, alt: b.alt });
    res.json({ ok:true, config: data });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

router.post('/api/header-banner/toggle', function(req, res){
  try {
    var enabled = !!(req.body && req.body.enabled);
    var data = headerBannerStore.toggle(enabled);
    res.json({ ok:true, config: data });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

router.post('/api/header-banner/remove', function(req, res){
  try {
    var data = headerBannerStore.removeImage();
    res.json({ ok:true, config: data });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

// PUBLIC API — cho client query (KHÔNG dùng cho render server-side, chỉ debug)
router.get('/api/skin-public', function(req, res){
  res.json({ ok:true, config: skinStore.activeConfig() });
});

module.exports = router;
