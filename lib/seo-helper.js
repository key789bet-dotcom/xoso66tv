/**
 * Tinh toan cac bien SEO tu res.locals.seo + brand + path.
 * Goi tu cac EJS partial:  <% const v = computeSeo() %>
 */
module.exports = function makeComputeSeo(brand, partner, siteUrl, path, seo) {
  return function () {
    const s = seo || {};
    const title = s.title || (brand.name + ' - ' + brand.tagline);
    const desc  = s.description || ('Xem truc tiep the thao - casino - idol live 24/7 tai ' + brand.name + '. Doi tac chinh thuc ' + brand.domain + '.');
    const keys  = s.keywords || ('xem bong da truc tiep, livescore, casino, idol live, ' + brand.short + ', xoso66tv');
    const site  = siteUrl || ('https://www.' + brand.domain);
    const url   = site + (path || '/');
    const canon = s.canonical ? site + s.canonical : url;
    const img   = s.ogImage || (site + '/static/img/og-default.jpg');
    return {
      title:    title,
      desc:     desc,
      keys:     keys,
      site:     site,
      url:      url,
      canon:    canon,
      img:      img,
      ogType:   s.ogType || 'website',
      noindex:  !!s.noindex,
      crumbs:   s.breadcrumb || [],
      orgName:  brand.name,
      partner:  partner,
      jsonld:   s.jsonld || null
    };
  };
};
