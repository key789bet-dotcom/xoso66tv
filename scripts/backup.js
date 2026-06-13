#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🛡️  DAILY BACKUP — Mục 28                                        ║
 * ║                                                                    ║
 * ║ Backup chiến lược 3 lớp:                                          ║
 * ║   Tier 1 — Local rotation: 7 daily + 4 weekly + 12 monthly        ║
 * ║   Tier 2 — Offsite (R2/S3): optional auto-upload                  ║
 * ║   Tier 3 — Sentry alert nếu backup quá 36h (qua /api/health)      ║
 * ║                                                                    ║
 * ║ Usage:                                                             ║
 * ║   node scripts/backup.js                  # backup + rotate       ║
 * ║   node scripts/backup.js --upload         # + upload R2           ║
 * ║   node scripts/backup.js --dry            # dry-run               ║
 * ║   node scripts/backup.js --tier=monthly   # force tier            ║
 * ║                                                                    ║
 * ║ ENV vars (.env):                                                   ║
 * ║   BACKUP_DIR=/var/backups/xoso66tv  (default)                     ║
 * ║   BACKUP_AUTO_UPLOAD=1              (auto upload sau backup)      ║
 * ║   R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com                 ║
 * ║   R2_ACCESS_KEY=...                                                ║
 * ║   R2_SECRET_KEY=...                                                ║
 * ║   R2_BUCKET=xoso66tv-backups                                       ║
 * ║   BACKUP_TELEGRAM_BOT=...   (optional alert)                       ║
 * ║   BACKUP_TELEGRAM_CHAT=...                                         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = process.env.BACKUP_DIR || '/var/backups/xoso66tv';

// Folders/files cần backup (relative to project root)
const SOURCES = ['data', 'uploads'];

// Files exclude (đã có suffix .json nhưng quá lớn / không cần)
const EXCLUDES = [
  'data/db.json.tmp',
  'data/*.bak',
  'uploads/.cache',
  'uploads/tmp',
];

// Rotation policy: số lượng file giữ lại mỗi tier
const ROTATION = {
  daily:   parseInt(process.env.BACKUP_KEEP_DAILY   || '7',  10),
  weekly:  parseInt(process.env.BACKUP_KEEP_WEEKLY  || '4',  10),
  monthly: parseInt(process.env.BACKUP_KEEP_MONTHLY || '12', 10),
};

// CLI flags
const DRY      = process.argv.includes('--dry');
const DO_UPLOAD= process.argv.includes('--upload') || process.env.BACKUP_AUTO_UPLOAD === '1';
const FORCE_TIER = (function(){
  const a = process.argv.find(function(x){ return x.startsWith('--tier='); });
  return a ? a.split('=')[1] : null;
})();

