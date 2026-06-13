/**
 * Web Push Notification (VAPID)
 *
 * Setup:
 *   npm install web-push
 *   Run once: node -e "console.log(require('web-push').generateVAPIDKeys())"
 *   Add to .env:
 *     VAPID_PUBLIC_KEY=BL...
 *     VAPID_PRIVATE_KEY=Yh...
 *     VAPID_SUBJECT=mailto:admin@xoso66tv.com
 */

let webpush = null;
try { webpush = require('web-push'); } catch(e) {
  console.warn('[push] web-push not installed. Run: npm install web-push');
}

const db = require('./db');

// VAPID config
const VAPID = {
  publicKey:  process.env.VAPID_PUBLIC_KEY  || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || '',
  subject:    process.env.VAPID_SUBJECT     || 'mailto:admin@xoso66tv.com'
};

if (webpush && VAPID.publicKey && VAPID.privateKey) {
  webpush.setVapidDetails(VAPID.subject, VAPID.publicKey, VAPID.privateKey);
  console.log('[push] VAPID configured');
} else {
  console.warn('[push] VAPID keys missing - push notifications disabled');
}

function ensurePushStore() {
  const data = db.load();
  if (!data.pushSubscriptions) data.pushSubscriptions = [];
  return data;
}

// Save user subscription
function saveSubscription(subscription, topics, userId) {
  if (!subscription || !subscription.endpoint) return false;
  const data = ensurePushStore();
  // Tìm bản ghi cũ cùng endpoint
  const idx = data.pushSubscriptions.findIndex(function(s){ return s.endpoint === subscription.endpoint; });
  const record = {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    topics: Array.isArray(topics) ? topics : ['idol_live'],
    userId: userId || null,
    createdAt: idx >= 0 ? data.pushSubscriptions[idx].createdAt : Date.now(),
    updatedAt: Date.now()
  };
  if (idx >= 0) data.pushSubscriptions[idx] = record;
  else data.pushSubscriptions.push(record);
  db.save(data);
  return true;
}

// Remove subscription
function removeSubscription(endpoint) {
  const data = ensurePushStore();
  const before = data.pushSubscriptions.length;
  data.pushSubscriptions = data.pushSubscriptions.filter(function(s){ return s.endpoint !== endpoint; });
  if (data.pushSubscriptions.length !== before) db.save(data);
  return before - data.pushSubscriptions.length;
}

// Send push to one subscription
async function sendOne(subscription, payload) {
  if (!webpush || !VAPID.publicKey) return { ok: false, reason: 'no_vapid' };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch(e) {
    // 410 Gone = subscription hết hạn → xóa
    if (e.statusCode === 410 || e.statusCode === 404) {
      removeSubscription(subscription.endpoint);
      return { ok: false, reason: 'expired', removed: true };
    }
    return { ok: false, reason: e.message };
  }
}

// Send push to all subscribers of a topic
async function sendToTopic(topic, payload) {
  if (!webpush || !VAPID.publicKey) return { ok: false, sent: 0, reason: 'no_vapid' };
  const data = ensurePushStore();
  const subs = data.pushSubscriptions.filter(function(s){
    return !s.topics || s.topics.indexOf(topic) >= 0;
  });
  const results = await Promise.allSettled(subs.map(function(s){
    return sendOne({ endpoint: s.endpoint, keys: s.keys }, payload);
  }));
  const sent = results.filter(function(r){ return r.status === 'fulfilled' && r.value.ok; }).length;
  console.log('[push] Sent', sent, '/', subs.length, 'for topic:', topic);
  return { ok: true, total: subs.length, sent: sent };
}

// Send push to specific user
async function sendToUser(userId, payload) {
  if (!webpush) return { ok: false, sent: 0 };
  const data = ensurePushStore();
  const subs = data.pushSubscriptions.filter(function(s){ return s.userId === userId; });
  const results = await Promise.allSettled(subs.map(function(s){
    return sendOne({ endpoint: s.endpoint, keys: s.keys }, payload);
  }));
  const sent = results.filter(function(r){ return r.status === 'fulfilled' && r.value.ok; }).length;
  return { ok: true, total: subs.length, sent: sent };
}

// Notify when idol goes LIVE
async function notifyIdolLive(idol) {
  if (!idol) return;
  return sendToTopic('idol_live', {
    title: '🔴 ' + idol.name + ' đang LIVE!',
    body: idol.category === 'casino' ? 'Live sòng bài đang bắt đầu - vào xem ngay!' :
          idol.category === 'bongda' ? 'BLV bóng đá vừa lên sóng - không thể bỏ lỡ!' :
          idol.category === 'esport' ? 'BLV esports lên sóng - hot trận!' :
          'Idol show đang diễn ra - vào ngay kẻo trễ!',
    icon: idol.cardImage || idol.avatar || '/static/img/logoxoso66tv.webp',
    tag: 'idol-live-' + idol.id,
    url: '/idol/' + idol.id,
    requireInteraction: false,
    vibrate: [300, 100, 300],
    actions: [
      { action: 'open', title: '🎬 Xem ngay' },
      { action: 'close', title: 'Để sau' }
    ]
  });
}

// Notify match starting (bóng hot 15 phút trước trận)
async function notifyMatchStart(match) {
  if (!match) return;
  return sendToTopic('match_start', {
    title: '⚽ ' + match.home + ' vs ' + match.away,
    body: 'Trận ' + (match.league || '') + ' sắp diễn ra lúc ' + (match.time || ''),
    icon: match.poster || '/static/img/logoxoso66tv.webp',
    tag: 'match-' + match.id,
    url: '/live/' + (match.slug || match.id),
    requireInteraction: false
  });
}

