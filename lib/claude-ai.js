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
 * Generate bài soi kèo bóng đá
 */
async function generateMatchPreview(match) {
  const home = match.home || 'Đội nhà';
  const away = match.away || 'Đội khách';
  const league = match.league || 'giải đấu';
  const time = match.time || '';
  const date = match.date || '';

  const prompt = [
    'Bạn là chuyên gia phân tích bóng đá. Viết bài SOI KÈO + NHẬN ĐỊNH trận ' + home + ' vs ' + away + ' (' + league + ', ' + time + ' ngày ' + date + ').',
    '',
    'YÊU CẦU CỤ THỂ:',
    '- Độ dài: 700-900 từ',
    '- Phong cách: chuyên nghiệp nhưng dễ đọc, dùng từ ngữ thể thao Việt Nam',
    '- Cấu trúc CHUẨN SEO với markdown headings:',
    '  ## 📊 Phong độ gần đây',
    '  ## ⚔️ Lịch sử đối đầu',
    '  ## 👥 Đội hình dự kiến',
    '  ## 🎯 Nhận định kèo châu Á / châu Âu / Tài Xỉu',
    '  ## 🏆 Dự đoán tỉ số',
    '  ## 💡 Lời khuyên cho người chơi',
    '- Sau bài viết, trả về JSON ở cuối với format:',
    '  ```json',
    '  { "title": "...", "excerpt": "150-200 ký tự tóm tắt", "tags": ["tag1","tag2"], "predicted_score": "2-1" }',
    '  ```',
    '- Title chuẩn SEO: chứa từ khóa "nhận định + tên 2 đội + ngày"',
    '- KHÔNG nhắc đến đường link / nhà cái cụ thể (chỉ phân tích chuyên môn)',
    '',
    'BẮT ĐẦU VIẾT NGAY:'
  ].join('\n');

  return generate(prompt, { max_tokens: 2500 });
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
  if (!Array.isArray(meta.tags)) meta.tags = ['bóng đá', 'nhận định', 'soi kèo'];

  return {
    title: meta.title,
    excerpt: meta.excerpt,
    content: content,
    tags: meta.tags,
    predictedScore: meta.predicted_score || meta.predictedScore || ''
  };
}

module.exports = { generate, generateMatchPreview, parseGeneratedArticle };
