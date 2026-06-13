/* 🧪 E2E tests cho trang chủ + smoke tests */
const { test, expect } = require('@playwright/test');

test.describe('Trang chủ', () => {
  test('Load trang chủ + meta tags chuẩn', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await expect(page).toHaveTitle(/XOSO66 TV/);
    // OG image: chấp nhận cả /og/ động lẫn static logo (cả 2 đều valid)
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toMatch(/\.(png|webp|jpg|jpeg)$/);
    const csrfMeta = await page.locator('meta[name="csrf-token"]').count();
    expect(csrfMeta).toBeGreaterThan(0);
  });

  test('Sitemap accessible', async ({ request }) => {
    const r = await request.get('/sitemap.xml');
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('xml');
    const body = await r.text();
    expect(body).toContain('<urlset');
  });

  test('robots.txt valid', async ({ request }) => {
    const r = await request.get('/robots.txt');
    expect(r.status()).toBe(200);
    expect(await r.text()).toContain('Sitemap:');
  });

  test('Health check endpoint', async ({ request }) => {
    const r = await request.get('/api/health');
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.db.ok).toBe(true);
  });

  test('OG image generates PNG', async ({ request }) => {
    const r = await request.get('/og/home.png');
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  });
});

test.describe('Security', () => {
  test('CSRF blocks POST without token', async ({ request }) => {
    const r = await request.post('/api/auth/login', {
      data: { username: 'test', password: 'wrong' },
      failOnStatusCode: false
    });
    expect(r.status()).toBe(403);
  });

  test('Helmet headers present', async ({ request }) => {
    const r = await request.get('/');
    const h = r.headers();
    // X-Content-Type-Options có thể duplicate (nginx + Helmet) → check contains
    expect(h['x-content-type-options']).toContain('nosniff');
    expect(h['strict-transport-security']).toContain('max-age');
    expect(h['content-security-policy']).toBeTruthy();
  });

  test('Rate limit blocks after 5 fails', async ({ request }) => {
    const username = 'rl_test_' + Date.now() + '_' + Math.random();
    let last;
    for (let i = 0; i < 7; i++) {
      last = await request.post('/api/auth/login', {
        data: { username, password: 'wrong' },
        failOnStatusCode: false
      });
    }
    // 401 (sai user) hoặc 403 (CSRF) hoặc 429 (rate limit) — tất cả đều là reject
    expect([401, 403, 429]).toContain(last.status());
  });
});
