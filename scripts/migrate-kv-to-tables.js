/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ MIGRATION SCRIPT — KV JSON → Relational Tables                ║
 * ║                                                                ║
 * ║ Chạy 1 lần để chuyển data từ MySQL KV pattern sang tables thật ║
 * ║ Script SAFE: KHÔNG xoá KV row, chỉ INSERT vào tables.          ║
 * ║                                                                ║
 * ║ Usage:                                                          ║
 * ║   cd /var/www/xoso66tv                                         ║
 * ║   node scripts/migrate-kv-to-tables.js                         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

(async function main() {
  if (!process.env.MYSQL_HOST) {
    console.error('❌ MYSQL_HOST chưa set trong .env');
    process.exit(1);
  }

  const pool = mysql.createPool({
    host:     process.env.MYSQL_HOST,
    port:     +process.env.MYSQL_PORT || 3306,
    user:     process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    charset:  'utf8mb4_unicode_ci'
  });

  console.log('═══════════════════════════════════════════');
  console.log('🐬 MIGRATE KV JSON → Relational Tables');
  console.log('═══════════════════════════════════════════\n');

  // 1. Đọc KV row 'main'
  const [rows] = await pool.query("SELECT value FROM kv WHERE `key` = 'main'");
  if (!rows.length) {
    console.error('❌ Không tìm thấy row kv.main');
    process.exit(1);
  }
  const data = JSON.parse(rows[0].value);
  console.log('📊 Source data từ KV:');
  console.log('   users:        ', (data.users || []).length);
  console.log('   idols:        ', (data.idols || []).length);
  console.log('   blvs:         ', (data.blvs || []).length);
  console.log('   obs:          ', (data.obs || []).length);
  console.log('   auditLog:     ', (data.auditLog || []).length);
  console.log('');

  // ─── 2. Migrate USERS ────────────────────────────────────────
  console.log('👥 Migrate users...');
  let userCount = 0;
  for (const u of (data.users || [])) {
    try {
      await pool.query(`
        INSERT INTO users
          (id, username, email, phone, password_hash, role, vip_tier, x_coin,
           display_name, avatar, status, xoso66_linked, xoso66_username,
           last_login_at, last_login_ip, extra)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          email = VALUES(email),
          phone = VALUES(phone),
          vip_tier = VALUES(vip_tier),
          x_coin = VALUES(x_coin),
          extra = VALUES(extra)
      `, [
        u.id || u._id || ('u_' + Math.random().toString(36).slice(2,10)),
        u.username,
        u.email || null,
        u.phone || null,
        u.passwordHash || u.password_hash || null,
        u.role || 'user',
        +(u.vip || u.vipTier || u.vip_tier) || 0,
        +(u.xCoin || u.x_coin || u.balance) || 0,
        u.fullname || u.displayName || u.display_name || u.username,
        u.avatar || null,
        u.status || 'active',
        u.xoso66Linked || u.xoso66_linked ? 1 : 0,
        u.xoso66Username || u.xoso66_username || null,
        u.lastLoginAt ? new Date(u.lastLoginAt) : null,
        u.lastLoginIp || u.last_login_ip || null,
        JSON.stringify({
          createdAt: u.createdAt || u.created_at,
          // Giữ tất cả field khác chưa map vào extra
          ...Object.fromEntries(Object.entries(u).filter(([k]) =>
            !['id','_id','username','email','phone','passwordHash','password_hash',
              'role','vip','vipTier','vip_tier','xCoin','x_coin','balance',
              'fullname','displayName','display_name','avatar','status',
              'xoso66Linked','xoso66_linked','xoso66Username','xoso66_username',
              'lastLoginAt','lastLoginIp','last_login_ip','createdAt','created_at'].includes(k)
          ))
        })
      ]);
      userCount++;
    } catch (e) {
      console.warn('   ⚠️  user', u.username, '→', e.message);
    }
  }
  console.log('   ✅ Migrated', userCount, 'users\n');

  // Helper: validate user_id existence để tránh FK fail
  async function _validUserId(uid) {
    if (!uid) return null;
    const [r] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [uid]);
    return r.length ? uid : null;
  }

  // ─── 3. Migrate IDOLS ────────────────────────────────────────
  console.log('💎 Migrate idols...');
  let idolCount = 0;
  for (const i of (data.idols || [])) {
    try {
      const validUid = await _validUserId(i.userId || i.user_id);
      await pool.query(`
        INSERT INTO idols
          (id, user_id, name, slug, avatar, card_image, category, bio,
           live_now, live_started_at, status, lock_coin, pin_code,
           followers, total_views, total_x_coin, emoji, color,
           stream_key, extra)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          live_now = VALUES(live_now),
          extra = VALUES(extra)
      `, [
        i.id,
        validUid,  // ✓ null nếu user_id không tồn tại trong users table
        i.name,
        i.slug || i.id,
        i.avatar || null,
        i.cardImage || i.card_image || null,
        i.category || 'idol',
        i.bio || null,
        i.liveNow ? 1 : 0,
        i.liveStartedAt ? new Date(i.liveStartedAt) : null,
        i.status || 'active',
        +(i.lock || i.lockCoin || i.lock_coin) || 0,
        i.pinCode || i.pin_code || null,
        +(i.followers) || 0,
        +(i.totalViews || i.total_views) || 0,
        +(i.totalXCoin || i.total_x_coin) || 0,
        i.emoji || null,
        +(i.color) || 0,
        i.streamKey || i.stream_key || null,
        JSON.stringify({
          ...Object.fromEntries(Object.entries(i).filter(([k]) =>
            !['id','userId','user_id','name','slug','avatar','cardImage','card_image',
              'category','bio','liveNow','liveStartedAt','status','lock','lockCoin',
              'lock_coin','pinCode','pin_code','followers','totalViews','total_views',
              'totalXCoin','total_x_coin','emoji','color','streamKey','stream_key'].includes(k)
          ))
        })
      ]);
      idolCount++;
    } catch (e) {
      console.warn('   ⚠️  idol', i.name, '→', e.message);
    }
  }
  console.log('   ✅ Migrated', idolCount, 'idols\n');

  // ─── 4. Migrate BLVS ─────────────────────────────────────────
  console.log('🎙️ Migrate blvs...');
  let blvCount = 0;
  for (const b of (data.blvs || [])) {
    try {
      const validUid = await _validUserId(b.userId || b.user_id);
      await pool.query(`
        INSERT INTO blvs
          (id, user_id, name, slug, avatar, card_image, live_now,
           live_started_at, status, stream_key, extra)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name)
      `, [
        b.id, validUid, b.name, b.slug || b.id,
        b.avatar || null, b.cardImage || b.card_image || null,
        b.liveNow ? 1 : 0,
        b.liveStartedAt ? new Date(b.liveStartedAt) : null,
        b.status || 'active',
        b.streamKey || b.stream_key || null,
        JSON.stringify({})
      ]);
      blvCount++;
    } catch (e) {
      console.warn('   ⚠️  blv', b.name, '→', e.message);
    }
  }
  console.log('   ✅ Migrated', blvCount, 'blvs\n');

  // ─── 5. Migrate OBS REQUESTS ─────────────────────────────────
  console.log('📡 Migrate obs_requests...');
  let obsCount = 0;
  for (const o of (data.obs || [])) {
    try {
      await pool.query(`
        INSERT INTO obs_requests
          (id, requester_type, requester_id, stream_key, rtmp_url,
           status, stream_active, reviewed_by, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status), stream_active = VALUES(stream_active)
      `, [
        o.id,
        o.requesterType || o.requester_type || 'idol',
        o.requesterId || o.requester_id || '',
        o.streamKey || o.stream_key || null,
        o.rtmpUrl || o.rtmp_url || null,
        o.status || 'pending',
        o.streamActive ? 1 : 0,
        o.reviewedBy || o.reviewed_by || null,
        o.reviewedAt ? new Date(o.reviewedAt) : null
      ]);
      obsCount++;
    } catch (e) {
      console.warn('   ⚠️  obs', o.id, '→', e.message);
    }
  }
  console.log('   ✅ Migrated', obsCount, 'obs_requests\n');

  // ─── 6. Migrate AUDIT LOG ────────────────────────────────────
  console.log('📝 Migrate audit_log...');
  let auditCount = 0;
  for (const a of (data.auditLog || []).slice(0, 1000)) {
    try {
      await pool.query(`
        INSERT INTO audit_log (action, target, by_user, ip, created_at)
        VALUES (?, ?, ?, ?, ?)
      `, [
        a.action || 'unknown',
        a.target || null,
        a.by || a.byUser || 'system',
        a.ip || null,
        a.at ? new Date(a.at) : new Date()
      ]);
      auditCount++;
    } catch (e) {
      console.warn('   ⚠️  audit →', e.message);
    }
  }
  console.log('   ✅ Migrated', auditCount, 'audit log entries\n');

  // ─── 7. Migrate SETTINGS (banners, partner links từ KV nếu có) ──
  console.log('⚙️  Settings migrate: skipped (admin sẽ tạo qua UI)\n');

  // ─── 8. Verify counts ────────────────────────────────────────
  console.log('═══════════════════════════════════════════');
  console.log('✅ VERIFY counts trong tables:');
  for (const table of ['users','idols','blvs','obs_requests','audit_log']) {
    const [r] = await pool.query(`SELECT COUNT(*) AS c FROM ${table}`);
    console.log(`   ${table.padEnd(15)} : ${r[0].c} rows`);
  }
  console.log('═══════════════════════════════════════════');
  console.log('🎉 MIGRATION HOÀN TẤT!');
  console.log('');
  console.log('Next step: set ENV USE_RELATIONAL=1 trong .env → reload PM2');
  console.log('Đến lúc đó code sẽ đọc từ tables thay vì KV.');

  await pool.end();
  process.exit(0);
})().catch(e => {
  console.error('❌ Fatal:', e.message);
  process.exit(1);
});
