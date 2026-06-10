#!/usr/bin/env node
/**
 * Khởi tạo data/db.json với admin + yennhi (idol thật).
 *
 * Cách chạy:
 *   cd /var/www/xoso66tv
 *   node scripts/init-db.js
 *
 * Mặc định:
 *   - admin / Baohan@04072023  (role=admin, bypass mọi lock)
 *   - yennhi / 123456789       (role=idol, có thể lên sóng)
 *
 * Override:
 *   ADMIN_PASS=xxx YENNHI_PASS=yyy node scripts/init-db.js
 *
 * An toàn:
 *   - Nếu db.json đã tồn tại → BACKUP sang db.json.before-init-<timestamp>
 *   - Không bao giờ overwrite mà không backup
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');

const ADMIN_USER   = process.env.ADMIN_USER   || 'admin';
const ADMIN_PASS   = process.env.ADMIN_PASS   || 'Baohan@04072023';
const YENNHI_USER  = process.env.YENNHI_USER  || 'yennhi';
const YENNHI_PASS  = process.env.YENNHI_PASS  || '123456789';

console.log('🔧 init-db.js - Khởi tạo DB sạch');
console.log('   ADMIN_USER:', ADMIN_USER);
console.log('   YENNHI_USER:', YENNHI_USER);

// 1) Backup db.json hiện tại nếu có
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (fs.existsSync(DB_FILE)) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(DATA_DIR, 'db.json.before-init-' + ts);
  fs.copyFileSync(DB_FILE, backupPath);
  console.log('📦 Backup db.json cũ:', path.basename(backupPath));
}

// 2) Hash bcrypt 2 password
console.log('🔐 Đang hash bcrypt password...');
const adminHash  = bcrypt.hashSync(ADMIN_PASS, 10);
const yennhiHash = bcrypt.hashSync(YENNHI_PASS, 10);
console.log('   ✅ admin hash:', adminHash.substring(0, 20) + '...');
console.log('   ✅ yennhi hash:', yennhiHash.substring(0, 20) + '...');

// 3) Build DB sạch
const now = Date.now();
const db = {
  users: [
    {
      id: 'u_admin',
      username: ADMIN_USER,
      fullname: 'Administrator',
      role: 'admin',
      passwordHash: adminHash,
      phone: '',
      email: '',
      vip: 5,
      balance: 0,
      coin: 0,
      status: 'active',
      joinedAt: now
    },
    {
      id: 'u_yennhi',
      username: YENNHI_USER,
      fullname: 'Yến Nhi',
      role: 'idol',
      passwordHash: yennhiHash,
      phone: '',
      email: '',
      vip: 1,
      balance: 0,
      coin: 0,
      status: 'active',
      joinedAt: now
    }
  ],
  blvs: [],
  idols: [
    {
      id: 'i_yennhi',
      name: 'Yến Nhi',
      userId: 'yennhi',          // ⚠️ MATCH bằng username (lowercase) - detectRole() so sánh username
      username: 'yennhi',
      avatar: 'https://i.pravatar.cc/200?img=44',
      cardImage: '',
      age: 22,
      viewers: 0,
      status: 'active',
      liveNow: false,            // mặc định KHÔNG live (idol bật khi push OBS)
      canLive: true,             // ✅ đã được admin cấp quyền lên sóng
      category: 'idol',          // mặc định Idol Live Show
      quality: '720p',
      totalStreams: 0,
      registeredAt: now,
      // 🆕 Full profile fields - tránh template crash khi render /idol/:id
      room: 'Phòng riêng Yến Nhi',
      lock: 0,                   // 0 = FREE, > 0 = X COIN để mở khóa
      color: 320,                // HSL hue cho gradient avatar
      emoji: '🌸',
      height: '1m65',
      weight: '48kg',
      city: 'Sài Gòn',
      job: 'Idol streamer XOSO66',
      hobby: 'Hát, dance cover, chat tâm sự với fan',
      bio: 'Xin chào mọi người, mình là Yến Nhi. Mỗi tối live show 8h-11h, đừng quên ghé phòng ủng hộ mình nha! 💕'
    }
  ],
  obs: [],
  auditLog: [
    {
      id: 'a_init',
      at: now,
      action: 'INIT DB - tạo admin + yennhi',
      target: 'system',
      by: 'init-db.js'
    }
  ]
};

// 4) Ghi file
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log('💾 Đã ghi:', DB_FILE);

// 5) Verify
console.log('\n✅ DONE! DB hiện tại:');
console.log('   Users:', db.users.length, '→', db.users.map(u => u.username + '(' + u.role + ')').join(', '));
console.log('   Idols:', db.idols.length, '→', db.idols.map(i => i.name + '(canLive=' + i.canLive + ')').join(', '));
console.log('   BLVs:', db.blvs.length);
console.log('\n🔑 Thông tin đăng nhập:');
console.log('   👑 Admin  → username: ' + ADMIN_USER + '  | password: ' + ADMIN_PASS);
console.log('   🎤 Yennhi → username: ' + YENNHI_USER + ' | password: ' + YENNHI_PASS);
console.log('\n⚠️  LƯU Ý:');
console.log('   - Restart PM2 để áp dụng: pm2 restart xoso66tv');
console.log('   - Admin login KHÔNG dùng passwordHash trong DB,');
console.log('     mà dùng env ADMIN_PASS. Cần set trong ecosystem.config.js:');
console.log('       env: { ADMIN_PASS: "' + ADMIN_PASS + '" }');
