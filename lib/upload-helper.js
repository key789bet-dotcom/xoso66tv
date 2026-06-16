/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ UPLOAD HELPER - SEO filename + auto compress + resize             ║
 * ║                                                                    ║
 * ║ Functions:                                                         ║
 * ║   - seoFilename(parts[], ext)  → 'real-colorado-foxes-vs-...jpg'  ║
 * ║   - compressAndSave(buf, dir, name, opts) → optimize + write file ║
 * ║                                                                    ║
 * ║ Strategy:                                                          ║
 * ║   - Slugify Vietnamese diacritics → ASCII                          ║
 * ║   - Sharp: resize maxWidth + auto-rotate + WebP/JPEG/PNG optimize ║
 * ║   - Quality 82, progressive JPEG, mozjpeg encoder                  ║
 * ║   - Skip GIF (animation broken)                                    ║
 * ╚══════════════════════════════════════════════════════════════════*/

const fs = require('fs');
const path = require('path');
let sharp = null;
try { sharp = require('sharp'); } catch(e) { console.warn('[UPLOAD] sharp not installed'); }

/**
 * Tạo SEO-friendly slug từ chuỗi tiếng Việt
 * Vd: "Real Colorado Foxes vs Unión Villa Krause" → "real-colorado-foxes-vs-union-villa-krause"
 */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // bỏ dấu Việt/Tây Ban Nha
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')                       // ký tự khác → dấu -
    .replace(/^-+|-+$/g, '')                           // trim dấu - đầu/cuối
    .slice(0, 60);                                      // max 60 chars
}

/**
 * Tạo filename SEO-friendly từ các parts.
 * @param {string[]} parts - vd ['real-colorado', 'vs', 'union-villa', '2026-06-16']
 * @param {string} ext - 'jpg' / 'png' / 'webp'
 * @returns {string} - 'real-colorado-vs-union-villa-2026-06-16-a1b2c3.jpg'
 */
function seoFilename(parts, ext) {
  ext = String(ext || 'jpg').toLowerCase().replace(/^\./, '').replace('jpeg', 'jpg');
  const slug = (parts || []).filter(Boolean).map(slugify).filter(Boolean).join('-').slice(0, 80);
  const stamp = Date.now().toString(36).slice(-6);  // 6 chars unique để tránh duplicate
  const base = slug || 'image';
  return base + '-' + stamp + '.' + ext;
}

/**
 * Compress + resize ảnh bằng sharp + ghi vào disk.
 * Tự fallback ghi raw buffer nếu sharp fail.
 *
 * @param {Buffer} buffer - buffer ảnh gốc (từ multer memoryStorage)
 * @param {string} dir - thư mục đích
 * @param {string} filename - tên file (vd 'real-colorado-vs-union-a1b2c3.jpg')
 * @param {object} opts - { maxWidth: 1600, quality: 82, convertToWebp: false }
 * @returns {Promise<{url, size, savedPercent}>}
 */
async function compressAndSave(buffer, dir, filename, opts) {
  opts = opts || {};
  const maxWidth = opts.maxWidth || 1600;
  const quality = opts.quality || 82;

  const originalSize = buffer.length;
  let outBuffer = buffer;
  let savedPercent = 0;

  if (sharp) {
    const ext = path.extname(filename).toLowerCase().replace('.', '').replace('jpeg', 'jpg');
    if (/^(jpg|png|webp)$/.test(ext)) {
      try {
        let pipeline = sharp(buffer, { failOn: 'none' })
          .rotate()
          .resize({ width: maxWidth, withoutEnlargement: true, fit: 'inside' });

        if (ext === 'jpg') {
          pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true });
        } else if (ext === 'png') {
          pipeline = pipeline.png({ quality, compressionLevel: 9, palette: true, effort: 7 });
        } else if (ext === 'webp') {
          pipeline = pipeline.webp({ quality, effort: 4 });
        }
        const compressed = await pipeline.toBuffer();
        // Chỉ dùng nếu nhỏ hơn ít nhất 5%
        if (compressed.length < originalSize * 0.95) {
          outBuffer = compressed;
          savedPercent = Math.round((1 - compressed.length / originalSize) * 100);
        }
      } catch (e) {
        console.warn('[UPLOAD] compress fail:', e.message, '→ dùng raw');
      }
    }
  }

  // Ghi atomic: tmp → rename
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, filename);
  const tmp = filepath + '.tmp';
  fs.writeFileSync(tmp, outBuffer);
  fs.renameSync(tmp, filepath);

  if (savedPercent > 0) {
    console.log('[UPLOAD]', filename,
      Math.round(originalSize/1024) + 'KB →',
      Math.round(outBuffer.length/1024) + 'KB (-' + savedPercent + '%)');
  }

  return {
    filename: filename,
    size: outBuffer.length,
    originalSize: originalSize,
    savedPercent: savedPercent
  };
}

module.exports = { slugify, seoFilename, compressAndSave };