function log(msg) {
  const stamp = new Date().toISOString();
  console.log('[BACKUP ' + stamp + '] ' + msg);
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function pad(n) { return String(n).padStart(2, '0'); }
function nowStamp() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + '_' +
         pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

function detectTier() {
  if (FORCE_TIER && ['daily','weekly','monthly'].indexOf(FORCE_TIER) !== -1) return FORCE_TIER;
  const d = new Date();
  if (d.getDate() === 1) return 'monthly';
  if (d.getDay() === 0) return 'weekly';
  return 'daily';
}

function createBackup() {
  const tier = detectTier();
  const tierDir = path.join(BACKUP_DIR, tier);
  ensureDir(tierDir);

  const fname = 'backup_' + tier + '_' + nowStamp() + '.tar.gz';
  const fpath = path.join(tierDir, fname);

  log('Creating ' + tier.toUpperCase() + ' backup: ' + fname);

  // Verify sources exist
  const existingSrcs = SOURCES.filter(function(s) {
    const full = path.join(ROOT, s);
    if (!fs.existsSync(full)) { log('⚠️  skip missing: ' + s); return false; }
    return true;
  });
  if (existingSrcs.length === 0) {
    throw new Error('No source folders exist to backup');
  }

  if (DRY) {
    log('[DRY-RUN] tar -czf ' + fpath + ' ' + existingSrcs.join(' '));
    return { path: fpath, tier, size: 0, dry: true };
  }

  // Build tar arguments với exclude
  const args = ['-czf', fpath, '-C', ROOT];
  EXCLUDES.forEach(function(e){ args.push('--exclude=' + e); });
  existingSrcs.forEach(function(s){ args.push(s); });

  const r = spawnSync('tar', args, { stdio: 'pipe' });
  if (r.status !== 0) {
    const stderr = r.stderr ? r.stderr.toString() : '';
    throw new Error('tar failed (status=' + r.status + '): ' + stderr);
  }

  const stat = fs.statSync(fpath);
  log('✅ Backup created: ' + fpath);
  log('   size: ' + (stat.size/1024/1024).toFixed(2) + ' MB');

  return { path: fpath, tier, size: stat.size };
}

function rotate(tier) {
  const tierDir = path.join(BACKUP_DIR, tier);
  if (!fs.existsSync(tierDir)) return;
  const keep = ROTATION[tier] || 7;
  const files = fs.readdirSync(tierDir)
    .filter(function(f){ return f.endsWith('.tar.gz'); })
    .map(function(f){
      const fp = path.join(tierDir, f);
      return { name: f, path: fp, mtime: fs.statSync(fp).mtime.getTime() };
    })
    .sort(function(a, b){ return b.mtime - a.mtime; });

  const toDelete = files.slice(keep);
  if (toDelete.length === 0) return;
  toDelete.forEach(function(f){
    log('🗑️  Rotate: delete old ' + tier + ' → ' + f.name);
    if (!DRY) {
      try { fs.unlinkSync(f.path); }
      catch (e) { log('   ⚠️  delete fail: ' + e.message); }
    }
  });
}

async function uploadR2(filePath) {
  const ENDPOINT = process.env.R2_ENDPOINT;
  const KEY      = process.env.R2_ACCESS_KEY;
  const SECRET   = process.env.R2_SECRET_KEY;
  const BUCKET   = process.env.R2_BUCKET;

  if (!ENDPOINT || !KEY || !SECRET || !BUCKET) {
    log('⚠️  R2 env vars not set → skip offsite upload');
    return false;
  }

  let S3;
  try { S3 = require('@aws-sdk/client-s3'); }
  catch (e) {
    log('❌ @aws-sdk/client-s3 chưa cài. Run: npm install @aws-sdk/client-s3');
    return false;
  }

  log('☁️  Uploading to R2: ' + path.basename(filePath));

  try {
    const client = new S3.S3Client({
      region: 'auto',
      endpoint: ENDPOINT,
      credentials: { accessKeyId: KEY, secretAccessKey: SECRET }
    });
    const Key = 'xoso66tv/' + path.basename(filePath);
    const Body = fs.readFileSync(filePath);
    await client.send(new S3.PutObjectCommand({ Bucket: BUCKET, Key, Body }));
    log('✅ R2 uploaded: s3://' + BUCKET + '/' + Key);
    return true;
  } catch (e) {
    log('❌ R2 upload failed: ' + e.message);
    return false;
  }
}

function notifyTelegram(msg) {
  const BOT  = process.env.BACKUP_TELEGRAM_BOT;
  const CHAT = process.env.BACKUP_TELEGRAM_CHAT;
  if (!BOT || !CHAT) return Promise.resolve(false);
  return new Promise(function(resolve){
    const data = JSON.stringify({ chat_id: CHAT, text: msg, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: '/bot' + BOT + '/sendMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 5000
    }, function(res){ res.on('data', function(){}); res.on('end', function(){ resolve(res.statusCode===200); }); });
    req.on('error', function(){ resolve(false); });
    req.on('timeout', function(){ req.destroy(); resolve(false); });
    req.write(data); req.end();
  });
}

(async function main() {
  log('═══════════ Starting backup ═══════════');
  log('ROOT: ' + ROOT);
  log('BACKUP_DIR: ' + BACKUP_DIR);
  if (DRY) log('🧪 DRY-RUN mode');

  let info, uploaded = false;
  try {
    ensureDir(BACKUP_DIR);
    info = createBackup();

    rotate('daily');
    rotate('weekly');
    rotate('monthly');

    if (DO_UPLOAD && !info.dry) {
      uploaded = await uploadR2(info.path);
    }

    // Write last.json metadata
    if (!info.dry) {
      const meta = {
        timestamp: Date.now(),
        timestampISO: new Date().toISOString(),
        tier: info.tier,
        path: info.path,
        size: info.size,
        sizeMB: +(info.size/1024/1024).toFixed(2),
        uploaded
      };
      fs.writeFileSync(path.join(BACKUP_DIR, 'last.json'), JSON.stringify(meta, null, 2));
    }

    log('═══════════ ✅ Backup successful ═══════════');

    await notifyTelegram(
      '✅ <b>XOSO66 TV Backup OK</b>\n' +
      'Tier: <b>' + info.tier + '</b>\n' +
      'Size: ' + (info.size/1024/1024).toFixed(2) + ' MB\n' +
      'R2: ' + (uploaded ? '☁️ uploaded' : '🏠 local only')
    );

    process.exit(0);
  } catch (e) {
    log('❌ Backup FAILED: ' + e.message);
    console.error(e);
    await notifyTelegram(
      '🚨 <b>XOSO66 TV Backup FAILED</b>\n' +
      'Error: ' + (e.message || 'unknown')
    );
    process.exit(1);
  }
})();
