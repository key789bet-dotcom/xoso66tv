// lib/api-football.js — Wrapper api-football.com (api-sports.io)
// Cung cấp: lineups, statistics, events, h2h, team form
// ENV: API_FOOTBALL_KEY (bắt buộc), API_FOOTBALL_BASE (optional, default v3.football.api-sports.io)
// Copy đơn giản từ diendanbongda, env-based config (không cần DB settings)

const https = require('https');
const { URL } = require('url');

const KEY = process.env.API_FOOTBALL_KEY || '';
const BASE = process.env.API_FOOTBALL_BASE || 'https://v3.football.api-sports.io';
const PROVIDER = process.env.API_FOOTBALL_PROVIDER || 'api-sports'; // hoặc 'rapidapi'
const TIMEOUT_MS = 8000;

function isEnabled() { return !!KEY; }

// Cache 2-layer: fresh (TTL) + stale (3x TTL fallback khi API fail)
const _cache = new Map();
function cGet(k, ttl) {
  const v = _cache.get(k);
  if (!v) return null;
  if (Date.now() - v.t < ttl) return v.v;
  return null;
}
function cStale(k, staleTtl) {
  const v = _cache.get(k);
  if (!v) return null;
  if (Date.now() - v.t < staleTtl) return v.v;
  return null;
}
function cSet(k, v) { _cache.set(k, { t: Date.now(), v }); }

function fetchJson(url) {
  return new Promise(function(resolve) {
    try {
      const headers = PROVIDER === 'rapidapi'
        ? { 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com', 'Accept': 'application/json' }
        : { 'x-apisports-key': KEY, 'Accept': 'application/json' };
      const req = https.get(url, { timeout: TIMEOUT_MS, headers }, function(res) {
        let buf = '';
        res.on('data', c => buf += c);
        res.on('end', function() {
          try {
            const j = JSON.parse(buf);
            if (j.errors && typeof j.errors === 'object' && Object.keys(j.errors).length > 0) {
              console.warn('[api-football] errors:', JSON.stringify(j.errors));
              resolve(null); return;
            }
            resolve(j.response || []);
          } catch (e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch (e) { resolve(null); }
  });
}

async function apiGet(endpoint, params, cacheTtlMs) {
  if (!KEY) return null;
  const qs = Object.entries(params || {})
    .filter(([k, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = BASE + endpoint + (qs ? '?' + qs : '');
  // Fresh cache
  if (cacheTtlMs > 0) {
    const hit = cGet(url, cacheTtlMs);
    if (hit !== null) return hit;
  }
  const data = await fetchJson(url);
  if (data !== null) { cSet(url, data); return data; }
  // Stale fallback
  return cStale(url, (cacheTtlMs || 60000) * 3);
}

// ============ ENDPOINTS ============

// Lineups: 11 cầu thủ + sub + sơ đồ + HLV (30 phút cache)
async function getLineups(fixtureId) {
  if (!fixtureId) return [];
  const data = await apiGet('/fixtures/lineups', { fixture: fixtureId }, 30 * 60 * 1000);
  return data || [];
}

// Statistics: possession, shots, corners, attacks... (60s cache cho live)
async function getStatistics(fixtureId) {
  if (!fixtureId) return [];
  const data = await apiGet('/fixtures/statistics', { fixture: fixtureId }, 60 * 1000);
  return data || [];
}

// Events: goal/sub/card theo phút (60s cache)
async function getEvents(fixtureId) {
  if (!fixtureId) return [];
  const data = await apiGet('/fixtures/events', { fixture: fixtureId }, 60 * 1000);
  return data || [];
}

// H2H
async function getH2H(team1Id, team2Id, last) {
  if (!team1Id || !team2Id) return [];
  const data = await apiGet('/fixtures/headtohead', {
    h2h: team1Id + '-' + team2Id, last: last || 10
  }, 24 * 60 * 60 * 1000);
  return data || [];
}

// Team form
async function getTeamForm(teamId, last) {
  if (!teamId) return [];
  const data = await apiGet('/fixtures', { team: teamId, last: last || 5 }, 60 * 60 * 1000);
  return data || [];
}

module.exports = {
  isEnabled,
  getLineups,
  getStatistics,
  getEvents,
  getH2H,
  getTeamForm
};
