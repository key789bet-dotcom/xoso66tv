#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 📡 Telegram auto-share — backlink + drive traffic                 ║
 * ║                                                                    ║
 * ║ Mỗi 6h chạy: lấy 3 bài /tin-tuc mới nhất từ news-store           ║
 * ║ → format message + send to Telegram channel/group                ║
 * ║ → tạo backlink quality từ Telegram (Google crawl tốt)             ║
 * ║                                                                    ║
 * ║ Setup ENV:                                                        ║
 * ║   TELEGRAM_BOT_TOKEN=123:abc...                                   ║
 * ║   TELEGRAM_CHANNEL_ID=@xoso66tv hoặc -100xxx                      ║
 * ║                                                                    ║
 * ║ Cron: 0 */6 * * * cd /var/www/xoso66tv && node scripts/telegram-share-news.js
 * ╚══════════════════════════════════════════════════════════════════*/
const https = require('https');
const fs = require('fs');
const path = require('path');

const newsStore = require('../lib/news-store');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '';
const SITE = 'https://xoso66tv.com';

// Track last shared IDs để không spam lại bài cũ
const STATE_FILE = path.join(__dirname, '..', 'data', '.telegram-shared.json');

function loadShared() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch(e) {}
  return { ids: [], lastRun: 0 };
}

function saveShared(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch(e) { console.error('[TG] save state fail:', e.message); }
}

function sendTelegram(text, photoUrl) {
  return new Promise((resolve, reject) => {
    if (!BOT_TOKEN || !CHANNEL_ID) {
      return resolve({ ok: false, error: 'TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHANNEL_ID chưa setup' });
    }
    const useMethod = photoUrl ? 'sendPhoto' : 'sendMessage';
    const body = JSON.stringify(
      photoUrl ? {
        chat_id: CHANNEL_ID,
        photo: photoUrl,
        caption: text,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      } : {
        chat_id: CHANNEL_ID,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      }
    );

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${useMethod}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch(e) { resolve({ ok: false, error: data.slice(0, 200) }); }
      });
    });
    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}

function formatMessage(article) {
  const url = SITE + '/tin-tuc/' + (article.slug || article.id);
  const title = (article.title || '').replace(/[<>]/g, '');
  const excerpt = (article.excerpt || '').slice(0, 250).replace(/[<>]/g, '');
  const tags = (article.tags || ['bongda','xoso66']).slice(0, 5).map(t => '#' + t.replace(/\s+/g, '_')).join(' ');

  return [
    `⚽ <b>${title}</b>`,
    '',
    excerpt,
    '',
    `🔗 Đọc chi tiết: ${url}`,
    '',
    `${tags}`,
    `🎯 <a href="${SITE}/">XOSO66 TV - Xem trực tiếp bóng đá Full HD</a>`
  ].join('\n');
}

async function main() {
  if (!BOT_TOKEN || !CHANNEL_ID) {
    console.log('⚠️  Chưa setup TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID');
    console.log('   Add vào .env:');
    console.log('   TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather');
    console.log('   TELEGRAM_CHANNEL_ID=@xoso66tv  (hoặc -100xxx group id)');
    process.exit(0);
  }

  const state = loadShared();
  const articles = newsStore.listRecent(20);
  const newOnes = articles.filter(a => state.ids.indexOf(a.id) === -1).slice(0, 3);

  if (newOnes.length === 0) {
    console.log('[TG] Không có bài mới để share.');
    process.exit(0);
  }

  console.log(`[TG] Sẽ share ${newOnes.length} bài lên ${CHANNEL_ID}...`);

  let success = 0;
  for (const a of newOnes) {
    try {
      const msg = formatMessage(a);
      const res = await sendTelegram(msg, a.image || null);
      if (res.ok) {
        console.log(`[TG] ✅ ${a.title.slice(0, 50)}`);
        state.ids.push(a.id);
        success++;
      } else {
        console.warn(`[TG] ❌ ${a.title.slice(0, 50)}:`, res.error || res.description);
      }
      // Tránh rate limit: đợi 3s giữa các message
      await new Promise(r => setTimeout(r, 3000));
    } catch(e) {
      console.error(`[TG] error:`, e.message);
    }
  }

  // Cleanup: chỉ giữ 200 IDs mới nhất
  state.ids = state.ids.slice(-200);
  state.lastRun = Date.now();
  saveShared(state);

  console.log(`[TG] Hoàn tất: ${success}/${newOnes.length} bài đã share.`);
}

main().catch(e => { console.error(e); process.exit(1); });
