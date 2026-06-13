/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ SITEMAP GENERATOR — Mục 24                                    ║
 * ║                                                                ║
 * ║ Generate sitemap.xml động từ:                                  ║
 * ║   1. Static pages (home, lich, su-kien, ...)                  ║
 * ║   2. Live matches từ API (api.thethaoviet.vip)                ║
 * ║   3. Idols + BLVs từ DB                                        ║
 * ║   4. Tin tức/AI articles từ data/news.json                    ║
 * ║                                                                ║
 * ║ Cache 6 giờ trong Redis hoặc memory.                          ║
 * ║                                                                ║
 * ║ Sitemap chuẩn Google: <100,000 URLs/file, <50MB.              ║
 * ║ Nếu vượt → split thành sitemap-index.xml                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const SITE_URL = process.env.SITE_URL || 'https://xoso66tv.com';
const CACHE_TTL_S = parseInt(process.env.SITEMAP_CACHE_S || '21600', 10); // 6 giờ

let _memoryCache = null;
let _memoryCacheExpires = 0;

function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(loc, opts) {
  opts = opts || {};
  const lastmod = opts.lastmod ? new Date(opts.lastmod).toISOString() : new Date().toISOString();
  const changefreq = opts.changefreq || 'daily';
  const priority  = opts.priority || '0.5';
  return '  <url>\n' +
         '    <loc>' + escape(loc) + '</loc>\n' +
         '    <lastmod>' + lastmod + '</lastmod>\n' +
         '    <changefreq>' + changefreq + '</changefreq>\n' +
         '    <priority>' + priority + '</priority>\n' +
         '  </url>';
}

// ═══ Static pages — luôn có ═══
function getStaticUrls() {
  return [
    urlEntry(SITE_URL + '/',                    { priority: '1.0', changefreq: 'hourly' }),
    urlEntry(SITE_URL + '/lich-phat-song',      { priority: '0.9', changefreq: 'hourly' }),
    urlEntry(SITE_URL + '/su-kien',             { priority: '0.8', changefreq: 'daily' }),
    urlEntry(SITE_URL + '/qua-tang',            { priority: '0.7', changefreq: 'weekly' }),
    urlEntry(SITE_URL + '/idol-live',           { priority: '0.9', changefreq: 'hourly' }),
    urlEntry(SITE_URL + '/casino',              { priority: '0.7', changefreq: 'daily' }),
    urlEntry(SITE_URL + '/tin-tuc',             { priority: '0.8', changefreq: 'hourly' }),
    urlEntry(SITE_URL + '/the-thao/bong-da',    { priority: '0.8', changefreq: 'hourly' }),
    urlEntry(SITE_URL + '/the-thao/bong-ro',    { priority: '0.6', changefreq: 'daily' }),
    urlEntry(SITE_URL + '/the-thao/tennis',     { priority: '0.6', changefreq: 'daily' }),
    urlEntry(SITE_URL + '/the-thao/bong-chuyen',{ priority: '0.5', changefreq: 'daily' }),
    urlEntry(SITE_URL + '/the-thao/bong-ban',   { priority: '0.5', changefreq: 'daily' }),
    urlEntry(SITE_URL + '/esports',             { priority: '0.6', changefreq: 'daily' }),
    urlEntry(SITE_URL + '/gioi-thieu',          { priority: '0.4', changefreq: 'monthly' }),
    urlEntry(SITE_URL + '/lien-he',             { priority: '0.4', changefreq: 'monthly' }),
    urlEntry(SITE_URL + '/chinh-sach-bao-mat',  { priority: '0.3', changefreq: 'monthly' }),
    urlEntry(SITE_URL + '/dieu-khoan-su-dung',  { priority: '0.3', changefreq: 'monthly' }),
    urlEntry(SITE_URL + '/thoa-thuan-phat-song',{ priority: '0.3', changefreq: 'monthly' })
  ];
}

// ═══ Live matches từ API ═══
async function getLiveMatchUrls() {
  try {
    const api = require('./api');
    const live = await api.getLiveStreams();
    const upcoming = await api.getUpcomingStreams(null, 30);
    const matches = [].concat(live || [], upcoming || []);
    return matches
      .filter(function(m){ return m && (m.slug || m.id); })
      .slice(0, 200) // giới hạn 200 trận để không bloat sitemap
      .map(function(m) {
        const slug = m.slug || m.id;
        return urlEntry(SITE_URL + '/live/' + encodeURIComponent(slug), {
          priority: '0.7',
          changefreq: 'hourly',
          lastmod: m.updatedAt || m.startTime || Date.now()
        });
      });
  } catch (e) {
    console.warn('[SITEMAP] getLiveMatchUrls fail:', e.message);
    return [];
  }
}

