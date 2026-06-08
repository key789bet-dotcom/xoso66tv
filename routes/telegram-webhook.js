/**
 * Telegram bot webhook + link helpers.
 * Khi user start bot voi /start <code>, bot tu link chatId vao tai khoan.
 *
 * Setup webhook (production):
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://yourdomain.com/api/telegram/webhook"
 *
 * Hoac long-polling (development):
 *   Khong can webhook, user tu chat /start <code> -> bot KHONG biet luc nao.
 *   De don gian cho dev: user co the dan chatId trong tai khoan thu cong.
 */
const express = require('express');
const db      = require('../lib/db');
const tele    = require('../lib/telegram');

const router = express.Router();

// In-memory map: linkCode -> userId (15 phut)
const linkCodes = new Map();

function genLinkCode() {
  return Math.random().toString(36).slice(2, 10);
}

// User goi tu trang profile: "Lien ket Telegram"
router.post('/api/telegram/connect-link', function (req, res) {
  const { userId } = req.body || {};
  if (!userId) return res.json({ ok:false, message:'Thieu userId' });
  const code = genLinkCode();
  linkCodes.set(code, { userId: userId, exp: Date.now() + 15*60*1000 });
  const link = tele.deepLinkConnect(code);
  if (!link) return res.json({ ok:false, message:'Bot chua duoc cau hinh' });
  res.json({ ok:true, link: link, code: code, expiresIn: 900 });
});

// Webhook nhan update tu Telegram
router.post('/api/telegram/webhook', async function (req, res) {
  res.json({ ok:true });  // tra ngay de Telegram khong retry
  try {
    const msg = req.body && req.body.message;
    if (!msg || !msg.text) return;
    const chatId = msg.chat && msg.chat.id;
    const text = msg.text.trim();

    if (text.startsWith('/start')) {
      const parts = text.split(/\s+/);
      const param = parts[1] || '';
      // Welcome
      await tele.callApi('sendMessage', {
        chat_id: chatId,
        text: '👋 Chao mung! Day la chatId cua ban:\n\n`' + chatId + '`\n\n' +
              (param ? 'Dang ket noi tai khoan voi ma: ' + param : 'Su dung chatId nay de dan vao tai khoan.'),
        parse_mode: 'Markdown'
      });

      if (param) {
        // Tu dong link chatId vao tai khoan
        const rec = linkCodes.get(param);
        if (rec && Date.now() < rec.exp) {
          const data = db.load();
          const user = data.users.find(function(u){ return u.id === rec.userId; });
          if (user) {
            user.telegramChatId = String(chatId);
            db.audit(data, 'Link Telegram', user.username + ' -> chatId ' + chatId, 'self');
            db.save(data);
            linkCodes.delete(param);
            await tele.callApi('sendMessage', { chat_id: chatId, text: '✅ Da ket noi Telegram voi tai khoan *' + user.username + '* thanh cong. Tu gio ban se nhan OTP khoi phuc mat khau qua day.', parse_mode:'Markdown' });
          }
        }
      }
    } else if (text === '/chatid' || text === '/id') {
      await tele.callApi('sendMessage', { chat_id: chatId, text: 'Chat ID cua ban: `' + chatId + '`', parse_mode:'Markdown' });
    } else {
      // help
      await tele.callApi('sendMessage', { chat_id: chatId, text: 'Lenh: /start, /chatid' });
    }
  } catch (e) {
    console.error('[Telegram webhook]', e.message);
  }
});

// Endpoint admin: dan chatId thu cong
router.post('/admin/api/users/:id/telegram', function (req, res) {
  const data = db.load();
  const u = data.users.find(function(x){ return x.id === req.params.id; });
  if (!u) return res.json({ ok:false, message:'User khong ton tai' });
  u.telegramChatId = String(req.body.chatId || '').trim();
  db.audit(data, 'Set Telegram chatId', u.username + ' -> ' + u.telegramChatId, 'admin');
  db.save(data);
  res.json({ ok:true, message:'Da cap nhat chatId' });
});

module.exports = router;
