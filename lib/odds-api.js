/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🎯 Odds API — Lấy tỉ lệ kèo Châu Á / Tài Xỉu / 1X2              ║
 * ║                                                                    ║
 * ║ Nguồn: thethaoviet.vip (mirror BetsAPI)                          ║
 * ║                                                                    ║
 * ║ Standard BetsAPI bet types:                                       ║
 * ║   bet=1  → 1X2 / Match Winner                                    ║
 * ║   bet=4  → Asian Handicap (kèo Châu Á)                          ║
 * ║   bet=5  → Goals Over/Under (Tài/Xỉu)                           ║
 * ║                                                                    ║
 * ║ Cache TTL: 5 phút (kèo có thể đổi gần giờ trận)                 ║
 * ╚══════════════════════════════════════════════════════════════════*/
const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE = process.env.API_BASE || 'https://api.thethaoviet.vip/api';
const SCRAPE_BASE = 'https://thethaoviet.vip';  // Next.js SSR site (HTML scraping)
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Convert "Brazil" → "brazil", "Türkiye" → "turkiye", "U. Catolica" → "u-catolica"
function _slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function _fetchHtml(url) {
  return new Promise(function(resolve) {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(url, {
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; xoso66tv/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'vi-VN,vi;q=0.9'
      }
    }, function(res) {
      let chunks = '';
      res.on('data', function(c){ chunks += c; });
      res.on('end', function(){
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, html: chunks });
      });
    });
    req.on('error', function(e){ resolve({ ok:false, error: e.message }); });
    req.on('timeout', function(){ req.destroy(); resolve({ ok:false, error:'timeout' }); });
  });
}

/**
 * Scrape odds từ HTML page của thethaoviet.vip
 * URL: https://thethaoviet.vip/football-match/du-lieu/{home}-vs-{away}-{id}
 */
async function scrapeOdds(home, away, fixtureId) {
  if (!fixtureId) return null;
  const slug = _slugify(home + '-vs-' + away);
  const url = SCRAPE_BASE + '/football-match/du-lieu/' + slug + '-' + fixtureId;
  const r = await _fetchHtml(url);
  if (!r.ok) return null;
  const html = r.html;

  // Next.js streams data trong <script> tags. Cũng có thể trong HTML table.
  // Pattern em sẽ thử:
  // 1. Find Next.js Flight data với keyword "asian", "over_under", "x12"
  // 2. Find HTML table với CHÂU Á / T/X / 1X2

  const out = { ah: null, ou: null, x12: null, fetchedAt: Date.now(), _source: url };

  // 1. Tìm JSON embedded trong Next.js Flight format
  // Format: "asian":{"line":-0.5,"home":1.67,"away":2.20}
  const ahJson = html.match(/"(asian|handicap|asian_handicap)":\s*(\{[^}]+\})/i);
  if (ahJson) {
    try {
      const o = JSON.parse(ahJson[2]);
      out.ah = {
        line: parseFloat(o.line || o.handicap || 0),
        homeOdds: parseFloat(o.home || o.h || 0),
        awayOdds: parseFloat(o.away || o.a || 0)
      };
    } catch(e){}
  }
  const ouJson = html.match(/"(over_under|totals|goals|tai_xiu)":\s*(\{[^}]+\})/i);
  if (ouJson) {
    try {
      const o = JSON.parse(ouJson[2]);
      out.ou = {
        line: parseFloat(o.line || o.total || 2.5),
        taiOdds: parseFloat(o.over || o.tai || o.o || 0),
        xiuOdds: parseFloat(o.under || o.xiu || o.u || 0)
      };
    } catch(e){}
  }
  const x12Json = html.match(/"(x12|match_winner|1x2)":\s*(\{[^}]+\})/i);
  if (x12Json) {
    try {
      const o = JSON.parse(x12Json[2]);
      out.x12 = {
        home: parseFloat(o.home || o.h || o['1'] || 0),
        draw: parseFloat(o.draw || o.d || o['x'] || 0),
        away: parseFloat(o.away || o.a || o['2'] || 0)
      };
    } catch(e){}
  }

  // 2. Nếu chưa có, tìm trong HTML table (textcontent)
  if (!out.ah || !out.ou) {
    // Pattern: dòng "Châu Á" → next cells có số "-0.5" và "1.67 / 2.20"
    // Khó parse vì Next.js render React → HTML có nhiều class names
    // Em dùng regex tolerant tìm số decimal gần keyword
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (!out.ah) {
      const ahMatch = text.match(/Ch[âa]u\s*[ÁA][^0-9-]*(-?\d+\.?\d*)[^0-9]+(\d+\.\d+)\s*\/\s*(\d+\.\d+)/);
      if (ahMatch) {
        out.ah = {
          line: parseFloat(ahMatch[1]),
          homeOdds: parseFloat(ahMatch[2]),
          awayOdds: parseFloat(ahMatch[3])
        };
      }
    }
    if (!out.ou) {
      const ouMatch = text.match(/T\/X[^0-9-]*(\d+\.?\d*)[^0-9]+(\d+\.\d+)\s*\/\s*(\d+\.\d+)/);
      if (ouMatch) {
        out.ou = {
          line: parseFloat(ouMatch[1]),
          taiOdds: parseFloat(ouMatch[2]),
          xiuOdds: parseFloat(ouMatch[3])
        };
      }
    }
    if (!out.x12) {
      const xMatch = text.match(/1X2[^0-9]*(\d+\.\d+)\s*\/\s*(\d+\.\d+)\s*\/\s*(\d+\.\d+)/);
      if (xMatch) {
        out.x12 = {
          home: parseFloat(xMatch[1]),
          draw: parseFloat(xMatch[2]),
          away: parseFloat(xMatch[3])
        };
      }
    }
  }

  if (!out.ah && !out.ou && !out.x12) {
    // Trả về object với raw html snippet để debug
    return { ah:null, ou:null, x12:null, _source: url, _empty:true, _htmlSize: html.length, _htmlSnippet: html.slice(0, 500) };
  }
  return out;
}

