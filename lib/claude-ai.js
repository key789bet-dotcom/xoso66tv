/**
 * Claude AI wrapper - dùng để generate bài nhận định bóng đá tự động
 *
 * Cần env CLAUDE_API_KEY (set trong ecosystem.config.js hoặc .env)
 *
 * Example:
 *   const ai = require('./lib/claude-ai');
 *   const text = await ai.generate('Viết bài soi kèo MU vs Liverpool...');
 */
const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

async function generate(prompt, opts) {
  opts = opts || {};
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY chưa set trong env');
  }

  const fetchFn = (typeof fetch === 'function') ? fetch : require('node-fetch');

  const resp = await fetchFn(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      max_tokens: opts.max_tokens || 2048,
      messages: [{ role: 'user', content: prompt }],
      system: opts.system || undefined
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('Claude API error ' + resp.status + ': ' + errText.slice(0, 200));
  }

  const data = await resp.json();
  // Extract text từ response: data.content = [{type:'text', text:'...'}]
  const textBlock = (data.content || []).find(c => c.type === 'text');
  return textBlock ? textBlock.text : '';
}

/**
 * Generate bài nhận định + soi kèo bóng đá chuẩn SEO 2026
 * Keywords chính: xoso66, nhận định bóng đá, soi kèo bóng đá, dự đoán tỷ số
 */
async function generateMatchPreview(match) {
  const home = match.home || 'Đội nhà';
  const away = match.away || 'Đội khách';
  const league = match.league || 'giải đấu';
  const time = match.time || '';
  const date = match.date || '';

  const prompt = [
    'Bạn là chuyên gia bóng đá hàng đầu của XOSO66 TV. Viết bài NHẬN ĐỊNH BÓNG ĐÁ + SOI KÈO + DỰ ĐOÁN TỶ SỐ trận ' + home + ' vs ' + away + ' (' + league + ', ' + time + ' ngày ' + date + ').',
    '',
    '🎯 YÊU CẦU CHUẨN SEO 2026 — BẮT BUỘC TUÂN THỦ:',
    '',
    '1. ĐỘ DÀI: 1000-1300 từ (KHÔNG ngắn hơn 1000 từ)',
    '',
    '2. KEYWORD ĐỘ DÀY (CỰC QUAN TRỌNG — đếm chính xác):',
    '   - "nhận định bóng đá" — xuất hiện 5-7 lần TRONG NỘI DUNG',
    '   - "soi kèo bóng đá" — xuất hiện 4-6 lần TRONG NỘI DUNG',
    '   - "dự đoán tỷ số" — xuất hiện 4-5 lần TRONG NỘI DUNG',
    '   - "xoso66" hoặc "XOSO66 TV" — xuất hiện 3-5 lần TRONG NỘI DUNG (brand mention tự nhiên)',
    '   - Tên 2 đội (' + home + ', ' + away + ') — mỗi đội ít nhất 8 lần',
    '',
    '3. CẤU TRÚC HEADING CHUẨN SEO (BẮT BUỘC dùng đúng các H2 sau):',
    '   ## 📊 Phong độ thi đấu - ' + home + ' vs ' + away,
    '   ## ⚔️ Lịch sử đối đầu (Head to Head)',
    '   ## 👥 Đội hình dự kiến và phân tích chiến thuật',
    '   ## 🎯 Soi kèo bóng đá ' + home + ' vs ' + away + ' - Châu Á, Châu Âu, Tài Xỉu',
    '   ## 🏆 Dự đoán tỷ số chính xác ' + home + ' vs ' + away,
    '   ## 💡 Nhận định bóng đá tổng quan - Kết luận từ chuyên gia XOSO66',
    '   ## 📺 Xem trực tiếp ' + home + ' vs ' + away + ' miễn phí tại XOSO66 TV',
    '',
    '4. ĐOẠN MỞ ĐẦU (intro 80-120 từ):',
    '   - Câu đầu PHẢI chứa "nhận định bóng đá" + tên 2 đội + ngày',
    '   - Câu thứ 2 PHẢI chứa "soi kèo bóng đá" + giải đấu',
    '   - Có nhắc XOSO66 TV (kênh nhận định)',
    '',
    '5. ĐOẠN CUỐI (kết luận):',
    '   - Phải chốt rõ "dự đoán tỷ số: X-Y"',
    '   - Nhắc "soi kèo bóng đá tại XOSO66 TV" như CTA',
    '',
    '6. PHONG CÁCH — VIẾT NHƯ CHUYÊN GIA THẬT, KHÔNG NHƯ AI:',
    '   ✅ NÊN: Có quan điểm cá nhân rõ ràng (ví dụ: "Tôi tin rằng...", "Theo tôi đánh giá...")',
    '   ✅ NÊN: Đưa ra prediction CỤ THỂ + tỉ số dứt khoát (không nói "rất khó nói", "50-50")',
    '   ✅ NÊN: Dẫn chứng số liệu cụ thể (ghi bao nhiêu bàn 5 trận gần nhất, %win)',
    '   ✅ NÊN: Sử dụng từ thể thao VN: "đôi chân vàng", "linh hồn hàng tiền vệ", "máy quét", "phá lưới", "kèo nặng", "kèo nhẹ", "vỡ trận"',
    '   ✅ NÊN: Nhắc tên cầu thủ ngôi sao + HLV (ví dụ: "Klopp", "Pep Guardiola", "Salah")',
    '   ✅ NÊN: Mỗi đoạn 3-4 câu, đa dạng độ dài câu (có câu ngắn 5 từ, có câu dài 25 từ)',
    '',
    '   ❌ TRÁNH (AI-typical phrases — TUYỆT ĐỐI KHÔNG dùng):',
    '   - "phong độ ổn định", "đối đầu cân bằng", "trận đấu hấp dẫn"',
    '   - "cả hai đội đều có cơ hội", "thực lực ngang nhau", "khó dự đoán"',
    '   - "trong bối cảnh", "không thể phủ nhận", "đáng chú ý là"',
    '   - "đa chiều", "toàn diện", "cân nhắc kỹ lưỡng"',
    '   - Phrases trống rỗng kiểu "đây là trận đấu quan trọng"',
    '',
    '7. KHÔNG được làm:',
    '   - KHÔNG nhắc nhà cái cụ thể (188bet, w88, bk8...)',
    '   - KHÔNG chèn link ngoài',
    '   - KHÔNG dùng emoji ngoài các heading',
    '   - KHÔNG dùng từ "rõ ràng", "đáng kể", "đáng chú ý" (AI flag)',
    '',
    '8. SAU BÀI VIẾT, trả về JSON ở CUỐI (trong code block ```json...```):',
    '   {',
    '     "title": "Nhận định bóng đá ' + home + ' vs ' + away + ' ' + date + ' - Soi kèo & Dự đoán tỷ số chính xác",',
    '     "excerpt": "150-200 ký tự tóm tắt CHỨA cả 3 keyword chính",',
    '     "tags": ["nhận định bóng đá", "soi kèo bóng đá", "dự đoán tỷ số", "xoso66", "' + home.toLowerCase() + '", "' + away.toLowerCase() + '", "' + league.toLowerCase() + '"],',
    '     "predicted_score": "X-Y",',
    '     "meta_description": "150-160 ký tự CHỨA \\"nhận định bóng đá ' + home + ' vs ' + away + '\\" + \\"soi kèo bóng đá\\" + \\"dự đoán tỷ số\\" + XOSO66 TV"',
    '   }',
    '',
    'BẮT ĐẦU VIẾT NGAY (intro → 7 H2 sections → JSON cuối):'
  ].join('\n');

  return generate(prompt, { max_tokens: 4000 });
}

