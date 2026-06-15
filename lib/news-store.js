/**
 * News store - quản lý bài viết news AI sinh ra
 * Lưu vào data/news.json
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'news.json');

function load() {
  try {
    if (!fs.existsSync(FILE)) return [];
    return JSON.parse(fs.readFileSync(FILE, 'utf8') || '[]');
  } catch (e) {
    console.error('[NEWS] load fail:', e.message);
    return [];
  }
}

function save(list) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
    return true;
  } catch (e) {
    console.error('[NEWS] save fail:', e.message);
    return false;
  }
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function add(article) {
  const list = load();
  const id = article.id || ('n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
  const slug = article.slug || slugify(article.title) || id;

  const item = {
    id: id,
    slug: slug,
    title: article.title || 'Bài viết',
    excerpt: article.excerpt || '',
    content: article.content || '',  // markdown
    image: article.image || '',
    tags: article.tags || [],
    matchId: article.matchId || null,
    homeBadge: article.homeBadge || null,
    awayBadge: article.awayBadge || null,
    home: article.home || null,
    away: article.away || null,
    league: article.league || null,
    predictedScore: article.predictedScore || '',
    matchTime: article.matchTime || '',
    publishedAt: article.publishedAt || Date.now(),
    author: article.author || 'AI Phân Tích'
  };

  // Tránh trùng: nếu cùng slug đã có thì update
  const existIdx = list.findIndex(n => n.slug === slug);
  const isNew = existIdx < 0;
  if (existIdx >= 0) {
    list[existIdx] = Object.assign({}, list[existIdx], item);
  } else {
    list.unshift(item);
  }

  // Giữ tối đa 100 bài
  const trimmed = list.slice(0, 100);
  save(trimmed);

  // ════ IndexNow auto-push: bài mới → Bing/Yandex instant index ════
  if (isNew) {
    try {
      const indexNow = require('./indexnow');
      // Push: trang bài chi tiết + trang list /tin-tuc + sitemap
      indexNow.submitUrls([
        '/tin-tuc/' + slug,
        '/tin-tuc',
        '/sitemap.xml'
      ]).then(r => {
        if (r.ok) console.log('[NEWS] IndexNow ✅ pushed new article:', slug);
      }).catch(()=>{});
    } catch(e) { console.warn('[NEWS] IndexNow hook fail:', e.message); }
  }

  return item;
}

function findBySlug(slug) {
  return load().find(n => n.slug === slug) || null;
}

function findById(id) {
  return load().find(n => n.id === id) || null;
}

function listRecent(limit) {
  limit = limit || 18;
  return load().slice(0, limit);
}

function remove(id) {
  const list = load().filter(n => n.id !== id);
  save(list);
}

function stats() {
  const list = load();
  return {
    total: list.length,
    last: list[0] ? list[0].publishedAt : null,
    last_date: list[0] ? new Date(list[0].publishedAt).toLocaleString('vi-VN') : null
  };
}

module.exports = { load, save, add, findBySlug, findById, listRecent, remove, stats, slugify };
