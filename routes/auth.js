const express  = require('express');
const partners = require('../lib/partners');
const router   = express.Router();

router.get('/dang-nhap',     function (req, res) { res.render('dang-nhap',     { active: 'auth' }); });
router.get('/dang-ky',       function (req, res) { res.render('dang-ky',       { active: 'auth' }); });
router.get('/quen-mat-khau', function (req, res) { res.render('quen-mat-khau', { active: 'auth' }); });

router.post('/api/dang-nhap', function (req, res) {
  const body = req.body || {};
  const u = body.username, p = body.password;
  if (!u || u.length < 3 || !p || p.length < 6) {
    return res.json({ ok: false, message: 'Thong tin dang nhap khong hop le' });
  }
  res.json({ ok: true, redirect: partners.partner.login + '&u=' + encodeURIComponent(u) });
});

router.post('/api/dang-ky', function (req, res) {
  const b = req.body || {};
  if (!b.username || !b.fullname || !b.phone || !b.password) {
    return res.json({ ok: false, message: 'Thieu thong tin bat buoc' });
  }
  if (!/^0[3-9][0-9]{8}$/.test(b.phone)) {
    return res.json({ ok: false, message: 'SDT khong hop le' });
  }
  if (b.password.length < 8) {
    return res.json({ ok: false, message: 'Mat khau yeu' });
  }
  res.json({ ok: true, redirect: partners.partner.register + '&u=' + encodeURIComponent(b.username) + '&p=' + encodeURIComponent(b.phone) });
});

module.exports = router;
