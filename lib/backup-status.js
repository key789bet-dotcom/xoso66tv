/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ BACKUP STATUS — Đọc trạng thái backup gần nhất                ║
 * ║                                                                ║
 * ║ Dùng cho:                                                      ║
 * ║   - /api/health (alert nếu backup quá 36h)                    ║
 * ║   - /admin/backup (xem danh sách backup)                       ║
 * ║   - Sentry alert tự động                                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = process.env.BACKUP_DIR || '/var/backups/xoso66tv';
const STALE_HOURS = parseInt(process.env.BACKUP_STALE_HOURS || '36', 10);

function getLastBackup() {
  const meta = path.join(BACKUP_DIR, 'last.json');
  if (!fs.existsSync(meta)) return null;
  try { return JSON.parse(fs.readFileSync(meta, 'utf8')); }
  catch (e) { return null; }
}

function getBackupHealth() {
  const last = getLastBackup();
  if (!last) return { ok: false, reason: 'no_backup_yet', stale_hours_limit: STALE_HOURS };
  const age = Date.now() - last.timestamp;
  const hours = Math.floor(age / 3600000);
  const minutes = Math.floor(age / 60000);
  if (hours > STALE_HOURS) {
    return { ok: false, reason: 'stale', hours, minutes, last, stale_hours_limit: STALE_HOURS };
  }
  return {
    ok: true,
    hours, minutes,
    sizeMB: last.size ? +(last.size/1024/1024).toFixed(2) : null,
    tier: last.tier,
    uploaded: !!last.uploaded
  };
}

function listAllBackups() {
  const all = [];
  ['daily', 'weekly', 'monthly'].forEach(function(tier) {
    const dir = path.join(BACKUP_DIR, tier);
    if (!fs.existsSync(dir)) return;
    try {
      fs.readdirSync(dir).filter(function(f){ return f.endsWith('.tar.gz'); }).forEach(function(f) {
        const fp = path.join(dir, f);
        try {
          const st = fs.statSync(fp);
          all.push({
            name: f, path: fp, tier,
            sizeMB: +(st.size/1024/1024).toFixed(2),
            mtime: st.mtime.toISOString(),
            mtimeMs: st.mtime.getTime()
          });
        } catch (_) {}
      });
    } catch (_) {}
  });
  all.sort(function(a, b) { return b.mtimeMs - a.mtimeMs; });
  return all;
}

module.exports = { getLastBackup, getBackupHealth, listAllBackups, BACKUP_DIR };
