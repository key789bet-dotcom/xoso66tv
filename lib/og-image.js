/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ 🎨 OG IMAGE GENERATOR — Mục 23                                ║
 * ║                                                                ║
 * ║ Tạo ảnh OG (1200×630px chuẩn FB/Twitter/Telegram) động per:   ║
 * ║   - Trang chủ                                                  ║
 * ║   - Idol/BLV profile (avatar + name + status)                 ║
 * ║   - Match (đội nhà vs đội khách)                              ║
 * ║   - Default fallback                                           ║
 * ║                                                                ║
 * ║ Pipeline:                                                      ║
 * ║   SVG template → sharp render PNG → cache Redis 1h            ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
let sharp = null;
try { sharp = require('sharp'); }
catch (e) { console.warn('[OG] sharp not installed → OG images disabled'); }

const OG_W = 1200, OG_H = 630;
const BG = '#0a0d12';
const PRI = '#ff7a18';
const LIVE = '#ef4444';
const TEXT = '#ffffff';
const MUTED = '#94a3b8';

// ─── XML escape ───
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Truncate text if too long
function truncate(s, n) {
  s = String(s || '');
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

// ─── Templates ───

function svgHome() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a0d12"/>
        <stop offset="100%" stop-color="#1a1f29"/>
      </linearGradient>
      <linearGradient id="logo" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ff7a18"/>
        <stop offset="100%" stop-color="#ef4444"/>
      </linearGradient>
    </defs>
    <rect width="${OG_W}" height="${OG_H}" fill="url(#bg)"/>
    <circle cx="${OG_W/2}" cy="${OG_H/2 - 60}" r="180" fill="url(#logo)" opacity="0.15"/>
    <text x="${OG_W/2}" y="${OG_H/2 - 40}" fill="url(#logo)" font-family="Arial,sans-serif" font-size="120" font-weight="900" text-anchor="middle">XOSO66 TV</text>
    <text x="${OG_W/2}" y="${OG_H/2 + 40}" fill="${TEXT}" font-family="Arial,sans-serif" font-size="44" font-weight="bold" text-anchor="middle">Xem Trực Tiếp Thể Thao &amp; Esports</text>
    <text x="${OG_W/2}" y="${OG_H/2 + 100}" fill="${MUTED}" font-family="Arial,sans-serif" font-size="34" text-anchor="middle">Full HD 4K · Miễn Phí · 100+ Phòng Live</text>
    <rect x="${OG_W/2 - 200}" y="${OG_H - 90}" width="400" height="60" rx="30" fill="${PRI}"/>
    <text x="${OG_W/2}" y="${OG_H - 50}" fill="#fff" font-family="Arial,sans-serif" font-size="32" font-weight="900" text-anchor="middle">XEM NGAY →</text>
  </svg>`;
}

function svgIdol(opts) {
  // opts = { name, category, isLive, avatar (path local), tagline }
  const name = truncate(opts.name || 'XOSO66 TV Idol', 26);
  const tagline = truncate(opts.tagline || 'Live Streaming · X COIN · Giải thưởng', 60);
  const isLive = !!opts.isLive;
  const liveBadge = isLive
    ? `<rect x="80" y="80" width="200" height="56" rx="28" fill="${LIVE}"/>
       <circle cx="120" cy="108" r="10" fill="#fff"/>
       <text x="160" y="119" fill="#fff" font-family="Arial,sans-serif" font-size="28" font-weight="900">LIVE</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a0d12"/>
        <stop offset="50%" stop-color="#1a1f29"/>
        <stop offset="100%" stop-color="#0a0d12"/>
      </linearGradient>
      <radialGradient id="halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ff7a18" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#ff7a18" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${OG_W}" height="${OG_H}" fill="url(#bg)"/>
    <circle cx="300" cy="${OG_H/2}" r="280" fill="url(#halo)"/>
    ${liveBadge}
    <circle cx="300" cy="${OG_H/2}" r="180" fill="${PRI}" stroke="#fff" stroke-width="8"/>
    <text x="300" y="${OG_H/2 + 30}" fill="#fff" font-family="Arial,sans-serif" font-size="170" font-weight="900" text-anchor="middle">${esc(name.charAt(0).toUpperCase())}</text>
    <text x="560" y="280" fill="${TEXT}" font-family="Arial,sans-serif" font-size="74" font-weight="900">${esc(name)}</text>
    <text x="560" y="360" fill="${MUTED}" font-family="Arial,sans-serif" font-size="36">${esc(tagline)}</text>
    <text x="560" y="${OG_H - 80}" fill="${PRI}" font-family="Arial,sans-serif" font-size="36" font-weight="900">▶ xoso66tv.com</text>
  </svg>`;
}

function svgMatch(opts) {
  // opts = { home, away, league, time, status }
  const home = truncate(opts.home || 'Đội nhà', 18);
  const away = truncate(opts.away || 'Đội khách', 18);
  const league = truncate(opts.league || 'Bóng đá', 30);
  const status = opts.isLive ? '🔴 LIVE' : (opts.time || 'Sắp diễn ra');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f1a0f"/>
        <stop offset="100%" stop-color="#0a0d12"/>
      </linearGradient>
    </defs>
    <rect width="${OG_W}" height="${OG_H}" fill="url(#bg)"/>
    <!-- Pitch lines -->
    <line x1="${OG_W/2}" y1="0" x2="${OG_W/2}" y2="${OG_H}" stroke="${MUTED}" stroke-width="3" stroke-dasharray="20,15" opacity="0.3"/>
    <circle cx="${OG_W/2}" cy="${OG_H/2}" r="120" stroke="${MUTED}" stroke-width="3" fill="none" opacity="0.3"/>

    <!-- League name top -->
    <text x="${OG_W/2}" y="80" fill="${PRI}" font-family="Arial,sans-serif" font-size="32" font-weight="bold" text-anchor="middle">⚽ ${esc(league)}</text>

    <!-- Home team -->
    <circle cx="300" cy="${OG_H/2}" r="120" fill="#dc2626" stroke="#fff" stroke-width="6"/>
    <text x="300" y="${OG_H/2 + 18}" fill="#fff" font-family="Arial,sans-serif" font-size="100" font-weight="900" text-anchor="middle">${esc(home.charAt(0).toUpperCase())}</text>
    <text x="300" y="${OG_H/2 + 200}" fill="${TEXT}" font-family="Arial,sans-serif" font-size="44" font-weight="bold" text-anchor="middle">${esc(home)}</text>

    <!-- VS -->
    <text x="${OG_W/2}" y="${OG_H/2 + 30}" fill="${PRI}" font-family="Arial,sans-serif" font-size="90" font-weight="900" text-anchor="middle">VS</text>

    <!-- Away team -->
    <circle cx="900" cy="${OG_H/2}" r="120" fill="#2563eb" stroke="#fff" stroke-width="6"/>
    <text x="900" y="${OG_H/2 + 18}" fill="#fff" font-family="Arial,sans-serif" font-size="100" font-weight="900" text-anchor="middle">${esc(away.charAt(0).toUpperCase())}</text>
    <text x="900" y="${OG_H/2 + 200}" fill="${TEXT}" font-family="Arial,sans-serif" font-size="44" font-weight="bold" text-anchor="middle">${esc(away)}</text>

    <!-- Status -->
    <rect x="${OG_W/2 - 200}" y="${OG_H - 100}" width="400" height="60" rx="30" fill="${opts.isLive ? LIVE : PRI}"/>
    <text x="${OG_W/2}" y="${OG_H - 60}" fill="#fff" font-family="Arial,sans-serif" font-size="32" font-weight="900" text-anchor="middle">${esc(status)}</text>
  </svg>`;
}