// In-memory cache
const _cache = new Map();

function _getJson(url) {
  return new Promise(function(resolve) {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(url, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': 'xoso66tv-odds/1.0', 'Accept': 'application/json' }
    }, function(res) {
      let chunks = '';
      res.on('data', function(c){ chunks += c; });
      res.on('end', function(){
        try {
          const json = JSON.parse(chunks);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json });
        } catch(e) {
          resolve({ ok:false, status: res.statusCode, error:'JSON parse fail', body: chunks.slice(0,300) });
        }
      });
    });
    req.on('error', function(e){ resolve({ ok:false, error: e.message }); });
    req.on('timeout', function(){ req.destroy(); resolve({ ok:false, error:'timeout' }); });
  });
}

/**
 * Fetch raw odds cho 1 fixture từ multiple endpoint candidates
 * thethaoviet.vip có thể dùng các pattern khác nhau, em thử lần lượt
 */
async function fetchRawOdds(fixtureId, opts) {
  if (!fixtureId) return null;
  opts = opts || {};
  const verbose = !!opts.verbose;
  const DETAIL = BASE.replace('/api', '/api/p');
  // Ưu tiên endpoints upcoming/pre-match
  const candidates = [
    BASE + '/odds?fixture=' + fixtureId,
    BASE + '/odds?fixture_id=' + fixtureId,
    BASE + '/odds?match=' + fixtureId,
    BASE + '/odds/' + fixtureId,
    BASE + '/odds/pre?fixture=' + fixtureId,
    BASE + '/odds/upcoming?fixture=' + fixtureId,
    DETAIL + '/odds/' + fixtureId,
    DETAIL + '/odds?fixture=' + fixtureId,
    DETAIL + '/fixtures/' + fixtureId + '/odds',
    DETAIL + '/fixtures/' + fixtureId + '/detail',
    BASE + '/fixtures/' + fixtureId,
    BASE + '/fixtures/' + fixtureId + '/odds',
    BASE + '/odds/live?fixture=' + fixtureId,
    BASE + '/odds?bet=1&fixture=' + fixtureId,
    BASE + '/odds?bet=4&fixture=' + fixtureId,
    BASE + '/odds?bet=5&fixture=' + fixtureId
  ];
  let bestEmpty = null;
  const allResponses = [];
  for (const url of candidates) {
    const r = await _getJson(url);
    if (verbose) {
      allResponses.push({
        url: url,
        status: r.status || 'err',
        sample: r.data ? JSON.stringify(r.data).slice(0, 200) : (r.error || 'no response')
      });
    }
    if (r.ok && r.data) {
      // Có data thật (không phải [] hoặc {success:true, data:[]})
      const hasData = Array.isArray(r.data) ? r.data.length > 0 :
                     (r.data.data && (Array.isArray(r.data.data) ? r.data.data.length > 0 : Object.keys(r.data.data).length > 0)) ||
                     Object.keys(r.data).filter(k => k !== 'success' && k !== 'message').length > 0;
      if (hasData) {
        return { source: url, raw: r.data, allResponses: verbose ? allResponses : undefined };
      }
      // Lưu best-effort empty response (endpoint hợp lệ nhưng không có data)
      if (!bestEmpty) bestEmpty = { source: url, raw: r.data, empty: true };
    }
  }
  if (verbose) {
    return { source: 'NONE', raw: null, empty: true, allResponses };
  }
  return bestEmpty;
}

/**
 * Parse raw API response → format chuẩn của xoso66tv
 * Format đầu ra:
 *   {
 *     ah: { line: -0.5, homeOdds: 1.67, awayOdds: 2.20 },
 *     ou: { line: 4.5, taiOdds: 7.50, xiuOdds: 1.08 },
 *     x12: { home: 1.68, draw: 3.75, away: 5.10 },
 *     fetchedAt: timestamp
 *   }
 */
