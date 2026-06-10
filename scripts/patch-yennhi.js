#!/usr/bin/env node
/**
 * Patch yennhi idol record - thêm các field profile thiếu (bio, room, color, ...)
 * KHÔNG đụng password, KHÔNG xóa users.
 *
 * Chạy: cd /var/www/xoso66tv && node scripts/patch-yennhi.js
 */
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');
const DB_BACKUP = DB_FILE + '.before-patch-yennhi-' + Date.now();

console.log('🔧 patch-yennhi.js');
console.log('   DB file:', DB_FILE);

// Backup
fs.copyFileSync(DB_FILE, DB_BACKUP);
console.log('📦 Backup:', path.basename(DB_BACKUP));

// Load
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// Tìm yennhi idol
const yennhi = (db.idols || []).find(i => i.id === 'i_yennhi' || i.username === 'yennhi' || (i.name || '').toLowerCase().includes('yến nhi') || (i.name || '').toLowerCase().includes('yen nhi'));

if (!yennhi) {
  console.error('❌ Không tìm thấy yennhi trong db.idols!');
  console.error('   Hiện có:', db.idols.map(i => i.name).join(', '));
  process.exit(1);
}

console.log('✅ Tìm thấy idol:', yennhi.name, '(id:', yennhi.id + ')');

// Patch các field còn thiếu (KHÔNG overwrite nếu đã có)
const patches = {
  room: 'Phòng riêng Yến Nhi',
  lock: 0,
  color: 320,
  emoji: '🌸',
  age: 22,
  height: '1m65',
  weight: '48kg',
  city: 'Sài Gòn',
  job: 'Idol streamer XOSO66',
  hobby: 'Hát, dance cover, chat tâm sự với fan',
  bio: 'Xin chào mọi người, mình là Yến Nhi. Mỗi tối live show 8h-11h, đừng quên ghé phòng ủng hộ mình nha! 💕',
  category: yennhi.category || 'idol',
  quality: yennhi.quality || '720p',
  canLive: true   // ép chắc chắn cho phép lên sóng
};

let added = 0;
Object.keys(patches).forEach(k => {
  if (yennhi[k] == null || yennhi[k] === '') {
    yennhi[k] = patches[k];
    added++;
    console.log('   + thêm field:', k, '=', JSON.stringify(patches[k]));
  } else {
    console.log('   - giữ nguyên:', k, '=', JSON.stringify(yennhi[k]));
  }
});

console.log('\n📝 Đã thêm', added, 'field mới');

// Audit log
db.auditLog = db.auditLog || [];
db.auditLog.unshift({
  id: 'a_' + Math.random().toString(36).slice(2, 10),
  at: Date.now(),
  action: 'PATCH yennhi profile (thêm ' + added + ' field)',
  target: yennhi.id,
  by: 'patch-yennhi.js'
});

// Save
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log('💾 Đã ghi:', DB_FILE);

console.log('\n✅ DONE! Yennhi profile hiện tại:');
console.log('   ' + JSON.stringify(yennhi, null, 2).split('\n').join('\n   '));
console.log('\n⚠️  KHÔNG cần restart PM2 - db.json load mỗi request.');
console.log('   Truy cập /idol/' + yennhi.id + ' để test.');