// ─── Render SVG → PNG ───
async function render(svgString) {
  if (!sharp) throw new Error('sharp not available');
  const buf = await sharp(Buffer.from(svgString))
    .png({ quality: 85, compressionLevel: 9 })
    .toBuffer();
  return buf;
}

// ─── Cached generators ───
const _MEM_CACHE = new Map(); // key → { buf, expires }
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

async function _cached(key, generator) {
  const now = Date.now();
  // L1 memory
  const m = _MEM_CACHE.get(key);
  if (m && m.expires > now) return m.buf;
  // L2 redis
  try {
    const redis = require('./redis');
    if (redis.isReady && redis.isReady()) {
      const cached = await redis.get('og:' + key);
      if (cached) {
        // Cached as base64 in Redis
        const buf = Buffer.from(cached, 'base64');
        _MEM_CACHE.set(key, { buf, expires: now + 5 * 60 * 1000 });
        return buf;
      }
    }
  } catch (_) {}
  // Generate fresh
  const buf = await generator();
  _MEM_CACHE.set(key, { buf, expires: now + 5 * 60 * 1000 });
  try {
    const redis = require('./redis');
    if (redis.isReady && redis.isReady()) {
      await redis.set('og:' + key, buf.toString('base64'), Math.floor(CACHE_TTL_MS / 1000));
    }
  } catch (_) {}
  return buf;
}

async function getHome() {
  return _cached('home:v2', function(){ return render(svgHome()); });
}

