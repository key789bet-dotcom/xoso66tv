/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ AUTO-END SCHEDULED LIVE — tự động cắt live khi hết lịch          ║
 * ║                                                                    ║
 * ║ Quy tắc:                                                           ║
 * ║   - Chạy mỗi 30 giây                                              ║
 * ║   - Tìm schedule status='approved', endTime + 5p < now            ║
 * ║   - Cho cả idol VÀ blv                                            ║
 * ║   - Hành động cho mỗi schedule hết hạn:                           ║
 * ║     1. Kick OBS publisher khỏi SRS (nếu đang push)                ║
 * ║     2. Set idol/blv.liveNow = false                               ║
 * ║     3. Rotate stream key (key cũ vô hiệu — phải đăng ký lịch mới) ║
 * ║     4. Mark schedule status='ended', endedAt, endReason           ║
 * ║     5. Push notification cho user                                 ║
 * ║                                                                    ║
 * ║ Idempotent: schedule có status='ended' sẽ KHÔNG xử lý lại          ║
 * ╚══════════════════════════════════════════════════════════════════*/
const db = require('./db');
const scheduleStore = require('./schedule-store');

// ⏰ Grace period: cho phép idol stream quá giờ 5 phút trước khi cắt
const GRACE_MS = 5 * 60 * 1000;

// SRS API
const SRS_STREAMS_API = process.env.SRS_API_URL || 'http://127.0.0.1:1985/api/v1/streams/';
const SRS_CLIENTS_API = (process.env.SRS_API_URL || 'http://127.0.0.1:1985/api/v1/streams/')
  .replace(/\/streams\/?$/, '/clients/');

function _fetch(){ return (typeof fetch === 'function') ? fetch : require('node-fetch'); }

/**
 * Kick publisher khỏi SRS bằng stream key (kill connection ngay lập tức)
 * → OBS sẽ nhận disconnect, không thể reconnect với key này
 */
async function _kickPublisher(streamKey) {
  if (!streamKey) return false;
  try {
    const fetchFn = _fetch();
    // 1. List streams → tìm stream có name khớp streamKey
    const resp = await fetchFn(SRS_STREAMS_API);
    if (!resp.ok) return false;
    const data = await resp.json();
    const streams = data.streams || [];
    // Match exact hoặc prefix (key có thể có suffix random)
    const target = streams.find(s =>
      s && s.publish && s.publish.active &&
      (s.name === streamKey || (s.name && s.name.indexOf(streamKey + '_') === 0))
    );
    if (!target) return false; // không đang publish → không cần kick

    // 2. List clients để tìm publisher của stream này
    const clientsResp = await fetchFn(SRS_CLIENTS_API);
    if (!clientsResp.ok) return false;
    const cdata = await clientsResp.json();
    const clients = cdata.clients || [];
    const publisher = clients.find(c =>
      c && c.publish === true && c.stream === target.name
    );
    if (!publisher) return false;

    // 3. DELETE client to kick
    const kickResp = await fetchFn(SRS_CLIENTS_API + publisher.id, { method: 'DELETE' });
    return kickResp.ok;
  } catch (e) {
    console.warn('[AUTO-END] _kickPublisher error:', e.message);
    return false;
  }
}

/**
 * Generate stream key mới (rotate)
 */
function _genStreamKey(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Push notification + audit log
 */
function _notifyAndAudit(username, scheduleId, userType) {
  try {
    scheduleStore.pushNotification(username, {
      title: '⏰ Phiên live đã kết thúc theo lịch',
      body:  'Stream key cũ đã vô hiệu. Để live tiếp, vui lòng đăng ký lịch mới và chờ admin duyệt.',
      type:  'auto-end-live',
      link:  '/idol-studio'
    });
  } catch(_) {}
  try {
    const d = db.load();
    if (!Array.isArray(d.auditLog)) d.auditLog = [];
    d.auditLog.unshift({
      id: 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      action: 'auto_end_live',
      target: userType + ':' + username + ' schedule:' + scheduleId,
      by:     'cron',
      ip:     'localhost',
      at:     Date.now()
    });
    if (d.auditLog.length > 500) d.auditLog = d.auditLog.slice(0, 500);
    db.save(d);
  } catch(_) {}
}

/**
 * MAIN: quét schedules hết hạn và cắt live
 * Dùng scheduleStore (file JSON riêng, độc lập DB backend)
 */
async function tick() {
  const expired = scheduleStore.listExpired(GRACE_MS);
  if (!expired.length) return { processed: 0 };

  // Chỉ load db để update idols/blvs (liveNow + streamKey)
  const data = db.load();
  let mutatedDb = false;
  let processed = 0;

  for (const sch of expired) {
    const userType = sch.userType === 'blv' ? 'blv' : 'idol';
    const collection = userType === 'blv' ? (data.blvs || []) : (data.idols || []);

    const user = collection.find(x =>
      (x.username || '').toLowerCase() === sch.username ||
      (x.slug || '').toLowerCase() === sch.username ||
      (x.id || '').toLowerCase() === sch.username.toLowerCase()
    );

    // 1. Kick publisher khỏi SRS (nếu đang push)
    const streamKey = user && (user.streamKey || user.stream_key);
    let kicked = false;
    if (streamKey) {
      kicked = await _kickPublisher(streamKey);
    }

    // 2. Set liveNow=false + rotate stream key
    if (user) {
      user.liveNow = false;
      delete user.liveStartedAt;
      const prefix = user.id || ('u_' + (user.username || sch.username));
      user.streamKey = _genStreamKey(prefix);
      mutatedDb = true;
    }

    // 3. Mark schedule ended (qua store riêng)
    scheduleStore.markEnded(sch.id, { reason: 'auto_end_by_schedule', kicked: kicked });

    // 4. Notify + audit
    _notifyAndAudit(sch.username, sch.id, userType);

    console.log('[AUTO-END] ' + userType + ':' + sch.username +
                ' schedule:' + sch.id +
                ' kicked:' + kicked +
                ' newKey:' + (user && user.streamKey ? 'rotated' : 'noUser'));
    processed++;
  }

  if (mutatedDb) db.save(data);
  return { processed };
}

/**
 * Khởi động cron (gọi 1 lần từ server.js)
 */
function start(intervalMs) {
  const interval = intervalMs || 30 * 1000;
  console.log('[AUTO-END] Cron started — check every ' + (interval/1000) + 's, grace=' + (GRACE_MS/60000) + 'min');
  // Chạy ngay lần đầu sau 10s (để server boot xong)
  setTimeout(() => tick().catch(e => console.warn('[AUTO-END] tick error:', e.message)), 10000);
  // Periodic
  return setInterval(() => {
    tick().catch(e => console.warn('[AUTO-END] tick error:', e.message));
  }, interval);
}

module.exports = { tick, start, GRACE_MS };
