// Routes cho user đăng ký làm Idol / BLV
const express   = require('express');
const multer    = require('multer');
const fs        = require('fs');
const path      = require('path');
const db        = require('../lib/db');
const pubAuth   = require('../lib/public-auth');
const privacy   = require('../lib/privacy');
const router    = express.Router();

// Avatar upload (5MB, ảnh) — dùng chung config với /api/upload/avatar
const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
try { fs.mkdirSync(AVATAR_DIR, { recursive: true }); } catch(e){}
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function(req, file, cb){
    if (!/^image\/(jpe?g|png|webp|gif|heic|heif)$/i.test(file.mimetype)) {
      return cb(new Error('Chỉ chấp nhận file ảnh JPG/PNG/WEBP/GIF/HEIC'));
    }
    cb(null, true);
  }
});

// Helper: lưu file ảnh đã upload, trả về URL public
function saveAvatarFile(req, prefix) {
  if (!req.file) return null;
  const mt = req.file.mimetype || '';
  let ext = (mt.match(/\/(jpe?g|png|webp|gif|heic|heif)/i) || ['','jpg'])[1].toLowerCase().replace('jpeg','jpg');
  if (ext === 'heif') ext = 'heic';
  const fname = prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7) + '.' + ext;
  const filepath = path.join(AVATAR_DIR, fname);
  fs.writeFileSync(filepath, req.file.buffer);
  return '/uploads/avatars/' + fname;
}

// ===== TRANG FORM (yêu cầu đăng nhập) =====
router.get('/dang-ky-idol', pubAuth.requireLogin, function (req, res) {
  const user = pubAuth.getUser(req);
  res.render('tw-apply-idol', { active: 'apply', user: user });
});

router.get('/dang-ky-blv', pubAuth.requireLogin, function (req, res) {
  const user = pubAuth.getUser(req);
  res.render('tw-apply-blv', { active: 'apply', user: user });
});

// Helper validate
function bad(res, msg) { return res.status(400).json({ ok: false, error: msg }); }

// ===== SUBMIT IDOL APPLICATION (multipart hỗ trợ upload ảnh) =====
router.post('/api/apply/idol', pubAuth.requireLogin, avatarUpload.single('avatarFile'), function (req, res) {
  const user = pubAuth.getUser(req);
  if (!user) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
  const b = req.body || {};
  // Nếu có file upload → lưu, lấy URL
  let uploadedAvatar = '';
  try {
    if (req.file) uploadedAvatar = saveAvatarFile(req, 'idol_apply_' + (user.username||'u'));
  } catch(e) {
    return res.status(400).json({ ok:false, error:'Lỗi lưu ảnh: ' + e.message });
  }
  // Validate
  if (!b.stageName || b.stageName.length < 2) return bad(res, 'Tên nghệ danh tối thiểu 2 ký tự');
  if (!b.age || b.age < 18 || b.age > 50) return bad(res, 'Tuổi từ 18-50');
  if (!b.city) return bad(res, 'Chọn thành phố');
  if (!b.bio || b.bio.length < 20) return bad(res, 'Giới thiệu bản thân tối thiểu 20 ký tự');
  if (!b.agree) return bad(res, 'Vui lòng đồng ý điều khoản');

  const data = db.load();
  if (!data.idols) data.idols = [];

  // Check trùng (1 user chỉ apply 1 lần)
  const exists = data.idols.find(function(i){ return i.userId === user.username; });
  if (exists) {
    if (exists.status === 'pending') return bad(res, 'Đơn của bạn đang chờ admin duyệt');
    if (exists.status === 'active')  return bad(res, 'Bạn đã là idol rồi!');
    if (exists.status === 'rejected') return bad(res, 'Đơn trước bị từ chối: ' + (exists.rejectReason || 'không rõ lý do'));
  }

  // Tạo idol record với status pending
  const newIdol = {
    id: 'i_' + Date.now().toString(36),
    name: b.stageName.trim(),
    userId: user.username,
    avatar: uploadedAvatar || ('https://i.pravatar.cc/200?u=' + encodeURIComponent(b.stageName)),
    age: parseInt(b.age, 10),
    height: parseInt(b.height, 10) || null,
    weight: parseInt(b.weight, 10) || null,
    city: b.city,
    job: b.job || '',
    hobby: b.hobby || '',
    bio: b.bio.trim(),
    emoji: b.emoji || '👑',
    color: Math.floor(Math.random() * 360),
    status: 'pending',
    canLive: false,
    viewers: 0,
    totalStreams: 0,
    liveNow: false,
    room: 'Phòng Free',
    lock: 0,
    ipMasked: privacy.getMaskedIp(req),
    registeredAt: Date.now()
  };
  data.idols.push(newIdol);
  db.audit(data, 'New Idol application', newIdol.name + ' (user: ' + user.username + ')', 'system');
  db.save(data);
  res.json({ ok: true, message: 'Đã gửi đơn! Admin sẽ duyệt trong 24h.', id: newIdol.id });
});

