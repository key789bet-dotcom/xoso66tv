#!/bin/bash
# ══════════════════════════════════════════════════════════════════
# SEO AUDIT SCRIPT - xoso66tv.com
# Kiểm tra toàn bộ cấu trúc SEO trên production
# Chạy: bash /var/www/xoso66tv/scripts/seo-audit.sh
# ══════════════════════════════════════════════════════════════════

SITE="https://xoso66tv.com"
PASS=0
WARN=0
FAIL=0

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  🔍 SEO AUDIT - xoso66tv.com - $(date +'%Y-%m-%d %H:%M')          ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Warm-up check: đảm bảo site đang serve (tránh false 502 sau pm2 restart)
echo "⏳ Warm-up check..."
for i in 1 2 3 4 5; do
  STATUS=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 5 "$SITE/" 2>/dev/null)
  if [ "$STATUS" = "200" ]; then
    echo "✅ Site sẵn sàng (HTTP 200) sau ${i} lần thử"
    break
  fi
  echo "  Thử $i/5: HTTP $STATUS → đợi 10s..."
  sleep 10
done
echo ""

# Helper functions
chk() {
  local status=$1
  local msg=$2
  if [ "$status" = "PASS" ]; then
    echo -e "  ✅ \033[32mPASS\033[0m | $msg"
    PASS=$((PASS+1))
  elif [ "$status" = "WARN" ]; then
    echo -e "  ⚠️  \033[33mWARN\033[0m | $msg"
    WARN=$((WARN+1))
  else
    echo -e "  ❌ \033[31mFAIL\033[0m | $msg"
    FAIL=$((FAIL+1))
  fi
}

# ─────────────────────────────────────────────────────────────────
# 1. robots.txt
# ─────────────────────────────────────────────────────────────────
echo "📋 SECTION 1: robots.txt"
ROBOTS=$(curl -sk "$SITE/robots.txt")
if echo "$ROBOTS" | grep -q "User-agent:"; then
  chk PASS "robots.txt accessible (has User-agent)"
else
  chk FAIL "robots.txt missing User-agent"
fi
if echo "$ROBOTS" | grep -q "^Allow: /"; then
  chk PASS "Allow: / present"
else
  chk FAIL "Allow: / missing → Google block tất cả!"
fi
if echo "$ROBOTS" | grep -q "Sitemap:"; then
  chk PASS "Sitemap declared in robots.txt"
else
  chk WARN "Sitemap not declared (Bing recommend)"
fi
if echo "$ROBOTS" | grep -q "Disallow: /api/"; then
  chk PASS "API endpoints disallowed"
else
  chk WARN "API endpoints exposed to crawler"
fi

# ─────────────────────────────────────────────────────────────────
# 2. sitemap.xml
# ─────────────────────────────────────────────────────────────────
echo ""
echo "📋 SECTION 2: sitemap.xml"
SITEMAP=$(curl -sk "$SITE/sitemap.xml")
URL_COUNT=$(echo "$SITEMAP" | grep -c '<loc>')
if [ $URL_COUNT -gt 50 ]; then
  chk PASS "sitemap.xml có $URL_COUNT URL (target: >50)"
elif [ $URL_COUNT -gt 10 ]; then
  chk WARN "sitemap.xml có $URL_COUNT URL (nên >50)"
else
  chk FAIL "sitemap.xml chỉ có $URL_COUNT URL"
fi
TIN_TUC=$(echo "$SITEMAP" | grep -c '/tin-tuc/')
if [ $TIN_TUC -gt 20 ]; then
  chk PASS "Sitemap có $TIN_TUC bài /tin-tuc"
else
  chk WARN "Chỉ $TIN_TUC bài /tin-tuc trong sitemap"
fi
if echo "$SITEMAP" | grep -q '<lastmod>'; then
  chk PASS "Sitemap có lastmod (freshness signal)"
else
  chk WARN "Sitemap thiếu lastmod"