// ═══ Idol + BLV profile URLs từ DB ═══
function getStreamerUrls() {
  try {
    const db = require('./db');
    const data = db.load();
    const urls = [];

    (data.idols || []).forEach(function(idol) {
      if (idol.status !== 'active') return;
      urls.push(urlEntry(SITE_URL + '/idol/' + encodeURIComponent(idol.id), {
        priority: idol.liveNow ? '0.9' : '0.6',
        changefreq: 'hourly',
        lastmod: idol.updatedAt || Date.now()
      }));
    });

    (data.blvs || []).forEach(function(blv) {
      if (blv.status !== 'active') return;
      urls.push(urlEntry(SITE_URL + '/live/' + encodeURIComponent(blv.id), {
        priority: blv.liveNow ? '0.9' : '0.5',
        changefreq: 'hourly',
        lastmod: blv.updatedAt || Date.now()
      }));
    });

    return urls;
  } catch (e) {
    console.warn('[SITEMAP] getStreamerUrls fail:', e.message);
    return [];
  }
}

// ═══ News articles ═══
function getNewsUrls() {
  try {
    const fs = require('fs');
    const path = require('path');
    const newsFile = path.join(__dirname, '..', 'data', 'news.json');
    if (!fs.existsSync(newsFile)) return [];
    const news = JSON.parse(fs.readFileSync(newsFile, 'utf8'));
    if (!Array.isArray(news)) return [];
    return news
      .filter(function(n){ return n && n.slug; })
      .slice(0, 500)
      .map(function(n) {
        return urlEntry(SITE_URL + '/tin-tuc/' + encodeURIComponent(n.slug), {
          priority: '0.6',
          changefreq: 'weekly',
          lastmod: n.publishedAt || n.createdAt || Date.now()
        });
      });
  } catch (e) {
    console.warn('[SITEMAP] getNewsUrls fail:', e.message);
    return [];
  }
}

// ═══ Build full sitemap XML ═══
async function buildSitemapXml() {
  const urls = []
    .concat(getStaticUrls())
    .concat(await getLiveMatchUrls())
    .concat(getStreamerUrls())
    .concat(getNewsUrls());

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
         '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
         urls.join('\n') + '\n' +
         '</urlset>\n';
}

// ═══ Cached entry point ═══
async function getSitemap() {
  const now = Date.now();

  // L1: Memory cache (fastest)
  if (_memoryCache && _memoryCacheExpires > now) {
    return { xml: _memoryCache, fromCache: 'memory' };
  }

  // L2: Redis cache (shared between workers)
  try {
    const redis = require('./redis');
    if (redis.isReady && redis.isReady()) {
      const cached = await redis.get('sitemap:xml');
      if (cached && typeof cached === 'string') {
        _memoryCache = cached;
        _memoryCacheExpires = now + 60000; // 1 phút memory cache
        return { xml: cached, fromCache: 'redis' };
      }
    }
  } catch (_) {}

  // L3: Generate fresh
  console.log('[SITEMAP] 🔄 Generating fresh sitemap...');
  const t0 = Date.now();
  const xml = await buildSitemapXml();
  const dur = Date.now() - t0;
  console.log('[SITEMAP] ✅ Generated in ' + dur + 'ms (' + Math.round(xml.length/1024) + ' KB)');

  // Cache results
  _memoryCache = xml;
  _memoryCacheExpires = now + 60000;
  try {
    const redis = require('./redis');
    if (redis.isReady && redis.isReady()) {
      await redis.set('sitemap:xml', xml, CACHE_TTL_S);
    }
  } catch (_) {}

  return { xml: xml, fromCache: 'fresh' };
}

// ═══ Force regenerate (cho cron 6h hoặc admin trigger) ═══
async function regenerate() {
  _memoryCache = null;
  _memoryCacheExpires = 0;
  try {
    const redis = require('./redis');
    if (redis.isReady && redis.isReady()) await redis.del('sitemap:xml');
  } catch (_) {}
  return await getSitemap();
}

// ═══ robots.txt ═══
function getRobotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /admin/*',
    'Disallow: /api/auth',
    'Disallow: /api/auth/*',
    'Disallow: /idol-studio',
    'Disallow: /profile',
    'Disallow: /profile/*',
    '',
    '# Sitemap',
    'Sitemap: ' + SITE_URL + '/sitemap.xml',
    ''
  ].join('\n');
}

module.exports = { getSitemap, regenerate, getRobotsTxt, buildSitemapXml };