function parseOdds(raw) {
  if (!raw) return null;
  // Unwrap success wrapper nếu có
  const data = raw.data || raw;
  // BetsAPI thường trả về array of bookmakers > bets > values
  // Hoặc trả về object {asian:{...}, over_under:{...}, x12:{...}}

  const out = {
    ah: null,
    ou: null,
    x12: null,
    fetchedAt: Date.now()
  };

  // Format 1: direct object { asian: {...}, over_under: {...}, ... }
  if (data.asian || data.handicap) {
    const ah = data.asian || data.handicap;
    out.ah = {
      line: parseFloat(ah.line || ah.handicap || 0),
      homeOdds: parseFloat(ah.home || ah.home_odds || ah.h || 0),
      awayOdds: parseFloat(ah.away || ah.away_odds || ah.a || 0)
    };
  }
  if (data.over_under || data.totals || data.goals) {
    const ou = data.over_under || data.totals || data.goals;
    out.ou = {
      line: parseFloat(ou.line || ou.total || 2.5),
      taiOdds: parseFloat(ou.over || ou.tai || ou.o || 0),
      xiuOdds: parseFloat(ou.under || ou.xiu || ou.u || 0)
    };
  }
  if (data.x12 || data.match_winner || data['1x2']) {
    const x = data.x12 || data.match_winner || data['1x2'];
    out.x12 = {
      home: parseFloat(x.home || x.h || x['1'] || 0),
      draw: parseFloat(x.draw || x.d || x['x'] || x['X'] || 0),
      away: parseFloat(x.away || x.a || x['2'] || 0)
    };
  }

  // Format 2: BetsAPI bookmakers array
  if (Array.isArray(data) && data.length) {
    // Lấy bookmaker đầu (thường là Bet365 hoặc Pinnacle)
    const bm = data[0];
    if (bm.bets && Array.isArray(bm.bets)) {
      bm.bets.forEach(function(b) {
        const name = (b.name || '').toLowerCase();
        if (name.includes('asian') || name.includes('handicap')) {
          // values: [{value:'Home -0.5', odd:'1.67'}, {value:'Away +0.5', odd:'2.20'}]
          if (b.values && b.values.length >= 2) {
            const v0 = b.values[0], v1 = b.values[1];
            const lineMatch = (v0.value || '').match(/[-+]?\d+\.?\d*/);
            out.ah = {
              line: lineMatch ? parseFloat(lineMatch[0]) : 0,
              homeOdds: parseFloat(v0.odd),
              awayOdds: parseFloat(v1.odd)
            };
          }
        } else if (name.includes('over/under') || name.includes('goals') || name === 'totals') {
          if (b.values && b.values.length >= 2) {
            const over = b.values.find(v => /over/i.test(v.value));
            const under = b.values.find(v => /under/i.test(v.value));
            if (over && under) {
              const lineMatch = (over.value || '').match(/\d+\.?\d*/);
              out.ou = {
                line: lineMatch ? parseFloat(lineMatch[0]) : 2.5,
                taiOdds: parseFloat(over.odd),
                xiuOdds: parseFloat(under.odd)
              };
            }
          }
        } else if (name.includes('match winner') || name === '1x2' || name === 'fulltime result') {
          if (b.values && b.values.length >= 3) {
            out.x12 = {
              home: parseFloat(b.values[0].odd),
              draw: parseFloat(b.values[1].odd),
              away: parseFloat(b.values[2].odd)
            };
          }
        }
      });
    }
  }

  // Validate: ít nhất 1 trong 3 phải có data
  if (!out.ah && !out.ou && !out.x12) return null;
  return out;
}

/**
 * Public API — lấy odds đã parse + cache
 */
async function getOdds(fixtureId, opts) {
  if (!fixtureId) return null;
  opts = opts || {};
  const now = Date.now();
  const cached = _cache.get(fixtureId);
  if (cached && cached.expires > now) return cached.data;

  let parsed = null;

  // STRATEGY 1: Scrape HTML từ thethaoviet.vip (most reliable since data render SSR)
  if (opts.home && opts.away) {
    parsed = await scrapeOdds(opts.home, opts.away, fixtureId);
    if (parsed && (parsed.ah || parsed.ou || parsed.x12)) {
      _cache.set(fixtureId, { data: parsed, expires: now + CACHE_TTL_MS });
      return parsed;
    }
  }

  // STRATEGY 2: Try API endpoint candidates (fallback)
  const raw = await fetchRawOdds(fixtureId);
  if (raw && raw.raw) {
    parsed = parseOdds(raw.raw);
    if (parsed) parsed._source = raw.source;
  }

  _cache.set(fixtureId, { data: parsed, expires: now + (parsed ? CACHE_TTL_MS : 60000) });
  return parsed;
}

/**
 * Debug helper — trả về raw response (để inspect format thực)
 */
async function debugRaw(fixtureId, verbose) {
  return await fetchRawOdds(fixtureId, { verbose: !!verbose });
}

module.exports = { getOdds, debugRaw, fetchRawOdds, parseOdds };
