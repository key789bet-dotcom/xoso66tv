/**
 * Tracking visitor + online users (in-memory).
 * Online = co request trong vong ONLINE_WINDOW (5 phut)
 * New today = visitor cookie lan dau xuat hien trong ngay
 */
const crypto = require('crypto');

const COOKIE         = 'x66_vid';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 nam
const ONLINE_WINDOW  = 5 * 60 * 1000;       // 5 phut
const KEEP_DAYS      = 7;                   // chi giu lich su 7 ngay

// vid -> { firstSeen: ts, lastSeen: ts }
const visitors = new Map();
// Day stat: 'YYYY-MM-DD' -> { newCount, totalRequests, uniqueVisitors:Set }
const dayStats = new Map();

function dayKey(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function getOrCreateDay(key) {
  if (!dayStats.has(key)) {
    dayStats.set(key, { newCount: 0, totalRequests: 0, uniqueVisitors: new Set() });
  }
  return dayStats.get(key);
}

function pruneOld() {
  const keys = Array.from(dayStats.keys()).sort();
  while (keys.length > KEEP_DAYS) dayStats.delete(keys.shift());
}

function parseCookie(req) {
  const c = req.headers.cookie || '';
  const m = c.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  return m ? decodeURIComponent(m.split('=')[1]) : null;
}

// Middleware: track moi request cong khai
function track(req, res, next) {
  // Bo qua static, API admin internal
  if (req.path.startsWith('/static/') || req.path.startsWith('/admin/api/')) return next();
  if (req.path === '/favicon.ico' || req.path === '/robots.txt' || req.path === '/sitemap.xml') return next();

  let vid = parseCookie(req);
  const now = Date.now();
  const key = dayKey();
  const day = getOrCreateDay(key);
  const isNew = !vid;

  if (!vid) {
    vid = crypto.randomBytes(12).toString('hex');
    res.setHeader('Set-Cookie', COOKIE + '=' + vid + '; Path=/; Max-Age=' + COOKIE_MAX_AGE + '; SameSite=Lax');
  }

  let v = visitors.get(vid);
  if (!v) {
    v = { firstSeen: now, lastSeen: now };
    visitors.set(vid, v);
  } else {
    v.lastSeen = now;
  }

  // Stat ngay
  day.totalRequests++;
  if (!day.uniqueVisitors.has(vid)) {
    day.uniqueVisitors.add(vid);
    // Neu day la lan dau visitor xuat hien trong he thong (firstSeen rat gan now), tinh la "new today"
    if (now - v.firstSeen < 5000 || isNew) day.newCount++;
  }
  pruneOld();
  next();
}

// API thong ke
function stats() {
  const now = Date.now();
  let online = 0;
  visitors.forEach(function (v) { if (now - v.lastSeen < ONLINE_WINDOW) online++; });

  const today  = getOrCreateDay(dayKey());
  const yKey   = dayKey(new Date(now - 86400000));
  const yest   = getOrCreateDay(yKey);

  // 7 ngay gan day cho mini chart
  const days7 = [];
  for (let i = 6; i >= 0; i--) {
    const d  = new Date(now - i*86400000);
    const k  = dayKey(d);
    const ds = getOrCreateDay(k);
    days7.push({
      date: k,
      label: String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0'),
      unique:   ds.uniqueVisitors.size,
      newCount: ds.newCount,
      requests: ds.totalRequests
    });
  }

  return {
    online: online,
    newToday: today.newCount,
    uniqueToday: today.uniqueVisitors.size,
    requestsToday: today.totalRequests,
    newYesterday: yest.newCount,
    uniqueYesterday: yest.uniqueVisitors.size,
    totalVisitors: visitors.size,
    days7: days7
  };
}

module.exports = { track: track, stats: stats, ONLINE_WINDOW: ONLINE_WINDOW };
