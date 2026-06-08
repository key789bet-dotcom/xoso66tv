const express = require('express');
const links   = require('../lib/account-link');
const router  = express.Router();

// POST /api/link/xoso66/request - tạo yêu cầu liên kết
router.post('/api/link/xoso66/request', function(req, res){
  var b = req.body || {};
  res.json(links.requestLink(b.x66tvUsername, b.xoso66Username));
});

// POST /api/link/xoso66/confirm - xác nhận bằng code
router.post('/api/link/xoso66/confirm', function(req, res){
  var b = req.body || {};
  res.json(links.confirmLink(b.x66tvUsername, b.xoso66Username, b.code));
});

// POST /api/link/xoso66/unlink
router.post('/api/link/xoso66/unlink', function(req, res){
  var b = req.body || {};
  res.json(links.unlink(b.x66tvUsername));
});

// GET /api/link/xoso66/status - check trạng thái
router.get('/api/link/xoso66/status', function(req, res){
  var u = req.query.username;
  if (!u) return res.json({ linked:false });
  var l = links.getLinkByX66tv(u);
  if (!l) return res.json({ linked:false });
  res.json({ linked:true, xoso66Username: l.xoso66Username, linkedAt: l.linkedAt, totalReceived: l.totalReceived||0 });
});

module.exports = router;
