#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🔄 RESTORE — Khôi phục data từ backup                            ║
 * ║                                                                    ║
 * ║ Usage:                                                             ║
 * ║   node scripts/restore.js list                  # list backups    ║
 * ║   node scripts/restore.js latest                # restore newest  ║
 * ║   node scripts/restore.js restore <filename>    # restore by name ║
 * ║                                                                    ║
 * ║ AN TOÀN: trước khi restore, tự động tạo snapshot data hiện tại    ║
 * ║ vào _safety_before_restore_*.tar.gz để có thể rollback.           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = process.env.BACKUP_DIR || '/var/backups/xoso66tv';

function listBackups() {
  const all = [];
  ['daily', 'weekly', 'monthly'].forEach(function(tier) {
    const dir = path.join(BACKUP_DIR, tier);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(function(f){ return f.endsWith('.tar.gz'); }).forEach(function(f) {
      const fp = path.join(dir, f);
      try {
        const st = fs.statSync(fp);
        all.push({ name: f, path: fp, tier, mtime: st.mtime, size: st.size });
      } catch (_) {}
    });
  });
  return all.sort(function(a, b){ return b.mtime - a.mtime; });
}

function fmtSize(b) { return (b.size / 1024 / 1024).toFixed(2) + ' MB'; }

function confirm(q) {
  return new Promise(function(resolve){
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q + ' (gõ YES để xác nhận): ', function(ans){
      rl.close(); resolve(ans.trim() === 'YES');
    });
  });
}

async function restore(backupPath) {
  console.log('');
  console.log('🛡️  STEP 1/2: Tạo safety snapshot...');
  const stamp = Date.now();
  const safetyDir = path.join(BACKUP_DIR, 'safety');
  if (!fs.existsSync(safetyDir)) fs.mkdirSync(safetyDir, { recursive: true });
  const safetyPath = path.join(safetyDir, '_before_restore_' + stamp + '.tar.gz');

  const r0 = spawnSync('tar', ['-czf', safetyPath, '-C', ROOT, 'data', 'uploads'], { stdio: 'pipe' });
  if (r0.status !== 0) {
    console.error('❌ Safety snapshot failed:', r0.stderr.toString());
    process.exit(1);
  }
  console.log('   ✅ Snapshot saved: ' + safetyPath);

  console.log('');
  console.log('🔄 STEP 2/2: Extract backup...');
  const r1 = spawnSync('tar', ['-xzf', backupPath, '-C', ROOT], { stdio: 'inherit' });
  if (r1.status !== 0) {
    console.error('❌ Restore failed');
    console.error('💡 Rollback bằng: tar -xzf ' + safetyPath + ' -C ' + ROOT);
    process.exit(1);
  }
  console.log('   ✅ Extracted to ' + ROOT);
  console.log('');
  console.log('═══════════ ✅ RESTORE COMPLETED ═══════════');
  console.log('Bước tiếp theo:');
  console.log('   pm2 reload xoso66tv');
  console.log('');
  console.log('Nếu phát hiện sai → rollback:');
  console.log('   tar -xzf ' + safetyPath + ' -C ' + ROOT);
  console.log('   pm2 reload xoso66tv');
}

(async function main() {
  const cmd = process.argv[2];

  if (!cmd || cmd === 'list') {
    const all = listBackups();
    if (all.length === 0) {
      console.log('📭 No backups found in ' + BACKUP_DIR);
      return;
    }
    console.log('');
    console.log('📂 Available backups (' + all.length + '):');
    console.log('═══════════════════════════════════════════════════════════════');
    all.forEach(function(b, i) {
      console.log(
        String(i+1).padStart(3) + '. [' + b.tier.padEnd(7) + '] ' +
        b.name + '  (' + fmtSize(b) + ')  ' + b.mtime.toISOString()
      );
    });
    console.log('');
    console.log('Để khôi phục:');
    console.log('   node scripts/restore.js latest');
    console.log('   node scripts/restore.js restore <filename>');
    return;
  }

  if (cmd === 'latest') {
    const all = listBackups();
    if (all.length === 0) { console.log('No backups available'); process.exit(1); }
    const latest = all[0];
    console.log('🎯 Latest backup: ' + latest.name + ' (' + fmtSize(latest) + ')');
    const ok = await confirm('⚠️  Sẽ GHI ĐÈ data/ và uploads/ hiện tại. Tiếp tục?');
    if (!ok) { console.log('❌ Cancelled'); return; }
    await restore(latest.path);
    return;
  }

  if (cmd === 'restore') {
    const name = process.argv[3];
    if (!name) { console.log('Usage: node scripts/restore.js restore <filename>'); process.exit(1); }
    const all = listBackups();
    const found = all.find(function(b){ return b.name === name; });
    if (!found) { console.log('❌ Backup not found: ' + name); process.exit(1); }
    console.log('🎯 Backup: ' + found.name + ' (' + fmtSize(found) + ')');
    const ok = await confirm('⚠️  Sẽ GHI ĐÈ data/ và uploads/ hiện tại. Tiếp tục?');
    if (!ok) { console.log('❌ Cancelled'); return; }
    await restore(found.path);
    return;
  }

  console.log('Usage:');
  console.log('  node scripts/restore.js list                  # liệt kê backup');
  console.log('  node scripts/restore.js latest                # khôi phục bản mới nhất');
  console.log('  node scripts/restore.js restore <filename>    # khôi phục theo tên');
  process.exit(1);
})();