// ═══════════════════════════════════════════════════════════════
// 📢 Mục 26: NOTIFICATIONS MỞ RỘNG
// ═══════════════════════════════════════════════════════════════

// 🎯 Match result (trận kết thúc - gửi cho user đã subscribe match)
async function notifyMatchResult(match) {
  if (!match) return;
  const score = (match.homeScore != null && match.awayScore != null)
    ? (match.homeScore + ' - ' + match.awayScore) : 'Kết thúc';
  return sendToTopic('match_result', {
    title: '🏁 ' + match.home + ' ' + score + ' ' + match.away,
    body: 'Trận ' + (match.league || 'bóng đá') + ' đã kết thúc. Xem highlight ngay!',
    icon: match.poster || '/static/img/logoxoso66tv.webp',
    tag: 'match-result-' + match.id,
    url: '/live/' + (match.slug || match.id),
    requireInteraction: false
  });
}

// 🎁 Gift received (gửi cho idol/blv nhận quà)
async function notifyGiftReceived(opts) {
  // opts = { recipientUserId, senderName, giftName, giftValue, giftIcon, roomUrl }
  if (!opts || !opts.recipientUserId) return;
  return sendToUser(opts.recipientUserId, {
    title: '🎁 ' + (opts.senderName || 'Ai đó') + ' tặng bạn ' + (opts.giftName || 'quà'),
    body: '+' + (opts.giftValue || 0) + ' X COIN! Cám ơn fan nhé 💖',
    icon: opts.giftIcon || '/static/img/logoxoso66tv.webp',
    tag: 'gift-' + Date.now(),
    url: opts.roomUrl || '/profile?tab=wallet',
    requireInteraction: false,
    vibrate: [200, 80, 200]
  });
}

// 📅 Daily digest (sáng 8h - nhắc check-in + missions)
async function notifyDailyDigest() {
  return sendToTopic('daily_digest', {
    title: '🎁 Điểm danh nhận X COIN miễn phí!',
    body: 'Hoàn thành 5 nhiệm vụ hôm nay để nhận thêm tới 140 X COIN.',
    icon: '/static/img/logoxoso66tv.webp',
    tag: 'daily-digest',
    url: '/profile?tab=checkin',
    requireInteraction: false
  });
}

// 🔔 Schedule stream reminder (idol có lịch trong 10-15 phút)
async function notifyScheduledStream(schedule) {
  if (!schedule) return;
  return sendToTopic('idol_live', {
    title: '⏰ ' + (schedule.idolName || 'Idol') + ' sắp lên sóng!',
    body: 'Bắt đầu lúc ' + (schedule.startTime || 'sắp tới') + ' - đặt báo thức ngay',
    icon: schedule.avatar || '/static/img/logoxoso66tv.webp',
    tag: 'scheduled-' + schedule.id,
    url: '/idol/' + schedule.idolId,
    requireInteraction: false,
    vibrate: [200, 100, 200]
  });
}

// 💰 Coin reward (webhook deposit từ xoso66, milestone, giveaway)
async function notifyCoinReward(opts) {
  // opts = { userId, amount, reason, url }
  if (!opts || !opts.userId) return;
  return sendToUser(opts.userId, {
    title: '💰 +' + (opts.amount || 0) + ' X COIN!',
    body: opts.reason || 'Bạn vừa nhận coin thưởng',
    icon: '/static/img/logoxoso66tv.webp',
    tag: 'coin-' + Date.now(),
    url: opts.url || '/profile?tab=wallet',
    requireInteraction: false
  });
}

// ─── User preferences ───
function getUserTopics(userId) {
  if (!userId) return [];
  const data = ensurePushStore();
  const subs = data.pushSubscriptions.filter(function(s){ return s.userId === userId; });
  if (subs.length === 0) return [];
  return subs[0].topics || [];
}

function updateUserTopics(userId, topics) {
  if (!userId || !Array.isArray(topics)) return false;
  const data = ensurePushStore();
  let updated = false;
  data.pushSubscriptions.forEach(function(s){
    if (s.userId === userId) {
      s.topics = topics;
      s.updatedAt = Date.now();
      updated = true;
    }
  });
  if (updated) db.save(data);
  return updated;
}

const ALL_TOPICS = [
  { id: 'idol_live',     name: 'Idol/BLV go LIVE',       desc: 'Khi idol favorite lên sóng + lịch live sắp tới', default: true },
  { id: 'match_start',   name: 'Trận đấu sắp bắt đầu',  desc: '15 phút trước trận bóng hot',                      default: true },
  { id: 'match_result',  name: 'Kết quả trận đấu',     desc: 'Tỷ số cuối trận + link highlight',                 default: false },
  { id: 'gift_received', name: 'Quà nhận được',         desc: 'Khi có người tặng quà (chỉ idol/BLV)',            default: true },
  { id: 'daily_digest',  name: 'Nhắc nhở hằng ngày',    desc: 'Sáng 8h: điểm danh + nhiệm vụ',                    default: true },
  { id: 'coin_reward',   name: 'Thưởng X COIN',         desc: 'Nạp tiền, milestone, giveaway',                    default: true }
];

module.exports = {
  VAPID,
  saveSubscription, removeSubscription,
  sendOne, sendToTopic, sendToUser,
  notifyIdolLive, notifyMatchStart,
  notifyMatchResult, notifyGiftReceived,
  notifyDailyDigest, notifyScheduledStream, notifyCoinReward,
  getUserTopics, updateUserTopics, ALL_TOPICS
};
