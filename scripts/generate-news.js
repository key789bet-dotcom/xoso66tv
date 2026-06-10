#!/usr/bin/env node
/**
 * Generate news AI: lấy lịch trận hôm nay → gọi Claude viết bài → lưu data/news.json
 *
 * Chạy:
 *   CLAUDE_API_KEY=sk-... node scripts/generate-news.js
 *
 * Hoặc đã set env qua .env file / PM2 ecosystem:
 *   node scripts/generate-news.js
 */

// Auto load .env nếu chạy standalone (không qua PM2)
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (e) { /* dotenv chưa cài cũng ok nếu env đã set */ }

const ai = require('../lib/claude-ai');
const newsStore = require('../lib/news-store');
const api = require('../lib/api');

// Số bài tối thiểu mỗi lần chạy (default 10)
const MIN_ARTICLES = parseInt(process.env.NEWS_MAX || '10', 10);
// Cap cứng: không sinh quá 40 bài/lần để tránh blow-up cost
const HARD_CAP = parseInt(process.env.NEWS_CAP || '40', 10);

/**
 * Danh sách giải đấu ƯU TIÊN cao
 * Nếu trong list trận hôm nay có giải này → sinh FULL tất cả trận của giải đó
 * Match theo case-insensitive substring trong tên league
 */
const PRIORITY_LEAGUES = [
  // International
  'world cup', 'fifa world cup', 'euro', 'uefa euro', 'copa america', 'afc asian',
  'champions league', 'europa league', 'conference league', 'club world cup',
  // Top 5 European leagues
  'premier league', 'ngoại hạng anh',
  'la liga', 'laliga', 'primera division',
  'serie a',
  'bundesliga',
  'ligue 1',
  // Vietnamese
  'v-league', 'v league', 'aff cup', 'aff championship', 'sea games',
  // Other big
  'fa cup', 'copa del rey', 'dfb pokal',
  'super league', 'a-league',
];

function isPriorityLeague(name) {
  if (!name) return false;
  const lname = String(name).toLowerCase();
  return PRIORITY_LEAGUES.some(k => lname.indexOf(k) !== -1);
}

// Image: dùng badge của 2 đội + bg football. Fallback Unsplash random
function buildImage(match) {
  if (match.poster) return match.poster;
  // Composite không khả thi server-side. Dùng badge home làm thumbnail.
  if (match.homeBadge) return match.homeBadge;
  // Fallback: Unsplash random football
  return 'https://source.unsplash.com/800x400/?football,stadium,' + encodeURIComponent(match.sport || 'soccer');
}

async function main() {
  console.log('🤖 [NEWS] Bắt đầu generate news...');

  if (!process.env.CLAUDE_API_KEY) {
    console.error('❌ CLAUDE_API_KEY chưa set. Bỏ qua.');
    process.exit(1);
  }

  // 1. Lấy lịch trận sắp tới (live + upcoming)
  let live = []; let upcoming = [];
  try {
    live = await api.getLiveStreams();
    upcoming = await api.getUpcomingStreams(null, 20);
  } catch (e) {
    console.error('❌ Lấy lịch trận fail:', e.message);
    process.exit(1);
  }

  const allMatches = live.concat(upcoming).filter(m => m && m.home && m.away);
  // Dedupe theo id
  const seen = new Set();
  const uniqueMatches = allMatches.filter(m => {
    const k = m.id || (m.home + '_' + m.away);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 🏆 BƯỚC 1: Lấy TẤT CẢ trận của giải đấu ưu tiên (full all)
  const priorityMatches = uniqueMatches.filter(m => isPriorityLeague(m.league));
  const otherMatches = uniqueMatches.filter(m => !isPriorityLeague(m.league));

  // 🎯 BƯỚC 2: Build danh sách candidates
  //   - Priority matches: FULL hết (không cắt)
  //   - Other matches: chỉ thêm cho đủ MIN_ARTICLES
  let candidates = priorityMatches.slice(0); // tất cả giải ưu tiên
  if (candidates.length < MIN_ARTICLES) {
    const need = MIN_ARTICLES - candidates.length;
    candidates = candidates.concat(otherMatches.slice(0, need));
  }
  // Cap cứng để bảo vệ cost
  candidates = candidates.slice(0, HARD_CAP);

  if (candidates.length === 0) {
    console.warn('⚠️  Không có trận nào để sinh bài. Bỏ qua.');
    process.exit(0);
  }

  console.log(`📊 Phân tích:`);
  console.log(`   🏆 Giải ưu tiên: ${priorityMatches.length} trận`);
  console.log(`   ⚽ Giải khác: ${otherMatches.length} trận`);
  console.log(`   🎯 Sẽ sinh: ${candidates.length} bài (min ${MIN_ARTICLES}, cap ${HARD_CAP})`);
  console.log('');
  candidates.forEach((m, i) => {
    const tag = isPriorityLeague(m.league) ? '🔥' : '  ';
    console.log(`  ${tag} ${i+1}. ${m.home} vs ${m.away} (${m.league || m.sport})`);
  });

  // 2. Check tránh trùng - skip nếu đã có bài cho match này hôm nay
  const existing = newsStore.load();
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayTs = todayStart.getTime();
  const newMatches = candidates.filter(m => {
    const existsToday = existing.some(n =>
      n.matchId === m.id && n.publishedAt >= todayTs
    );
    return !existsToday;
  });

  if (newMatches.length === 0) {
    console.log('✅ Tất cả trận đã có bài hôm nay. Không sinh thêm.');
    process.exit(0);
  }

  console.log(`\n✏️  Sẽ sinh mới: ${newMatches.length} bài (đã skip ${candidates.length - newMatches.length} bài đã có sẵn)\n`);

  // 3. Generate từng bài (sequential để tránh rate limit)
  let success = 0; let failed = 0;
  for (let i = 0; i < newMatches.length; i++) {
    const m = newMatches[i];
    const tag = isPriorityLeague(m.league) ? '🔥 PRIORITY' : '';
    console.log(`\n📝 [${i+1}/${newMatches.length}] ${tag} Đang sinh: ${m.home} vs ${m.away}...`);
    try {
      const raw = await ai.generateMatchPreview(m);
      const parsed = ai.parseGeneratedArticle(raw);

      const saved = newsStore.add({
        title: parsed.title,
        excerpt: parsed.excerpt,
        content: parsed.content,
        tags: parsed.tags,
        predictedScore: parsed.predictedScore,
        image: buildImage(m),
        matchId: m.id,
        home: m.home,
        away: m.away,
        homeBadge: m.homeBadge,
        awayBadge: m.awayBadge,
        league: m.league || m.sport,
        matchTime: (m.time || '') + ' ' + (m.date || ''),
        author: 'XOSO66 TV Analyst'
      });

      console.log(`  ✅ "${saved.title}" → /tin-tuc/${saved.slug}`);
      success++;
    } catch (e) {
      console.error(`  ❌ Fail:`, e.message);
      failed++;
    }
    // Delay 2s giữa các request tránh rate limit
    if (i < newMatches.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n🎉 Hoàn tất! Thành công: ${success}, Lỗi: ${failed}`);
  console.log(`📰 Tổng bài: ${newsStore.stats().total}`);
}

main().catch(e => {
  console.error('💥 Crash:', e);
  process.exit(1);
});
