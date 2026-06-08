const express = require('express');
const api     = require('../lib/api');
const router  = express.Router();

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
