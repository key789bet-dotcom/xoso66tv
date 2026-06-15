/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 🎯 Odds API — Lấy tỉ lệ kèo từ thethaoviet.vip                  ║
 * ║                                                                    ║
 * ║ DÙNG ENDPOINT CHUẨN giống diendanbongda.com:                     ║
 * ║   GET /api/odds/prematch?fixture={ID}&bet={1|4|5}                ║
 * ║                                                                    ║
 * ║ bet_id mapping:                                                    ║
 * ║   1 = Match Winner (1x2)                                          ║
 * ║   4 = Asian Handicap                                              ║
 * ║   5 = Goals Over/Under (Tài/Xỉu)                                  ║
 * ║                                                                    ║
 * ║ Mỗi endpoint trả về ARRAY các row dạng:                          ║
 * ║   { bookmaker_name, value_name, odd_value, handicap, ... }       ║
 * ║                                                                    ║
 * ║ Cache: 30 phút prematch + concurrency limit 3                    ║
 * ╚══════════════════════════════════════════════════════════════════*/

const https = require('https');
const { URL } = require('url');

const BASE = 'https://api.thethaoviet.vip/api/odds';
const TIMEOUT_MS = 8000;
const MEM_TTL_MS = 30 * 60 * 1000;       // 30 phút (giống diendanbongda)
const STALE_TTL_MS = 2 * 60 * 60 * 1000; // 2h stale fallback khi 429

const BET_TYPES = {
  match_winner: 1,
  asian_handicap: 4,
  over_under: 5,
};

// Cache + concurrency limiter
const memCache = new Map();
const MAX_CONCURRENT = 3;
let _activeReqs = 0;
const _waitQueue = [];

async function _withConcurrency(fn) {
  if (_activeReqs >= MAX_CONCURRENT) {
    await new Promise(r => _waitQueue.push(r));
  }
  _activeReqs++;
  try {
    return await fn();
  } finally {
    _activeReqs--;
    const next = _waitQueue.shift();
    if (next) next();
  }
}

function _fetchJson(url) {
  return new Promise(function(resolve) {
    const u = new URL(url);
    const req = https.get(url, {
      timeout: TIMEOUT_MS,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'xoso66tv/1.0'
      }
    }, function(res) {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', function() {
        try {
          const j = JSON.parse(chunks);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: j });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, error: 'json parse fail', raw: chunks.slice(0, 200) });
        }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

/**
 * Fetch prematch odds cho 1 fixture + 1 bet type — RAW ARRAY
 */
async function fetchPrematch(fixtureId, betId) {
  if (!fixtureId) return [];
  betId = betId || BET_TYPES.asian_handicap;
  const cacheKey = 'p:' + fixtureId + ':' + betId;
  const hit = memCache.get(cacheKey);
  const now = Date.now();
  if (hit && now - hit.t < MEM_TTL_MS) return hit.v;

  const url = BASE + '/prematch?fixture=' + encodeURIComponent(fixtureId) + '&bet=' + betId;
  return _withConcurrency(async function() {
    const r = await _fetchJson(url);
    if (!r.ok) {
      // 429/5xx → serve stale cache
      if ((r.status === 429 || r.status >= 500) && hit && now - hit.t < STALE_TTL_MS) {
        return hit.v;
      }
      console.warn('[odds-api]', r.status || 'err', url);
      return hit ? hit.v : [];
    }
    const j = r.data;
    const data = (j && j.success && Array.isArray(j.data)) ? j.data : [];
    memCache.set(cacheKey, { t: now, v: data });
    return data;
  });
}

/**
 * Fetch all 3 markets (1x2 + AH + OU) cho 1 fixture
 */
