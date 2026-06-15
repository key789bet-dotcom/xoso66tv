const express = require('express');
const api     = require('../lib/api');
const newsStore = require('../lib/news-store');
const router  = express.Router();

// ════ RSS 2.0 feed cho tin tức ════
// Submit URL này lên Google News Publisher Center, Feedly, Inoreader để discover bài mới
router.get('/rss.xml', function (req, res) {
  try {
    const SITE = req.app.get('siteUrl') || ('https://' + req.headers.host);
    const items = newsStore.listRecent(30);
    function esc(s) {
      return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }
    function rfc822(d) { try { return new Date(d).toUTCString(); } catch(e) { return new Date().toUTCString(); } }

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">\n';
    xml += '<channel>\n';
    xml += '<title>XOSO66 TV - Nhận Định Bóng Đá &amp; Tin Tức Thể Thao</title>\n';
    xml += '<link>' + SITE + '/</link>\n';
    xml += '<atom:link href="' + SITE + '/rss.xml" rel="self" type="application/rss+xml" />\n';
    xml += '<description>Nhận định bóng đá hôm nay, dự đoán tỉ số chính xác, tin tức thể thao cập nhật liên tục tại XOSO66 TV (xổ số 66).</description>\n';
    xml += '<language>vi-VN</language>\n';
    xml += '<copyright>Copyright ' + new Date().getFullYear() + ' XOSO66 TV</copyright>\n';
    xml += '<lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>\n';
    xml += '<ttl>60</ttl>\n';
    xml += '<image><url>' + SITE + '/static/img/logoxoso66tv.webp</url><title>XOSO66 TV</title><link>' + SITE + '/</link></image>\n';

    items.forEach(function (n) {
      const url = SITE + '/tin-tuc/' + (n.slug || n.id);
      xml += '<item>\n';
      xml += '<title>' + esc(n.title) + '</title>\n';
      xml += '<link>' + url + '</link>\n';
      xml += '<guid isPermaLink="true">' + url + '</guid>\n';
      xml += '<pubDate>' + rfc822(n.publishedAt) + '</pubDate>\n';
      xml += '<dc:creator>' + esc(n.author || 'XOSO66 TV') + '</dc:creator>\n';
      xml += '<description>' + esc(n.excerpt || '') + '</description>\n';
      if (n.image) {
        xml += '<enclosure url="' + esc(n.image) + '" type="image/jpeg" />\n';
      }
      (n.tags || []).forEach(function (t) {
        xml += '<category>' + esc(t) + '</category>\n';
      });
      xml += '</item>\n';
    });

    xml += '</channel>\n</rss>\n';
    res.type('application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600');  // 10p cache
    res.send(xml);
  } catch (e) {
    console.error('[RSS] error:', e.message);
    res.status(500).type('text/plain').send('RSS generation error');
  }
});

// ════ IndexNow verify endpoint (file <key>.txt đã được serve qua public/) ════
// Bing/Yandex verify key location — endpoint này chỉ để debug
router.get('/indexnow-status', function (req, res) {
  try {
    const indexNow = require('../lib/indexnow');
    res.json({
      ok: true,
      key: indexNow.getKey(),
      keyLocation: indexNow.getKeyLocation(),
      endpoint: 'https://api.indexnow.org/IndexNow'
    });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

// ════ Admin: manually push URLs to IndexNow ════
router.post('/admin/api/indexnow/push', express.json(), function (req, res) {
  // Bảo mật đơn giản: chỉ chấp nhận từ localhost hoặc có admin secret
  const isLocal = ['127.0.0.1','::1','::ffff:127.0.0.1'].indexOf(req.ip) >= 0;
  const secret = req.headers['x-admin-secret'];
  if (!isLocal && secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ ok:false, error:'Forbidden' });
  }
  try {
    const indexNow = require('../lib/indexnow');
    const urls = req.body.urls || [];
    indexNow.submitUrls(urls).then(r => res.json(r));
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});


router.get('/robots.txt', function (req, res) {
  const SITE = req.app.get('siteUrl') || ('http://' + req.headers.host);
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /dang-nhap',
    'Disallow: /quen-mat-khau',
    'Disallow: /profile',
    'Disallow: /admin',
    '',
    'Sitemap: ' + SITE + '/sitemap.xml'
  ].join('\n'));
});

router.get('/sitemap.xml', async function (req, res) {
  const SITE = req.app.get('siteUrl') || ('http://' + req.headers.host);
  const now = new Date().toISOString();
  const urls = [
    { loc:'/', priority:1.0, freq:'always' },
    { loc:'/lich-phat-song', priority:0.9, freq:'hourly' },
    { loc:'/video-noi-bat', priority:0.8, freq:'daily' },
    { loc:'/tin-tuc', priority:0.8, freq:'hourly' },
    { loc:'/su-kien', priority:0.7, freq:'daily' },
    { loc:'/qua-tang', priority:0.6, freq:'weekly' },
    { loc:'/mini-game', priority:0.6, freq:'weekly' },
    { loc:'/casino', priority:0.7, freq:'weekly' },
    { loc:'/idol-live', priority:0.7, freq:'weekly' },
    { loc:'/esports', priority:0.7, freq:'daily' },
    { loc:'/dang-ky', priority:0.5, freq:'monthly' },
    { loc:'/gioi-thieu',           priority:0.6, freq:'monthly' },
    { loc:'/lien-he',              priority:0.5, freq:'monthly' },
    { loc:'/chinh-sach-bao-mat',   priority:0.4, freq:'yearly' },
    { loc:'/chinh-sach-bien-tap',  priority:0.6, freq:'monthly' },
    { loc:'/thoa-thuan-phat-song', priority:0.4, freq:'yearly' },
    { loc:'/dieu-khoan-su-dung',   priority:0.4, freq:'yearly' }
  ];
  Object.keys(api.CATEGORIES).forEach(function (k) {
    if (!api.CATEGORIES[k].partnerOnly && k !== 'hot' && k !== 'esports') {
      urls.push({ loc:'/the-thao/' + k, priority:0.8, freq:'daily' });
    }
  });
  try {
    const up = await api.getUpcomingStreams(null, 50);
    up.forEach(function (m) {
      urls.push({
        loc:'/live/' + (m.slug || m.id),
        priority:0.85, freq:'hourly',
        lastmod: m.matchTs ? new Date(m.matchTs).toISOString() : now
      });
    });
  } catch (e) {}

  // 📰 Thêm bài tin tức/nhận định bóng đá (AI generate) — quan trọng cho SEO
  try {
    const articles = newsStore.listRecent(100);
    articles.forEach(function (n) {
      urls.push({
        loc:'/tin-tuc/' + (n.slug || n.id),
        priority:0.75, freq:'weekly',
        lastmod: n.publishedAt ? new Date(n.publishedAt).toISOString() : now
      });
    });
  } catch (e) { console.warn('[sitemap] news fail:', e.message); }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  urls.forEach(function (u) {
    xml += '  <url><loc>' + SITE + u.loc + '</loc>';
    xml += '<lastmod>' + (u.lastmod || now) + '</lastmod>';
    xml += '<changefreq>' + u.freq + '</changefreq>';
    xml += '<priority>' + u.priority + '</priority></url>\n';
  });
  xml += '</urlset>';
  res.type('application/xml').send(xml);
});

module.exports = router;
