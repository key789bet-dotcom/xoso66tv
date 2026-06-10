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

// Số trận sinh bài mỗi lần chạy
const MAX_ARTICLES_PER_RUN = parseInt(process.env.NEWS_MAX || '5', 10);

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

  // Ưu tiên trận có league lớn + Soccer
  const allMatches = live.concat(upcoming).filter(m => m && m.home && m.away);
  // Dedupe theo id
  const seen = new Set();
  const candidates = allMatches.filter(m => {
    const k = m.id || (m.home + '_' + m.away);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, MAX_ARTICLES_PER_RUN);

  if (candidates.length === 0) {
    console.warn('⚠️  Không có trận nào để sinh bài. Bỏ qua.');
    process.exit(0);
  }

  console.log(`📊 Sẽ sinh bài cho ${candidates.length} trận:`);
  candidates.forEach((m, i) => console.log(`  ${i+1}. ${m.home} vs ${m.away} (${m.league || m.sport})`));

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

  // 3. Generate từng bài (sequential để tránh rate limit)
  let success = 0; let failed = 0;
  for (let i = 0; i < newMatches.length; i++) {
    const m = newMatches[i];
    console.log(`\n📝 [${i+1}/${newMatches.length}] Đang sinh: ${m.home} vs ${m.away}...`);
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
