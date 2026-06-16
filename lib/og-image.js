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

// ─── Article OG image (cho bài /tin-tuc/:slug) - PRO LAYOUT v3 ───
// Layout: BG cam-đen + 2 team badges (composite logo thật) + VS/score + title + brand
function svgArticle(opts) {
  const title = truncate(opts.title || 'Nhận định bóng đá', 100);
  const titleLines = [];
  const words = title.split(' ');
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).length > 50) {
      titleLines.push(line.trim()); line = w;
      if (titleLines.length >= 2) break;
    } else { line = line ? line + ' ' + w : w; }
  }
  if (line && titleLines.length < 2) titleLines.push(line.trim());

  const score = opts.predictedScore || '';
  const league = truncate(opts.league || '', 28);
  const home = truncate(opts.home || 'Đội nhà', 18);
  const away = truncate(opts.away || 'Đội khách', 18);
  const author = truncate(opts.author || 'XOSO66 TV Analyst', 30);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a0d12"/>
        <stop offset="50%" stop-color="#1a1f29"/>
        <stop offset="100%" stop-color="#0a0d12"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${PRI}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${PRI}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${OG_W}" height="${OG_H}" fill="url(#bg)"/>
    <!-- Orange glow center -->
    <ellipse cx="${OG_W/2}" cy="280" rx="500" ry="200" fill="url(#glow)"/>
    <!-- Top accent line -->
    <rect x="0" y="0" width="${OG_W}" height="6" fill="${PRI}"/>
    <!-- Diagonal accent stripes (decoration) -->
    <g opacity="0.05">
      <rect x="-100" y="-100" width="120" height="900" fill="${PRI}" transform="rotate(20 0 0)"/>
      <rect x="${OG_W - 100}" y="-100" width="120" height="900" fill="${PRI}" transform="rotate(-20 ${OG_W} 0)"/>
    </g>

    <!-- Top-left: NHẬN ĐỊNH badge -->
    <rect x="50" y="40" width="240" height="50" rx="6" fill="${PRI}"/>
    <text x="170" y="74" font-family="system-ui,-apple-system,Arial" font-size="24" font-weight="900" fill="${TEXT}" text-anchor="middle">NHẬN ĐỊNH BÓNG ĐÁ</text>

    <!-- Top-right: League name -->
    ${league ? `
    <rect x="${OG_W - Math.min(league.length * 14 + 60, 540)}" y="40" width="${Math.min(league.length * 14 + 40, 520)}" height="50" rx="25" fill="rgba(255,122,24,.18)" stroke="${PRI}" stroke-width="1.5"/>
    <text x="${OG_W - 30}" y="73" font-family="system-ui,Arial" font-size="22" font-weight="800" fill="${PRI}" text-anchor="end">${esc(league.toUpperCase())}</text>
    ` : ''}

    <!-- CENTER: 2 team circles (white BG để logo composite lên trông pro) -->
    <!-- Home circle placeholder -->
    <circle cx="270" cy="280" r="115" fill="#ffffff" stroke="${PRI}" stroke-width="5"/>
    <circle cx="270" cy="280" r="108" fill="#f8fafc"/>
    <!-- Home name (dưới circle) -->
    <text x="270" y="445" font-family="system-ui,Arial" font-size="32" font-weight="800" fill="${TEXT}" text-anchor="middle">${esc(home)}</text>

    <!-- VS / SCORE giữa -->
    ${score ? `
    <g transform="translate(${OG_W/2}, 270)">
      <rect x="-110" y="-55" width="220" height="120" rx="14" fill="#facc15"/>
      <text x="0" y="-15" font-family="system-ui,Arial" font-size="18" font-weight="800" fill="#1a1a1a" text-anchor="middle">DỰ ĐOÁN</text>
      <text x="0" y="48" font-family="system-ui,Arial" font-size="64" font-weight="900" fill="#1a1a1a" text-anchor="middle">${esc(score)}</text>
    </g>
    ` : `
    <text x="${OG_W/2}" y="295" font-family="system-ui,Arial" font-size="108" font-weight="900" fill="${PRI}" text-anchor="middle">VS</text>
    `}

    <!-- Away circle placeholder -->
    <circle cx="930" cy="280" r="115" fill="#ffffff" stroke="${PRI}" stroke-width="5"/>
    <circle cx="930" cy="280" r="108" fill="#f8fafc"/>
    <!-- Away name -->
    <text x="930" y="445" font-family="system-ui,Arial" font-size="32" font-weight="800" fill="${TEXT}" text-anchor="middle">${esc(away)}</text>

    <!-- Title (1-2 lines, gần đáy) -->
    ${titleLines.map((l, i) => `
    <text x="${OG_W/2}" y="${500 + i * 42}" font-family="system-ui,Arial" font-size="${titleLines.length > 1 ? 28 : 32}" font-weight="700" fill="${TEXT}" text-anchor="middle">${esc(l)}</text>
    `).join('')}

    <!-- Footer divider -->
    <rect x="50" y="585" width="${OG_W - 100}" height="1" fill="${MUTED}" opacity="0.3"/>
    <!-- Footer: author + brand -->
    <text x="50" y="615" font-family="system-ui,Arial" font-size="20" font-weight="600" fill="${MUTED}">${esc(author)}</text>
    <text x="${OG_W - 50}" y="613" font-family="system-ui,Arial" font-size="28" font-weight="900" fill="${PRI}" text-anchor="end">XOSO66 TV</text>
    <text x="${OG_W - 50}" y="618" font-family="system-ui,Arial" font-size="14" font-weight="500" fill="${MUTED}" text-anchor="end" dy="20">xoso66tv.com</text>
  </svg>`;
}

// ─── Fetch external image (logo team từ api-sports CDN) với timeout ───
function fetchImageBuf(url, timeoutMs) {
  timeoutMs = timeoutMs || 3500;
  return new Promise(function(resolve){
    if (!url) return resolve(null);
    try {
      var lib = url.startsWith('https') ? require('https') : require('http');
      var req = lib.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'Mozilla/5.0 (XOSO66TV bot)' } }, function(res){
        if (res.statusCode !== 200) { res.resume(); return resolve(null); }
        var chunks = [];
        res.on('data', function(c){ chunks.push(c); });
        res.on('end', function(){ resolve(Buffer.concat(chunks)); });
        res.on('error', function(){ resolve(null); });
      });
      req.on('error', function(){ resolve(null); });
      req.on('timeout', function(){ req.destroy(); resolve(null); });
    } catch(e) { resolve(null); }
  });
}

// ─── Resize logo về 200×200 contain (giữ trong suốt) ───
async function resizeBadge(buf, size) {
  size = size || 200;
  try {
    return await sharp(buf).resize(size, size, { fit: 'inside', background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer();
  } catch(e) { return null; }
}

async function getArticle(opts) {
  if (!opts) return getDefault();
  // Cache key v3 (invalidate cache cũ)
  const key = 'article:' + (opts.slug || 'x') + ':v3';
  return _cached(key, async function(){
    if (!sharp) throw new Error('sharp not available');
    const svg = svgArticle(opts);
    // Fetch + composite logos (song song, không block lẫn nhau)
    const [homeBuf, awayBuf, leagueBuf] = await Promise.all([
      fetchImageBuf(opts.homeBadge),
      fetchImageBuf(opts.awayBadge),
      fetchImageBuf(opts.leagueLogo)
    ]);
    const composites = [];
    if (homeBuf) {
      const r = await resizeBadge(homeBuf, 195);
      if (r) composites.push({ input: r, top: 280 - 97, left: 270 - 97 });
    }
    if (awayBuf) {
      const r = await resizeBadge(awayBuf, 195);
      if (r) composites.push({ input: r, top: 280 - 97, left: 930 - 97 });
    }
    // League logo top-right small (40×40)
    if (leagueBuf) {
      const r = await resizeBadge(leagueBuf, 36);
      if (r) composites.push({ input: r, top: 47, left: OG_W - 580 });
    }
    return await sharp(Buffer.from(svg)).composite(composites).png({ quality: 85, compressionLevel: 9 }).toBuffer();
  });
}

module.exports = { getHome, getIdol, getMatch, getArticle, getDefault };