/**
 * Parse output Claude thành { title, content, excerpt, tags, predictedScore }
 */
function parseGeneratedArticle(rawText) {
  let meta = {};
  // Thử 1: JSON trong code block ```json ... ```
  let jsonMatch = rawText.match(/```json\s*([\s\S]+?)\s*```/);
  // Thử 2: JSON trong code block ``` (không có tag json)
  if (!jsonMatch) jsonMatch = rawText.match(/```\s*(\{[\s\S]+?\})\s*```/);
  // Thử 3: tìm JSON object trần ở cuối bài (regex match {...} có "title" hoặc "predicted_score")
  if (!jsonMatch) {
    const m = rawText.match(/\{[\s\S]*?"(?:title|predicted_score|predictedScore|excerpt)"[\s\S]*?\}/);
    if (m) jsonMatch = [m[0], m[0]];
  }
  if (jsonMatch) {
    try { meta = JSON.parse(jsonMatch[1] || jsonMatch[0]); } catch(e) { /* ignore */ }
  }

  // Bỏ block JSON khỏi content (cả 3 case)
  let content = rawText
    .replace(/```json[\s\S]+?```/g, '')
    .replace(/```\s*\{[\s\S]+?\}\s*```/g, '')
    .trim();
  // Bỏ JSON trần nếu có ở cuối
  if (meta.title || meta.predicted_score) {
    content = content.replace(/\{[\s\S]*?"(?:title|predicted_score|predictedScore|excerpt)"[\s\S]*?\}\s*$/, '').trim();
  }

  // Nếu chưa có title, lấy line đầu # heading hoặc 60 ký tự đầu
  if (!meta.title) {
    const h1 = content.match(/^#\s+(.+)$/m);
    meta.title = h1 ? h1[1].trim() : content.split('\n')[0].slice(0, 80);
  }
  if (!meta.excerpt) {
    const txt = content.replace(/[#*`>\-_]/g, '').replace(/\n+/g, ' ').trim();
    meta.excerpt = txt.slice(0, 180) + (txt.length > 180 ? '...' : '');
  }
  // Tags chuẩn keyword SEO 2026 (4 keyword chính)
  if (!Array.isArray(meta.tags) || meta.tags.length === 0) {
    meta.tags = ['nhận định bóng đá', 'soi kèo bóng đá', 'dự đoán tỷ số', 'xoso66'];
  } else {
    // Đảm bảo có 4 keyword chính
    const required = ['nhận định bóng đá', 'soi kèo bóng đá', 'dự đoán tỷ số', 'xoso66'];
    required.forEach(function(k){
      if (meta.tags.indexOf(k) === -1) meta.tags.unshift(k);
    });
  }
  // Meta description fallback: cắt từ excerpt + thêm keyword nếu thiếu
  if (!meta.meta_description) {
    let md = meta.excerpt;
    if (md.toLowerCase().indexOf('xoso66') === -1) md += ' Xem tại XOSO66 TV.';
    meta.meta_description = md.slice(0, 160);
  }

  return {
    title: meta.title,
    excerpt: meta.excerpt,
    metaDescription: meta.meta_description,
    content: content,
    tags: meta.tags,
    predictedScore: meta.predicted_score || meta.predictedScore || ''
  };
}

/**
 * Generate match preview RICH — feed ODDS THẬT + Insights vào prompt
 * → Claude viết bài sâu hơn, có số liệu cụ thể, dự đoán dựa odds bookmaker
 *
 * @param {Object} match - { home, away, league, time, date }
 * @param {Object} odds  - { ah: {line, homeOdds, awayOdds, bookmaker}, ou: {...}, x12: {...} }
 * @param {Object} insights - { formHome: ['W','D',...], formAway: [...], h2h: [...], prob: {...}, pick: {...} }
 */
async function generateMatchPreviewWithOdds(match, odds, insights) {
  const home = match.home || 'Đội nhà';
  const away = match.away || 'Đội khách';
  const league = match.league || 'giải đấu';
  const time = match.time || '';
  const date = match.date || '';

  // Build context block với data thật
  const ctxLines = ['📊 DỮ LIỆU THẬT TỪ BOOKMAKER + AI (BẮT BUỘC TÍCH HỢP VÀO BÀI):', ''];
  if (odds && odds.x12) {
    ctxLines.push('• Tỉ lệ 1X2 (' + (odds.x12.bookmaker || 'bookmaker') + '): ' +
      home + ' thắng ' + odds.x12.home + ' · Hòa ' + odds.x12.draw + ' · ' + away + ' thắng ' + odds.x12.away);
  }
  if (odds && odds.ah) {
    const fav = odds.ah.line < 0 ? home : (odds.ah.line > 0 ? away : 'Kèo cân');
    const lineAbs = Math.abs(odds.ah.line);
    ctxLines.push('• Kèo Châu Á (' + (odds.ah.bookmaker || 'bookmaker') + '): ' + fav + ' chấp ' + lineAbs +
      ' · Đặt ' + home + ': ' + odds.ah.homeOdds + ' · Đặt ' + away + ': ' + odds.ah.awayOdds);
  }
  if (odds && odds.ou) {
    ctxLines.push('• Tài Xỉu (' + (odds.ou.bookmaker || 'bookmaker') + '): Mốc ' + odds.ou.line +
      ' · TÀI ' + odds.ou.taiOdds + ' · XỈU ' + odds.ou.xiuOdds);
  }
  if (insights && insights.formHome && insights.formHome.length) {
    ctxLines.push('• Phong độ 5 trận gần ' + home + ': ' + insights.formHome.join('-'));
  }
  if (insights && insights.formAway && insights.formAway.length) {
    ctxLines.push('• Phong độ 5 trận gần ' + away + ': ' + insights.formAway.join('-'));
  }
  if (insights && insights.h2h && insights.h2h.length) {
    ctxLines.push('• Đầu đối đầu gần nhất:');
    insights.h2h.slice(0, 5).forEach(h => {
      ctxLines.push('  - ' + h.date + ': ' + h.home + ' ' + h.score + ' ' + h.away);
    });
    const avgGoals = insights.h2h.reduce((s, h) => {
      const [a, b] = h.score.split('-').map(Number);
      return s + (isNaN(a) || isNaN(b) ? 0 : a + b);
    }, 0) / insights.h2h.length;
    ctxLines.push('  → TB ' + avgGoals.toFixed(1) + ' bàn/trận');
  }
  if (insights && insights.prob) {
    ctxLines.push('• Xác suất công bằng (loại margin): ' +
      home + ' ' + Math.round(insights.prob.home * 100) + '% · ' +
      'Hòa ' + Math.round(insights.prob.draw * 100) + '% · ' +
      away + ' ' + Math.round(insights.prob.away * 100) + '%');
  }
  if (insights && insights.pick && (insights.pick.ah || insights.pick.ou)) {
    const pickLines = [];
    if (insights.pick.ou) pickLines.push('TÀI/XỈU: ' + (insights.pick.ou === 'tai' ? 'TÀI' : 'XỈU'));
    if (insights.pick.ah) pickLines.push('KÈO CHẤP: ' + (insights.pick.ah === 'home' ? home : away));
    ctxLines.push('• Smart Pick AI: ' + pickLines.join(' + ') + ' (tin cậy: ' + insights.pick.confidence + ')');
  }
  ctxLines.push('');
  ctxLines.push('YÊU CẦU: Phải tích hợp ÍT NHẤT 5 con số cụ thể từ data trên vào bài. Phân tích sâu kèo Châu Á + Tài Xỉu dựa vào odds thật.');
  ctxLines.push('');

  const prompt = [
    'Bạn là chuyên gia bóng đá hàng đầu của XOSO66 TV. Viết bài NHẬN ĐỊNH BÓNG ĐÁ + SOI KÈO + DỰ ĐOÁN TỶ SỐ trận ' + home + ' vs ' + away + ' (' + league + ', ' + time + ' ngày ' + date + ').',
    '',
    ctxLines.join('\n'),
    '',
    '🎯 YÊU CẦU SEO + ĐỘ DÀI (giống chuẩn cũ):',
    '   - 1000-1300 từ, có 7 H2 sections',
    '   - Keyword density: "nhận định bóng đá" 5-7 lần, "soi kèo bóng đá" 4-6 lần, "dự đoán tỷ số" 4-5 lần, "xoso66" 3-5 lần',
    '   - Phân tích phải DỰA TRÊN odds bookmaker + form thật, không nói chung chung',
    '   - Dự đoán tỷ số cuối phải HỢP LÝ với mốc Tài/Xỉu (vd: nếu mốc 2.5, tỷ số 2-1 hoặc 3-0)',
    '',
    'CẤU TRÚC H2:',
    '   ## 📊 Phong độ thi đấu - ' + home + ' vs ' + away,
    '   ## ⚔️ Lịch sử đối đầu (Head to Head) — TRÍCH DẪN data H2H ở trên',
    '   ## 👥 Đội hình dự kiến và phân tích chiến thuật',
    '   ## 🎯 Soi kèo bóng đá ' + home + ' vs ' + away + ' - Châu Á, Châu Âu, Tài Xỉu — PHẢI nhắc odds cụ thể từ bookmaker',
    '   ## 🏆 Dự đoán tỷ số chính xác ' + home + ' vs ' + away,
    '   ## 💡 Nhận định bóng đá tổng quan - Kết luận từ chuyên gia XOSO66',
    '   ## 📺 Xem trực tiếp ' + home + ' vs ' + away + ' miễn phí tại XOSO66 TV',
    '',
    'CẤM:',
    '   - KHÔNG nhắc nhà cái cụ thể (188bet, w88, bk8, Bet365, Pinnacle...) — chỉ nói "bookmaker quốc tế"',
    '   - KHÔNG dùng "phong độ ổn định", "cả hai đội đều", "khó dự đoán"',
    '',
    'CUỐI BÀI trả JSON (```json...```):',
    '   {',
    '     "title": "Nhận định bóng đá ' + home + ' vs ' + away + ' ' + date + ' - Soi kèo & Dự đoán tỷ số chính xác",',
    '     "excerpt": "150-200 ký tự tóm tắt",',
    '     "tags": ["nhận định bóng đá","soi kèo bóng đá","dự đoán tỷ số","xoso66","' + home.toLowerCase() + '","' + away.toLowerCase() + '","' + league.toLowerCase() + '"],',
    '     "predicted_score": "X-Y",',
    '     "meta_description": "150-160 ký tự"',
    '   }',
    '',
    'BẮT ĐẦU VIẾT NGAY:'
  ].join('\n');

  return generate(prompt, { max_tokens: 4500 });
}

module.exports = { generate, generateMatchPreview, generateMatchPreviewWithOdds, parseGeneratedArticle };