fi

# ─────────────────────────────────────────────────────────────────
# 3. RSS feed
# ─────────────────────────────────────────────────────────────────
echo ""
echo "📋 SECTION 3: RSS feed"
RSS=$(curl -sk "$SITE/rss.xml")
if echo "$RSS" | grep -q '<rss version="2.0"'; then
  chk PASS "RSS 2.0 valid"
else
  chk FAIL "RSS không hợp lệ"
fi
RSS_ITEMS=$(echo "$RSS" | grep -c '<item>')
if [ $RSS_ITEMS -gt 20 ]; then
  chk PASS "RSS có $RSS_ITEMS items"
else
  chk WARN "RSS chỉ có $RSS_ITEMS items"
fi

# ─────────────────────────────────────────────────────────────────
# 4. Per-page SEO check (6 trang chính)
# ─────────────────────────────────────────────────────────────────
PAGES=(
  "/"
  "/tin-tuc"
  "/lich-phat-song"
  "/the-thao/bong-da"
  "/idol-live"
  "/su-kien"
)

for PAGE in "${PAGES[@]}"; do
  echo ""
  echo "📋 SECTION: $SITE$PAGE"
  HTML=$(curl -sk "$SITE$PAGE")
  STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "$SITE$PAGE")

  # HTTP status
  if [ "$STATUS" = "200" ]; then
    chk PASS "HTTP 200 OK"
  else
    chk FAIL "HTTP $STATUS"
    continue
  fi

  # Title length 30-65
  TITLE=$(echo "$HTML" | grep -oP '<title>[^<]+</title>' | head -1 | sed 's/<[^>]*>//g')
  TITLE_LEN=${#TITLE}
  if [ $TITLE_LEN -ge 30 ] && [ $TITLE_LEN -le 65 ]; then
    chk PASS "Title $TITLE_LEN chars OK: \"${TITLE:0:60}...\""
  elif [ $TITLE_LEN -gt 65 ]; then
    chk WARN "Title $TITLE_LEN chars (>65, Google cắt): \"${TITLE:0:60}...\""
  else
    chk WARN "Title chỉ $TITLE_LEN chars (<30 quá ngắn)"
  fi

  # Description 120-160
  DESC=$(echo "$HTML" | grep -oP '<meta name="description"[^>]+>' | head -1 | grep -oP 'content="[^"]+"' | sed 's/content="//;s/"$//')
  DESC_LEN=${#DESC}
  if [ $DESC_LEN -ge 120 ] && [ $DESC_LEN -le 165 ]; then
    chk PASS "Description $DESC_LEN chars OK"
  elif [ $DESC_LEN -gt 165 ]; then
    chk WARN "Description $DESC_LEN chars (>165, Google cắt)"
  else
    chk WARN "Description chỉ $DESC_LEN chars (<120 quá ngắn)"
  fi

  # H1 count (chỉ 1)
  H1_COUNT=$(echo "$HTML" | grep -oc '<h1[ >]')
  if [ $H1_COUNT -eq 1 ]; then
    chk PASS "1 H1 tag (chuẩn SEO)"
  elif [ $H1_COUNT -eq 0 ]; then
    chk FAIL "Không có H1 tag!"
  else
    chk WARN "$H1_COUNT H1 tags (Google nên thấy 1)"
  fi

  # Canonical URL
  if echo "$HTML" | grep -q '<link rel="canonical"'; then
    chk PASS "Canonical URL declared"
  else
    chk FAIL "Canonical URL MISSING"
  fi

  # Keywords có xoso66
  if echo "$HTML" | grep -q 'name="keywords"' && echo "$HTML" | grep -q 'xoso66'; then
    chk PASS "Keywords có 'xoso66'"
  else
    chk WARN "Keywords thiếu 'xoso66'"
  fi

  # Open Graph
  if echo "$HTML" | grep -q 'property="og:title"' && echo "$HTML" | grep -q 'property="og:image"'; then
    chk PASS "Open Graph tags complete"
  else
    chk WARN "Open Graph tags incomplete"
  fi

  # Schema JSON-LD
  SCHEMA_COUNT=$(echo "$HTML" | grep -oc 'application/ld+json')
  if [ $SCHEMA_COUNT -ge 1 ]; then
    chk PASS "$SCHEMA_COUNT JSON-LD schema blocks"
  else
    chk FAIL "Không có schema JSON-LD"
  fi

  # RSS link discovery
  if echo "$HTML" | grep -q 'rel="alternate".*application/rss'; then
    chk PASS "RSS link discovery"
  else
    chk WARN "Thiếu RSS link discovery"
  fi
done

# ─────────────────────────────────────────────────────────────────
# 5. Performance check
# ─────────────────────────────────────────────────────────────────
echo ""
echo "📋 SECTION: Performance"
LOAD_TIME=$(curl -sk -o /dev/null -w "%{time_total}" "$SITE/")
echo "  ⏱️  Trang chủ load: ${LOAD_TIME}s"
if (( $(echo "$LOAD_TIME < 2" | bc -l) )); then
  chk PASS "Load time <2s (excellent)"
elif (( $(echo "$LOAD_TIME < 4" | bc -l) )); then
  chk WARN "Load time ${LOAD_TIME}s (target <2s)"
else
  chk FAIL "Load time ${LOAD_TIME}s (quá chậm)"
fi

# Gzip
GZIP=$(curl -sk -H "Accept-Encoding: gzip" -o /dev/null -w "%{size_download}" "$SITE/")
PLAIN=$(curl -sk -o /dev/null -w "%{size_download}" "$SITE/")
if [ $GZIP -lt $PLAIN ]; then
  RATIO=$(echo "scale=0; ($PLAIN - $GZIP) * 100 / $PLAIN" | bc)
  chk PASS "Gzip enabled (giảm ${RATIO}%)"
else
  chk WARN "Gzip không hoạt động"
fi

# HSTS
if curl -skI "$SITE/" | grep -qi "strict-transport-security"; then
  chk PASS "HSTS header present"
else
  chk WARN "HSTS missing"
fi

# ─────────────────────────────────────────────────────────────────
# 6. IndexNow
# ─────────────────────────────────────────────────────────────────
echo ""
echo "📋 SECTION: IndexNow"
INDEXNOW_KEY=$(ls /var/www/xoso66tv/public/ 2>/dev/null | grep -E '^[a-f0-9]{32}\.txt$' | head -1)
if [ -n "$INDEXNOW_KEY" ]; then
  chk PASS "IndexNow key file: $INDEXNOW_KEY"
  if curl -sk "$SITE/$INDEXNOW_KEY" > /dev/null 2>&1; then
    chk PASS "IndexNow key URL accessible"
  else
    chk WARN "IndexNow key URL không truy cập được"
  fi
else
  chk WARN "IndexNow key chưa được tạo"
fi

# ─────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                       📊 KẾT QUẢ TỔNG                            ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
printf "║  ✅ PASS:  %3d                                                   ║\n" $PASS
printf "║  ⚠️  WARN:  %3d                                                   ║\n" $WARN
printf "║  ❌ FAIL:  %3d                                                   ║\n" $FAIL
TOTAL=$((PASS + WARN + FAIL))
SCORE=$((PASS * 100 / TOTAL))
printf "║  🏆 SCORE: %3d/100                                              ║\n" $SCORE
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

if [ $FAIL -gt 0 ]; then
  echo "❌ Có $FAIL lỗi NGHIÊM TRỌNG cần fix ngay"
  exit 1
elif [ $WARN -gt 5 ]; then
  echo "⚠️  Có $WARN cảnh báo, nên review"
  exit 0
else
  echo "🎉 SEO setup chuẩn! Site sẵn sàng cho Google + Bing index."
  exit 0
fi