async function fetchAllBets(fixtureId) {
  if (!fixtureId) return { mw: [], ah: [], ou: [] };
  const [mw, ah, ou] = await Promise.all([
    fetchPrematch(fixtureId, BET_TYPES.match_winner).catch(() => []),
    fetchPrematch(fixtureId, BET_TYPES.asian_handicap).catch(() => []),
    fetchPrematch(fixtureId, BET_TYPES.over_under).catch(() => []),
  ]);
  return { mw, ah, ou };
}

/**
 * Group raw rows by bookmaker × handicap line
 * (giống logic groupOdds của diendanbongda)
 */
function groupOdds(rows) {
  const out = {
    asian_handicap: {},
    over_under: {},
    match_winner: {}
  };
  for (const r of rows || []) {
    const bk = r.bookmaker_name || '';
    if (!bk) continue;
    const odd = parseFloat(r.odd_value);
    if (isNaN(odd)) continue;
    const handicap = r.handicap || '';
    const side = (r.value_name || '').toLowerCase();
    const betId = r.bet_id;
    const betName = (r.bet_name || '').toLowerCase();

    if (betId === 4 || betName.includes('handicap') || betName.includes('asian')) {
      const key = bk + '|' + handicap;
      if (!out.asian_handicap[key]) out.asian_handicap[key] = { bookmaker: bk, handicap, line: parseFloat(handicap) };
      if (side === 'home') out.asian_handicap[key].home = odd;
      else if (side === 'away') out.asian_handicap[key].away = odd;
    }
    else if (betId === 5 || betName.includes('over') || betName.includes('under') || betName.includes('total') || betName.includes('goals')) {
      const key = bk + '|' + handicap;
      if (!out.over_under[key]) out.over_under[key] = { bookmaker: bk, total: handicap, line: parseFloat(handicap) };
      if (side === 'over') out.over_under[key].over = odd;
      else if (side === 'under') out.over_under[key].under = odd;
    }
    else if (betId === 1 || betName.includes('match winner') || betName.includes('1x2')) {
      if (!out.match_winner[bk]) out.match_winner[bk] = { bookmaker: bk };
      if (side === 'home') out.match_winner[bk].home = odd;
      else if (side === 'away') out.match_winner[bk].away = odd;
      else if (side === 'draw') out.match_winner[bk].draw = odd;
    }
  }
  return {
    asian_handicap: Object.values(out.asian_handicap).filter(o => o.home && o.away),
    over_under: Object.values(out.over_under).filter(o => o.over && o.under),
    match_winner: Object.values(out.match_winner).filter(o => o.home && o.draw && o.away),
  };
}

/**
 * Pick MAIN line từ list của 1 market.
 *
 * BetsAPI/thethaoviet trả MỘT LINE/BOOKMAKER (mỗi sàn chọn 1 line khác nhau).
 * Một số sàn (Marathonbet, 1xBet) chỉ show ALT line cực đoan (home 1.02 / away 8.0).
 * Sàn uy tín (Bet365, Pinnacle, Betano) thường show MAIN line (1.80/1.90).
 *
 * Logic 2 bước:
 *   1. Nếu có nhiều sàn cùng line → ưu tiên consensus (count cao)
 *   2. Nếu mỗi sàn 1 line khác → pick line CÂN NHẤT (|home-away| min)
 *      + Phạt odds quá cực đoan (<1.30 hoặc >4.0) — đó là ALT line
 */