// ===== SUBMIT BLV APPLICATION (multipart hỗ trợ upload ảnh) =====
router.post('/api/apply/blv', pubAuth.requireLogin, avatarUpload.single('avatarFile'), function (req, res) {
  const user = pubAuth.getUser(req);
  if (!user) return res.status(401).json({ ok:false, error:'Cần đăng nhập' });
  const b = req.body || {};
  let uploadedAvatar = '';
  try {
    if (req.file) uploadedAvatar = saveAvatarFile(req, 'blv_apply_' + (user.username||'u'));
  } catch(e) {
    return res.status(400).json({ ok:false, error:'Lỗi lưu ảnh: ' + e.message });
  }
  if (!b.stageName || b.stageName.length < 2) return bad(res, 'Tên BLV tối thiểu 2 ký tự');
  if (!b.sport) return bad(res, 'Chọn môn thể thao chuyên');
  if (!b.experience) return bad(res, 'Nhập số năm kinh nghiệm');
  if (!b.bio || b.bio.length < 30) return bad(res, 'Giới thiệu tối thiểu 30 ký tự');
  if (!b.agree) return bad(res, 'Vui lòng đồng ý điều khoản');

  const data = db.load();
  if (!data.blvs) data.blvs = [];

  const exists = data.blvs.find(function(x){ return x.userId === user.username; });
  if (exists) {
    if (exists.status === 'pending') return bad(res, 'Đơn của bạn đang chờ admin duyệt');
    if (exists.status === 'active')  return bad(res, 'Bạn đã là BLV rồi!');
    if (exists.status === 'rejected') return bad(res, 'Đơn trước bị từ chối: ' + (exists.rejectReason || 'không rõ'));
  }

  const newBlv = {
    id: 'b_' + Date.now().toString(36),
    name: b.stageName.trim(),
    userId: user.username,
    avatar: uploadedAvatar || ('https://i.pravatar.cc/200?u=blv_' + encodeURIComponent(b.stageName)),
    sport: b.sport,
    experience: parseInt(b.experience, 10) || 1,
    bio: b.bio.trim(),
    style: b.style || 'năng động',
    status: 'pending',
    canLive: false,
    followers: 0,
    totalStreams: 0,
    rating: 0,
    ipMasked: privacy.getMaskedIp(req),
    registeredAt: Date.now()
  };
  data.blvs.push(newBlv);
  db.audit(data, 'New BLV application', newBlv.name + ' (user: ' + user.username + ')', 'system');
  db.save(data);
  res.json({ ok: true, message: 'Đã gửi đơn! Admin sẽ duyệt trong 24h.', id: newBlv.id });
});

// ===== CHECK STATUS đơn của user (cho UI hiển thị "Đang chờ duyệt") =====
router.get('/api/apply/my-status', pubAuth.requireLogin, function (req, res) {
  const user = pubAuth.getUser(req);
  const data = db.load();
  const myIdol = (data.idols || []).find(function(i){ return i.userId === user.username; });
  const myBlv  = (data.blvs  || []).find(function(b){ return b.userId === user.username; });
  res.json({
    ok: true,
    idol: myIdol ? { status: myIdol.status, name: myIdol.name, canLive: !!myIdol.canLive, rejectReason: myIdol.rejectReason } : null,
    blv:  myBlv  ? { status: myBlv.status,  name: myBlv.name,  canLive: !!myBlv.canLive,  rejectReason: myBlv.rejectReason  } : null
  });
});

module.exports = router;
