#!/usr/bin/env node
/**
 * Test odds API endpoint của thethaoviet.vip
 * Chạy: node /var/www/xoso66tv/scripts/test-odds-api.js [fixtureId]
 *
 * Mục đích: tìm endpoint trả về odds Châu Á / T-X / 1x2 + xem format
 */
const oddsApi = require('../lib/odds-api');
const api = require('../lib/api');

async function main() {
  // Lấy fixtureId từ args hoặc auto-detect từ live fixtures
  let fixtureId = process.argv[2];
  if (!fixtureId) {
    console.log('⏳ Lấy fixture đầu tiên từ /lich-phat-song...');
    try {
      const list = await api.getUpcomingStreams(null, 5);
      if (list && list[0]) {
        fixtureId = list[0].id;
        console.log('✅ Test với fixture:', list[0].home, 'vs', list[0].away, '(id:', fixtureId + ')');
      }
    } catch(e) { console.error('Auto-detect fail:', e.message); }
  }
  if (!fixtureId) {
    console.error('❌ Không có fixtureId. Truyền vào: node scripts/test-odds-api.js <ID>');
    process.exit(1);
  }

  console.log('\n═══ TEST 1: Raw fetch (verbose mode — show ALL endpoints) ═══');
  const raw = await oddsApi.debugRaw(fixtureId, true);
  if (raw && raw.allResponses) {
    console.log('\n📋 Tất cả ' + raw.allResponses.length + ' endpoints đã thử:');
    raw.allResponses.forEach(function(r, i) {
      const statusIcon = r.status === 200 ? '✅' : (r.status >= 400 ? '❌' : '⚠️');
      console.log('\n' + (i+1) + '. ' + statusIcon + ' [' + r.status + '] ' + r.url);
      console.log('   Response: ' + r.sample);
    });
  }
  if (!raw || !raw.raw) {
    console.log('\n❌ Không endpoint nào trả data. Cần inspect Network browser:');
    console.log('💡 Mở https://thethaoviet.vip → F12 → Network → click "Dữ liệu" cạnh trận có odds → copy URL request → paste cho em');
    process.exit(1);
  }
  console.log('\n✅ Endpoint có data:', raw.source);
  console.log('📦 Full data:');
  console.log(JSON.stringify(raw.raw, null, 2).slice(0, 2000));

  console.log('\n═══ TEST 2: Parse odds ═══');
  const parsed = oddsApi.parseOdds(raw.raw);
  if (!parsed) {
    console.log('❌ Parser chưa nhận diện được format. Em cần xem raw data ở trên để fix parser.');
    process.exit(1);
  }
  console.log('✅ Parsed:');
  if (parsed.ah) console.log('  🎯 Asian Handicap:  line=' + parsed.ah.line + '  home=' + parsed.ah.homeOdds + '  away=' + parsed.ah.awayOdds);
  else console.log('  ⚠️  Asian Handicap: không có');
  if (parsed.ou) console.log('  📊 Over/Under:     line=' + parsed.ou.line + '  Tài=' + parsed.ou.taiOdds + '  Xỉu=' + parsed.ou.xiuOdds);
  else console.log('  ⚠️  Over/Under: không có');
  if (parsed.x12) console.log('  🏆 1X2:            home=' + parsed.x12.home + '  draw=' + parsed.x12.draw + '  away=' + parsed.x12.away);
  else console.log('  ⚠️  1X2: không có');

  console.log('\n═══ TEST 3: Public API + cache ═══');
  const odds = await oddsApi.getOdds(fixtureId);
  console.log(odds ? '✅ getOdds() OK' : '❌ getOdds() trả null');
}

main().catch(function(e){ console.error('FATAL:', e); process.exit(1); });