function pickMainLine(items, kHome, kAway) {
  kHome = kHome || 'home';
  kAway = kAway || 'away';
  if (!items || !items.length) return null;

  // Group by handicap line
  const byLine = {};
  items.forEach(it => {
    const lineKey = String(it.handicap != null ? it.handicap : it.total);
    if (!byLine[lineKey]) byLine[lineKey] = [];
    byLine[lineKey].push(it);
  });

  // Score MỖI LINE = (10 - count*3) + balance + extremePenalty
  // - count cao (nhiều sàn cùng line) → bonus
  // - balance: |home - away| càng nhỏ → line càng main
  // - extremePenalty: odds < 1.30 hoặc > 4.0 → ALT line, phạt nặng
  let bestGroup = null, bestScore = Infinity;
  Object.keys(byLine).forEach(lineKey => {
    const group = byLine[lineKey];
    // Lấy item đại diện (uy tín nhất trong group)
    const PREF = ['Bet365', 'Pinnacle', 'Betano', 'William Hill', 'Marathonbet', '1xBet'];
    let rep = null;
    for (const p of PREF) {
      rep = group.find(b => (b.bookmaker || '').toLowerCase().includes(p.toLowerCase()));
      if (rep) break;
    }
    if (!rep) rep = group[0];
    const h = parseFloat(rep[kHome]);
    const a = parseFloat(rep[kAway]);
    if (!h || !a || h <= 1 || a <= 1) return;

    const balance = Math.abs(h - a);
    const extreme =
      (h < 1.30 ? 10 : 0) + (a < 1.30 ? 10 : 0) +
      (h < 1.50 ? 3  : 0) + (a < 1.50 ? 3  : 0) +
      (h > 4.00 ? 5  : 0) + (a > 4.00 ? 5  : 0) +
      (h > 6.00 ? 10 : 0) + (a > 6.00 ? 10 : 0);
    const countBonus = -group.length * 2;  // count cao → score thấp (better)

    const score = balance + extreme + countBonus;
    if (score < bestScore) {
      bestScore = score;
      bestGroup = rep;
    }
  });

  return bestGroup;
}

/**
 * Get odds DẠNG FORMAT CŨ cho widget (backward compatible)
 * Returns: { ah: {line, homeOdds, awayOdds, bookmaker}, ou: {...}, x12: {...} }
 */
async function getOdds(fixtureId, opts) {
  if (!fixtureId) return null;
  opts = opts || {};
  const { mw, ah, ou } = await fetchAllBets(fixtureId);
  const grouped = groupOdds([...mw, ...ah, ...ou]);

  const out = {
    ah: null,
    ou: null,
    x12: null,
    fetchedAt: Date.now()
  };

  // AH: pick main line
  const ahMain = pickMainLine(grouped.asian_handicap);
  if (ahMain) {
    out.ah = {
      line: ahMain.line || 0,
      homeOdds: ahMain.home,
      awayOdds: ahMain.away,
      bookmaker: ahMain.bookmaker
    };
  }

  // OU: pick main line
  const ouMain = pickMainLine(grouped.over_under);
  if (ouMain) {
    out.ou = {
      line: ouMain.line || 2.5,
      taiOdds: ouMain.over,
      xiuOdds: ouMain.under,
      bookmaker: ouMain.bookmaker
    };
  }

  // 1X2: ưu tiên bookmaker uy tín
  if (grouped.match_winner.length) {
    const PREF = ['Bet365', 'Pinnacle', 'Marathonbet', 'William Hill'];
    let x = null;
    for (const p of PREF) {
      x = grouped.match_winner.find(b => (b.bookmaker || '').toLowerCase().includes(p.toLowerCase()));
      if (x) break;
    }
    if (!x) x = grouped.match_winner[0];
    out.x12 = {
      home: x.home,
      draw: x.draw,
      away: x.away,
      bookmaker: x.bookmaker
    };
  }

  if (!out.ah && !out.ou && !out.x12) return null;
  return out;
}

/**
 * Debug helper — return raw rows + grouped
 */
async function debugRaw(fixtureId) {
  const all = await fetchAllBets(fixtureId);
  const grouped = groupOdds([...all.mw, ...all.ah, ...all.ou]);
  return {
    rawCount: { mw: all.mw.length, ah: all.ah.length, ou: all.ou.length },
    grouped,
    parsed: await getOdds(fixtureId)
  };
}

module.exports = {
  BET_TYPES,
  fetchPrematch,
  fetchAllBets,
  groupOdds,
  pickMainLine,
  getOdds,
  debugRaw
};
