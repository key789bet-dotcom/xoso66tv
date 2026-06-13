/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ SCHEMA.ORG JSON-LD — Mục 25                                  ║
 * ║                                                                ║
 * ║ Generate JSON-LD structured data cho Google rich results:     ║
 * ║   - Organization (toàn site)                                   ║
 * ║   - WebSite + SearchAction (toàn site)                         ║
 * ║   - BreadcrumbList (mỗi trang con)                            ║
 * ║   - VideoObject + BroadcastEvent (trang /live, /idol)         ║
 * ║   - ItemList (trang chủ list cards)                            ║
 * ║   - Article + NewsArticle (trang tin tức)                     ║
 * ║   - SportsEvent (trận đấu)                                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const SITE_URL = process.env.SITE_URL || 'https://xoso66tv.com';
const ORG_NAME = 'XOSO66 TV';
const ORG_LOGO = SITE_URL + '/static/img/logoxoso66tv.webp';

// ─── Helper: render JSON-LD trong <script> tag ───
function renderTag(obj) {
  // Compact JSON (no pretty-print) cho size nhỏ + tránh XSS qua newline
  const json = JSON.stringify(obj).replace(/<\/script/gi, '<\\/script');
  return '<script type="application/ld+json">' + json + '</script>';
}

// ─── Organization schema (toàn site, include vào head) ───
function organization() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': SITE_URL + '#organization',
    name: ORG_NAME,
    alternateName: 'XOSO66',
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: ORG_LOGO,
      width: 512,
      height: 512
    },
    sameAs: [
      'https://facebook.com/xoso66tv',
      'https://youtube.com/@xoso66tv',
      'https://tiktok.com/@xoso66tv'
    ]
  };
}

// ─── WebSite + SearchAction (cho phép Google search box) ───
function website() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': SITE_URL + '#website',
    name: ORG_NAME,
    url: SITE_URL,
    publisher: { '@id': SITE_URL + '#organization' },
    inLanguage: 'vi-VN',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: SITE_URL + '/tim-kiem?q={search_term_string}'
      },
      'query-input': 'required name=search_term_string'
    }
  };
}

// ─── BreadcrumbList (cho trang con) ───
function breadcrumb(items) {
  // items = [{ name: 'Home', url: '/' }, { name: 'Live', url: '/live/abc' }]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(function(item, i) {
      return {
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        item: item.url.startsWith('http') ? item.url : SITE_URL + item.url
      };
    })
  };
}

// ─── VideoObject + BroadcastEvent (trang /live, /idol) ───
function liveStream(opts) {
  // opts = { title, description, thumbnail, streamUrl, startTime, isLiveNow }
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: opts.title,
    description: opts.description || opts.title,
    thumbnailUrl: opts.thumbnail || ORG_LOGO,
    uploadDate: opts.startTime ? new Date(opts.startTime).toISOString() : new Date().toISOString(),
    contentUrl: opts.contentUrl || SITE_URL,
    embedUrl: opts.embedUrl || SITE_URL,
    publisher: { '@id': SITE_URL + '#organization' },
    inLanguage: 'vi-VN'
  };
  if (opts.isLiveNow) {
    obj.publication = {
      '@type': 'BroadcastEvent',
      isLiveBroadcast: true,
      startDate: opts.startTime ? new Date(opts.startTime).toISOString() : new Date().toISOString(),
      endDate: opts.endTime ? new Date(opts.endTime).toISOString() : undefined
    };
  }
  return obj;
}

// ─── SportsEvent (trận đấu) ───
function sportsEvent(opts) {
  // opts = { name, sport, startDate, status, homeTeam, awayTeam, league, url }
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: opts.name,
    sport: opts.sport || 'Football',
    startDate: opts.startDate ? new Date(opts.startDate).toISOString() : undefined,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: {
      '@type': 'VirtualLocation',
      url: opts.url || SITE_URL
    },
    competitor: [
      opts.homeTeam ? { '@type': 'SportsTeam', name: opts.homeTeam } : null,
      opts.awayTeam ? { '@type': 'SportsTeam', name: opts.awayTeam } : null
    ].filter(Boolean),
    superEvent: opts.league ? {
      '@type': 'SportsEvent',
      name: opts.league
    } : undefined
  };
}

// ─── ItemList (cho trang chủ list cards) ───
function itemList(items, listName) {
  // items = [{ name, url, image, position }]
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName || 'Live Streams',
    numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map(function(item, i) {
      return {
        '@type': 'ListItem',
        position: i + 1,
        url: item.url.startsWith('http') ? item.url : SITE_URL + item.url,
        name: item.name,
        image: item.image
      };
    })
  };
}

// ─── NewsArticle (trang /tin-tuc/*) ───
function newsArticle(opts) {
  // opts = { title, description, image, publishedAt, author, url, body }
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: opts.title,
    description: opts.description || opts.title,
    image: opts.image || ORG_LOGO,
    datePublished: opts.publishedAt ? new Date(opts.publishedAt).toISOString() : new Date().toISOString(),
    dateModified: opts.modifiedAt ? new Date(opts.modifiedAt).toISOString() : (opts.publishedAt ? new Date(opts.publishedAt).toISOString() : new Date().toISOString()),
    author: {
      '@type': 'Organization',
      name: opts.author || ORG_NAME
    },
    publisher: { '@id': SITE_URL + '#organization' },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': opts.url || SITE_URL
    },
    inLanguage: 'vi-VN'
  };
}

// ─── Render multiple schemas vào 1 array (Google chấp nhận) ───
function renderAll(schemas) {
  if (!schemas || !schemas.length) return '';
  // Filter null/undefined
  const valid = schemas.filter(Boolean);
  if (valid.length === 0) return '';
  if (valid.length === 1) return renderTag(valid[0]);
  return renderTag(valid);  // array of schemas in one tag
}

module.exports = {
  organization, website, breadcrumb,
  liveStream, sportsEvent, itemList,
  newsArticle, renderTag, renderAll,
  SITE_URL, ORG_NAME, ORG_LOGO
};
