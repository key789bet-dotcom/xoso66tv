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
  let home = process.argv[3];
  let away = process.argv[4];

  // ═══ TEST SCRAPE thethaoviet.vip HTML (NEW APPROACH) ═══
  if (fixtureId && home && away) {
    console.log('\n═══ TEST 0: Scrape HTML từ thethaoviet.vip ═══');
    const scraped = await oddsApi.scrapeOdds(home, away, fixtureId);
    console.log('Source URL:', scraped && scraped._source);
    console.log('Result:');
    console.log(JSON.stringify(scraped, null, 2).slice(0, 1500));
    if (scraped && (scraped.ah || scraped.ou || scraped.x12)) {
      console.log('\n🎉 SCRAPE THÀNH CÔNG!');
      if (scraped.ah) console.log('  🎯 AH:', scraped.ah);
      if (scraped.ou) console.log('  📊 OU:', scraped.ou);
      if (scraped.x12) console.log('  🏆 1X2:', scraped.x12);
      process.exit(0);
    } else if (scraped && scraped._empty) {
      console.log('\n⚠️  HTML page tồn tại nhưng parser chưa extract được odds.');
      console.log('💡 HTML snippet (đầu page):', scraped._htmlSnippet);
      console.log('💡 HTML size:', scraped._htmlSize, 'bytes');
      console.log('   → Có thể odds load qua JS sau khi DOM ready (CSR), không có trong initial HTML.');
      console.log('   → Hoặc parser regex cần cập nhật để match đúng format.');
    }
  }

  if (!fixtureId) {
    console.log('⏳ Auto-detect fixture UPCOMING (status !== FT)...');
    try {
      // Lấy 30 fixture đầu tiên, lọc ra trận chưa đá xong
      const list = await api.getUpcomingStreams(null, 30);
      const upcoming = (list || []).filter(function(m) {
        const st = (m.status || m.status_short || '').toString().toUpperCase();
        // FT/AET/PEN = đã xong; NS/TBD/PST = upcoming; 1H/2H/HT/LIVE = đang đá
        return st !== 'FT' && st !== 'AET' && st !== 'PEN' && st !== 'FINISHED';
      });
      if (upcoming[0]) {
        fixtureId = upcoming[0].id;
        home = upcoming[0].home;
        away = upcoming[0].away;
        console.log('✅ Test với fixture UPCOMING:', home, 'vs', away, '(id:', fixtureId + ', status:', upcoming[0].status + ')');
        // Thử scrape ngay nếu chưa thử
        console.log('\n═══ TEST 0 (auto): Scrape HTML từ thethaoviet.vip ═══');
        const scraped = await oddsApi.scrapeOdds(home, away, fixtureId);
        console.log('Source URL:', scraped && scraped._source);
        console.log('Result:', JSON.stringify(scraped, null, 2).slice(0, 1500));
        if (scraped && (scraped.ah || scraped.ou || scraped.x12)) {
          console.log('\n🎉 SCRAPE THÀNH CÔNG!');
          if (scraped.ah) console.log('  🎯 AH:', scraped.ah);
          if (scraped.ou) console.log('  📊 OU:', scraped.ou);
          if (scraped.x12) console.log('  🏆 1X2:', scraped.x12);
          process.exit(0);
        } else if (scraped && scraped._empty) {
          console.log('⚠️  HTML page tồn tại nhưng parser chưa extract được odds (' + scraped._htmlSize + ' bytes).');
          // Tìm các từ khóa odds trong HTML
          if (scraped._htmlSnippet) {
            console.log('💡 Snippet first 400 chars:', scraped._htmlSnippet.slice(0, 400));
          }
        }
      } else {
        console.log('⚠️ Không tìm thấy fixture upcoming trong 30 trận đầu (toàn FT?)');
      }
    } catch(e) { console.error('Auto-detect fail:', e.message); }
  }
  if (!fixtureId) {
    console.error('❌ Không có fixtureId. Truyền vào: node scripts/test-odds-api.js <ID> [home] [away]');
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
