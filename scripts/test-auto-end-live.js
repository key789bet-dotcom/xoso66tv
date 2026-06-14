#!/usr/bin/env node
/**
 * Script test auto-end live
 *
 * Chạy:  node scripts/test-auto-end-live.js [username?]
 *
 * Tự load .env để dùng ĐÚNG DB backend (MySQL relational) như server.
 * Force expire 1 schedule approved → trigger tick → verify status='ended'.
 */
require('dotenv').config();

const path = require('path');
const ROOT = path.join(__dirname, '..');
const db = require(path.join(ROOT, 'lib', 'db'));
const autoEnd = require(path.join(ROOT, 'lib', 'auto-end-scheduled-live'));

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST AUTO-END SCHEDULED LIVE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Init DB nếu cần (MySQL relational dùng async init)
  if (typeof db.initAsync === 'function') {
    console.log('→ Init DB async...');
    await db.initAsync();
  }

  const targetUsername = process.argv[2];   // optional
  const scheduleStore = require(path.join(ROOT, 'lib', 'schedule-store'));
  const all = scheduleStore.listAll({ limit: 500 });
  const approved = all.filter(s => s.status === 'approved');

  console.log('Tổng schedules:', all.length);
  console.log('Approved:', approved.length);
  console.log('Ended:', all.filter(s => s.status === 'ended').length);

  let target;
  if (targetUsername) {
    target = approved.find(s => s.username.toLowerCase() === targetUsername.toLowerCase());
    if (!target) {
      console.log('❌ Không có schedule approved của username:', targetUsername);
      console.log('   List approved:', approved.map(s => s.username).join(', ') || '(none)');
      process.exit(1);
    }
  } else {
    target = approved[0];
  }
  if (!target) {
    console.log('❌ Không có schedule approved nào. Tạo + duyệt schedule trước rồi test lại.');
    process.exit(1);
  }

  console.log('');
  console.log('🎯 Target schedule:');
  console.log('  id:', target.id);
  console.log('  user:', target.username, '(' + target.userType + ')');
  console.log('  startTime:', new Date(target.startTime).toLocaleString('vi-VN'));
  console.log('  endTime (cũ):', new Date(target.endTime).toLocaleString('vi-VN'));

  // Force expire bằng cách ghi trực tiếp vào file schedules.json
  const fs = require('fs');
  const SCHED_FILE = path.join(ROOT, 'data', 'schedules.json');
  const raw = JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8'));
  const idx = raw.findIndex(s => s.id === target.id);
  raw[idx].endTime = Date.now() - 10 * 60 * 1000;
  fs.writeFileSync(SCHED_FILE, JSON.stringify(raw, null, 2));
  console.log('  endTime (mới):', new Date(raw[idx].endTime).toLocaleString('vi-VN'), '← FORCED EXPIRE');

  console.log('');
  console.log('→ Trigger tick() ngay (không đợi cron 30s)...');
  const result = await autoEnd.tick();
  console.log('  Result:', JSON.stringify(result));

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  // Verify
  const d2 = db.load();
  const after = scheduleStore.findById(target.id);
  if (!after) {
    console.log('❌ Schedule biến mất sau tick (bug)');
  } else {
    console.log('VERIFY schedule sau tick:');
    console.log('  status:', after.status, after.status === 'ended' ? '✅' : '❌ phải là ended');
    console.log('  endedAt:', after.endedAt ? new Date(after.endedAt).toLocaleString('vi-VN') : '(null)');
    console.log('  endReason:', after.endReason);
    console.log('  kicked OBS:', after.kicked === true ? '✅ Có' : '⚠️  Không (có thể vì OBS không đang push)');

    // Check user liveNow
    const collection = after.userType === 'blv' ? (d2.blvs || []) : (d2.idols || []);
    const user = collection.find(x =>
      (x.username || '').toLowerCase() === after.username ||
      (x.slug || '').toLowerCase() === after.username ||
      (x.id || '').toLowerCase() === after.username.toLowerCase()
    );
    if (user) {
      console.log('  ' + after.userType + '.liveNow:', user.liveNow === false ? '✅ false' : '❌ vẫn ' + user.liveNow);
      console.log('  ' + after.userType + '.streamKey:', user.streamKey ? '✅ rotated → ' + user.streamKey.slice(0,16) + '...' : '⚠️ không có');
    } else {
      console.log('  ⚠️ Không tìm thấy user record cho', after.username);
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  process.exit(0);
}

main().catch(e => {
  console.error('💥 Test failed:', e);
  process.exit(1);
});
