/**
 * Admin router - quan ly User, BLV, Idol, OBS approval.
 * Mount qua: app.use('/admin', require('./routes/admin'))
 */
const express   = require('express');
const db        = require('../lib/db');
const auth      = require('../lib/admin-auth');
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
const analytics = require('../lib/analytics');

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
router.post('/login', function (req, res) {
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

// ===== All routes below require auth =====
router.use(auth.requireAuth);

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
      item.canLive = !item.canLive;
      db.audit(data, (item.canLive ? 'GRANT' : 'REVOKE') + ' live permission ' + kind.slice(0,-1).toUpperCase(), item.name, res.locals.adminUser);
      db.save(data);
      res.json({ ok:true, canLive: item.canLive, message: item.name + (item.canLive ? ' ✅ ĐƯỢC PHÉP LIVE' : ' ❌ ĐÃ THU HỒI QUYỀN LIVE') });
    }
  };
}

const blvActions = actionOn('blvs');
router.post('/api/blv/:id/approve', blvActions.approve);
router.post('/api/blv/:id/reject',  blvActions.reject);
router.post('/api/blv/:id/delete',  blvActions.del);
router.post('/api/blv/:id/toggle-live', blvActions.toggleLive);

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

router.post('/banners', _bnUpload.single('image'), function (req, res) {
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

router.post('/banners/:id', _bnUpload.single('image'), function (req, res) {
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

router.post('/promos', _bnUpload.single('image'), function (req, res) {
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

router.post('/promos/:id', _bnUpload.single('image'), function (req, res) {
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


module.exports = router;
