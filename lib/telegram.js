/**
 * Telegram Bot API wrapper.
 * Setup:
 *  1. Chat voi @BotFather de tao bot moi -> lay TOKEN
 *  2. Set bien moi truong TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_USERNAME
 *  3. User chat voi bot, bot tra ve chatId cua user
 *  4. User dan chatId vao tai khoan -> luc nay co the gui OTP
 */
const https = require('https');

const TOKEN    = process.env.TELEGRAM_BOT_TOKEN || '';
const USERNAME = process.env.TELEGRAM_BOT_USERNAME || ''; // vd: 'X66TVBot' (khong co @)

function callApi(method, params) {
  return new Promise(function (resolve, reject) {
    if (!TOKEN) return reject(new Error('TELEGRAM_BOT_TOKEN chua duoc set'));
    const body = JSON.stringify(params || {});
    const req = https.request({
      hostname: 'api.telegram.org',
      path: '/bot' + TOKEN + '/' + method,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, function (res) {
      let raw = '';
      res.on('data', function(c){ raw += c; });
      res.on('end', function(){
        try {
          const j = JSON.parse(raw);
          if (j.ok) resolve(j.result); else reject(new Error(j.description || 'API error'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function escapeMd(s) {
  return String(s).replace(/[_*\[\]()~`>#+=|{}.!-]/g, function(c){ return '\\' + c; });
}

function otpText(code, brand, ttlMin) {
  return '🔐 *' + escapeMd(brand) + ' \\- Khoi phuc mat khau*\n\n' +
         'Ma OTP cua ban la:\n\n' +
         '`' + code + '`\n\n' +
         'Co hieu luc trong *' + ttlMin + ' phut*\\.\n' +
         '_Khong chia se cho bat ky ai\\._';
}

async function sendOtp(chatId, code, brandName, ttlMs) {
  if (!TOKEN) return { ok: false, demo: true };
  if (!chatId) return { ok: false, error: 'Chua co chatId' };
  const minutes = Math.round((ttlMs || 300000) / 60000);
  try {
    await callApi('sendMessage', {
      chat_id: chatId,
      text: otpText(code, brandName, minutes),
      parse_mode: 'MarkdownV2'
    });
    return { ok: true };
  } catch (e) {
    console.error('[Telegram] send fail:', e.message);
    return { ok: false, error: e.message };
  }
}

function deepLinkConnect(token) {
  if (!USERNAME) return null;
  return 'https://t.me/' + USERNAME + '?start=' + encodeURIComponent(token || '');
}

function isReady() { return !!TOKEN; }
function getBotUsername() { return USERNAME; }

module.exports = { sendOtp, deepLinkConnect, isReady, getBotUsername, callApi };
