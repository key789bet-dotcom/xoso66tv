#!/usr/bin/env node
/**
 * Test odds API mới (chuẩn diendanbongda)
 * Usage: node scripts/test-odds-api.js [fixtureId]
 */
const oddsApi = require('../lib/odds-api');
const api = require('../lib/api');

async function main() {
  let fixtureId = process.argv[2];

  if (!fixtureId) {
    console.log('⏳ Auto-detect fixture UPCOMING...');
    const list = await api.getUpcomingStreams(null, 30);
    const upcoming = (list || []).filter(m => {
      const s = String(m.status || '').toLowerCase();
      return s !== 'ft' && s !== 'finished' && s !== 'aet' && s !== 'pen';
    });
    if (!upcoming[0]) { console.error('❌ Không có fixture upcoming'); process.exit(1); }
    fixtureId = upcoming[0].id;
    console.log('✅ Test với:', upcoming[0].home, 'vs', upcoming[0].away, '(' + fixtureId + ')');
  }

  console.log('\n═══ TEST 1: fetchAllBets (raw) ═══');
  const all = await oddsApi.fetchAllBets(fixtureId);
  console.log('  match_winner rows :', all.mw.length);
  console.log('  asian_handicap rows:', all.ah.length);
  console.log('  over_under rows   :', all.ou.length);

  console.log('\n═══ TEST 2: groupOdds ═══');
  const grouped = oddsApi.groupOdds([...all.mw, ...all.ah, ...all.ou]);
  console.log('  AH bookmakers   :', grouped.asian_handicap.length);
  console.log('  OU bookmakers   :', grouped.over_under.length);
  console.log('  1X2 bookmakers  :', grouped.match_winner.length);
  if (grouped.asian_handicap.length) {
    console.log('  AH lines:');
    grouped.asian_handicap.forEach(it => {
      console.log('    line=' + it.handicap + '  ' + it.bookmaker + '  home=' + it.home + ' away=' + it.away);
    });
  }
  if (grouped.over_under.length) {
    console.log('  OU lines:');
    grouped.over_under.forEach(it => {
      console.log('    line=' + it.total + '  ' + it.bookmaker + '  O=' + it.over + ' U=' + it.under);
    });
  }

  console.log('\n═══ TEST 3: getOdds (final picked MAIN line) ═══');
  const odds = await oddsApi.getOdds(fixtureId);
  if (!odds) { console.log('❌ getOdds() return null'); process.exit(1); }
  console.log(JSON.stringify(odds, null, 2));

  console.log('\n✅ PASS');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