async function getIdol(idolId) {
  if (!idolId) return getDefault();
  const db = require('./db');
  const data = db.load();
  const idol = (data.idols || []).find(function(i){ return i.id === idolId; })
            || (data.blvs  || []).find(function(b){ return b.id === idolId; });
  if (!idol) return getDefault();
  return _cached('idol:' + idolId + ':live=' + (idol.liveNow ? 1 : 0) + ':v2', function(){
    return render(svgIdol({
      name: idol.name || idol.username || idolId,
      isLive: !!idol.liveNow,
      tagline: idol.category === 'casino' ? 'Live sòng bài · X COIN' :
               idol.category === 'bongda' ? 'BLV bóng đá · Bình luận live' :
               idol.category === 'esport' ? 'BLV esports · Game hot' :
               'Idol show · Tặng quà X COIN'
    }));
  });
}

async function getMatch(opts) {
  if (!opts) return getDefault();
  const key = 'match:' + (opts.slug || opts.id || 'x') + ':v2';
  return _cached(key, function(){
    return render(svgMatch(opts));
  });
}

async function getDefault() {
  return _cached('default:v2', function(){ return render(svgHome()); });
}

// ─── Article OG image (cho bài /tin-tuc/:slug) ───
function svgArticle(opts) {
  const title = truncate(opts.title || 'Nhận định bóng đá', 100);
  const titleLines = [];
  // Word wrap thủ công ~40 char/line, max 3 lines
  const words = title.split(' ');
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).length > 40) {
      titleLines.push(line.trim()); line = w;
      if (titleLines.length >= 3) break;
    } else { line = line ? line + ' ' + w : w; }
  }
  if (line && titleLines.length < 3) titleLines.push(line.trim());

  const score = opts.predictedScore || '';
  const league = truncate(opts.league || '', 35);
  const author = truncate(opts.author || 'XOSO66 TV Analyst', 30);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#064e3b"/>
        <stop offset="50%" stop-color="#065f46"/>
        <stop offset="100%" stop-color="#047857"/>
      </linearGradient>
      <linearGradient id="overlay" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.6"/>
      </linearGradient>
    </defs>
    <rect width="${OG_W}" height="${OG_H}" fill="url(#bg)"/>
    <rect width="${OG_W}" height="${OG_H}" fill="url(#overlay)"/>
    <!-- Top badge -->
    <rect x="60" y="60" width="280" height="55" rx="8" fill="${PRI}"/>
    <text x="200" y="97" font-family="system-ui,-apple-system,Roboto,Arial" font-size="26" font-weight="900" fill="${TEXT}" text-anchor="middle">📰 NHẬN ĐỊNH BĐ</text>
    <!-- League badge -->
    ${league ? `
    <rect x="360" y="65" width="${Math.min(league.length * 17 + 40, 500)}" height="45" rx="22" fill="rgba(255,255,255,.18)"/>
    <text x="${380}" y="96" font-family="system-ui" font-size="24" font-weight="700" fill="${TEXT}">${esc('🏆 ' + league)}</text>
    ` : ''}
    <!-- Title -->
    ${titleLines.map((l, i) => `
    <text x="60" y="${260 + i * 75}" font-family="system-ui,-apple-system,Roboto,Arial" font-size="58" font-weight="900" fill="${TEXT}">${esc(l)}</text>
    `).join('')}
    <!-- Predicted score (if exists) -->
    ${score ? `
    <g transform="translate(900, 380)">
      <rect x="-160" y="-50" width="320" height="120" rx="16" fill="#facc15"/>
      <text x="0" y="-12" font-family="system-ui" font-size="22" font-weight="700" fill="#1a1a1a" text-anchor="middle">🎯 DỰ ĐOÁN</text>
      <text x="0" y="48" font-family="system-ui" font-size="62" font-weight="900" fill="#1a1a1a" text-anchor="middle">${esc(score)}</text>
    </g>
    ` : ''}
    <!-- Footer: author + brand -->
    <text x="60" y="555" font-family="system-ui" font-size="24" font-weight="600" fill="${MUTED}">🎤 ${esc(author)}</text>
    <text x="${OG_W - 60}" y="555" font-family="system-ui" font-size="32" font-weight="900" fill="${PRI}" text-anchor="end">XOSO66 TV</text>
    <text x="${OG_W - 60}" y="585" font-family="system-ui" font-size="18" font-weight="500" fill="${MUTED}" text-anchor="end">xoso66tv.com · Xem trực tiếp bóng đá HD</text>
  </svg>`;
}

async function getArticle(opts) {
  if (!opts) return getDefault();
  const key = 'article:' + (opts.slug || 'x') + ':v1';
  return _cached(key, function(){ return render(svgArticle(opts)); });
}

module.exports = { getHome, getIdol, getMatch, getArticle, getDefault };
