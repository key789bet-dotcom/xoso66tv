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
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;

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
async function fetchRawOdds(fixtureId) {
  if (!fixtureId) return null;
  const candidates = [
    BASE + '/odds?fixture=' + fixtureId,
    BASE + '/odds/live?fixture=' + fixtureId,
    BASE + '/odds/' + fixtureId,
    BASE + '/p/odds/' + fixtureId,
    BASE + '/p/fixtures/' + fixtureId + '/odds',
    BASE + '/fixtures/' + fixtureId + '/odds'
  ];
  for (const url of candidates) {
    const r = await _getJson(url);
    if (r.ok && r.data) {
      // Có data thật (không phải [] hoặc {success:true, data:[]})
      const hasData = Array.isArray(r.data) ? r.data.length > 0 :
                     (r.data.data && (Array.isArray(r.data.data) ? r.data.data.length > 0 : Object.keys(r.data.data).length > 0)) ||
                     Object.keys(r.data).filter(k => k !== 'success').length > 0;
      if (hasData) {
        return { source: url, raw: r.data };
      }
    }
  }
  return null;
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
async function getOdds(fixtureId) {
  if (!fixtureId) return null;
  const now = Date.now();
  const cached = _cache.get(fixtureId);
  if (cached && cached.expires > now) return cached.data;

  const raw = await fetchRawOdds(fixtureId);
  if (!raw) {
    // Cache miss for 1 phút để không spam
    _cache.set(fixtureId, { data: null, expires: now + 60000 });
    return null;
  }
  const parsed = parseOdds(raw.raw);
  if (parsed) parsed._source = raw.source;
  _cache.set(fixtureId, { data: parsed, expires: now + CACHE_TTL_MS });
  return parsed;
}

/**
 * Debug helper — trả về raw response (để inspect format thực)
 */
async function debugRaw(fixtureId) {
  return await fetchRawOdds(fixtureId);
}

module.exports = { getOdds, debugRaw, fetchRawOdds, parseOdds };
