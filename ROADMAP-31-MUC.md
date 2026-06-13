# 🚀 ROADMAP NÂNG CẤP XOSO66TV — 31 MỤC

> Cập nhật: 2026-06-13 · Estimate tổng: **6-8 tuần** · Bắt đầu: Mục 1 (SQLite)

## PHASE 1 — TĂNG TỐC NGAY (Tuần 1)
| # | Mục | Effort | Impact |
|---|---|---|---|
| 1 | Migrate JSON DB → SQLite | 1 ngày | ★★★★★ |
| 2 | Redis cho session/cache/chat | 0.5 ngày | ★★★★ |
| 3 | PM2 cluster mode 4 workers | 1 giờ | ★★★★ |
| 4 | CDN Cloudflare cho static | 1 giờ | ★★★★ |
| 5 | Image optimization (sharp + WebP) | 1 ngày | ★★★★ |

## PHASE 2 — STREAMING & MONITORING (Tuần 2-3)
| # | Mục | Effort | Impact |
|---|---|---|---|
| 6 | HLS streaming (iOS native) | 0.5 ngày | ★★★★★ |
| 7 | Adaptive bitrate 1080/720/480 | 1 ngày | ★★★★ |
| 8 | Sentry error monitoring | 2 giờ | ★★★★ |
| 9 | Prometheus + Grafana APM | 0.5 ngày | ★★★ |
| 10 | WebSocket chat (socket.io) | 1 ngày | ★★★★ |
| 11 | Service Worker cache nâng cao | 0.5 ngày | ★★★ |
| 12 | Test e2e Playwright | 1 ngày | ★★★★ |

## PHASE 3 — UX POLISH (Tuần 4)
| # | Mục | Effort | Impact |
|---|---|---|---|
| 13 | Skeleton loader | 0.5 ngày | ★★★ |
| 14 | Optimistic UI | 0.5 ngày | ★★★ |
| 15 | Mobile bottom sheet | 0.5 ngày | ★★★ |
| 16 | Picture-in-Picture | 1 giờ | ★★★ |
| 17 | Theme follow system | 30 phút | ★★ |

## PHASE 4 — BẢO MẬT (Tuần 5)
| # | Mục | Effort | Impact |
|---|---|---|---|
| 18 | Helmet.js + CSP headers | 30 phút | ★★★★ |
| 19 | Rate limit theo userId | 0.5 ngày | ★★★ |
| 20 | Cloudflare Turnstile CAPTCHA | 0.5 ngày | ★★★★ |
| 21 | CSRF protection | 0.5 ngày | ★★★★ |
| 22 | fail2ban IP block | 1 giờ | ★★★ |

## PHASE 5 — SEO & MARKETING (Tuần 6)
| # | Mục | Effort | Impact |
|---|---|---|---|
| 23 | SSR OG image dynamic | 1 ngày | ★★★ |
| 24 | Sitemap động cron 6h | 0.5 ngày | ★★★ |
| 25 | Schema.org JSON-LD | 0.5 ngày | ★★★ |
| 26 | Push notify mở rộng | 0.5 ngày | ★★ |

## PHASE 6 — INFRASTRUCTURE & GROWTH (Tuần 7-8)
| # | Mục | Effort | Impact |
|---|---|---|---|
| 27 | Tách subdomain api/static | 0.5 ngày | ★★★ |
| 28 | Backup tự động S3/B2 | 1 giờ | ★★★★★ |
| 29 | Staging environment | 0.5 ngày | ★★★★ |
| 30 | CI/CD GitHub Actions | 0.5 ngày | ★★★★ |
| 31 | Điểm danh + nhiệm vụ daily | 1 ngày | ★★★★ |

---

## QUY TẮC LÀM VIỆC

1. **Làm tuần tự** — không skip phase. Mỗi mục em sẽ:
   - Giải thích "tại sao"
   - Viết code/config
   - Hướng dẫn anh push + deploy + test
   - Đợi anh confirm pass → mục tiếp theo

2. **Mỗi mục có "rollback plan"** — nếu deploy hỏng, em chỉ rõ cách quay lại.

3. **Anh test sau mỗi mục** — không gom 5 mục push 1 lần. Phát hiện bug sớm.

4. **Nếu mục nào anh muốn skip** — báo em, em sẽ skip và đi tiếp.

---

## CHECKLIST DEPLOY MỖI MỤC

- [ ] Code đã review local
- [ ] `git push origin main`
- [ ] VPS: `git pull && pm2 restart 8`
- [ ] Hard refresh trình duyệt (Ctrl+Shift+R)
- [ ] Test core flow (login, vào phòng, chat)
- [ ] Không có lỗi trong PM2 logs (`pm2 logs 8 --lines 50`)
- [ ] Confirm em → mục tiếp theo
