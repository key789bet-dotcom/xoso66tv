const express = require('express');
const sync    = require('../lib/partner-sync');
const router  = express.Router();

// ===== PUBLIC WEBHOOK =====
// xoso66 gọi: POST /api/partner/xoso66/deposit
// Headers: X-Webhook-Signature (HMAC SHA256 hex của body)
// Body: { username, amount, txId, fullname?, phone?, email? }
router.post('/api/partner/xoso66/deposit', function(req, res){
  var sig = req.headers['x-webhook-signature'] || '';
  var v = sync.verifySignature(req.body, sig);
  if (!v.ok) return res.status(401).json({ ok:false, error: v.reason });

  var result = sync.processDeposit(req.body);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// ===== INFO (cho xoso66 dev xem) =====
router.get('/api/partner/xoso66/info', function(req, res){
  var cfg = sync.loadConfig();
  res.json({
    webhookUrl: cfg.myWebhookUrl,
    method: 'POST',
    contentType: 'application/json',
    signatureHeader: 'X-Webhook-Signature',
    bodyExample: {
      username: 'user_test',
      amount: 500000,
      txId: 'XS66-2026-001',
      fullname: 'Nguyen Van A',
      phone: '0912345678'
    },
    conversionRate: '1.000 VND nạp → ' + cfg.coinPerVndK + ' X COIN',
    bonusTiers: cfg.bonusTiers,
    enabled: cfg.enabled
  });
});

module.exports = router;
