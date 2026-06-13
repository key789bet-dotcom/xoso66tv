/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ IMAGE PROCESSOR — Auto-optimize uploads với sharp              ║
 * ║                                                                ║
 * ║ Functions:                                                     ║
 * ║   - optimizeImage(filePath, opts) — resize + optimize 1 file   ║
 * ║   - afterUploadOptimize(opts) — middleware sau multer          ║
 * ║                                                                ║
 * ║ Strategy:                                                      ║
 * ║   - Resize xuống maxWidth (mặc định 1600px)                    ║
 * ║   - JPEG: progressive + mozjpeg encoder (giảm 30-50%)          ║
 * ║   - PNG: palette + max compression (giảm 40-60%)               ║
 * ║   - WebP: quality 82 (cân bằng size/chất lượng)               ║
 * ║   - GIF: skip (animation có thể bị hỏng)                       ║
 * ║   - Non-destructive: chỉ replace nếu output NHỎ HƠN 5%        ║
 * ║   - Safe: error → log warning, không throw, không xoá file    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
let sharp = null;
try { sharp = require('sharp'); }
catch (e) { console.warn('[IMG] ⚠️  sharp chưa cài. Chạy: npm install sharp'); }

const fs   = require('fs').promises;
const path = require('path');

/**
 * Optimize 1 file ảnh (in-place).
 * @param {string} filePath - đường dẫn tuyệt đối tới file
 * @param {object} opts - { maxWidth: 1600, quality: 82 }
 * @returns {Promise<boolean>} true nếu đã optimize, false nếu skip
 */
async function optimizeImage(filePath, opts = {}) {
  if (!sharp) return false;
  const { maxWidth = 1600, quality = 82, minSavingsPercent = 5 } = opts;

  const ext = path.extname(filePath).toLowerCase().replace('.', '').replace('jpeg', 'jpg');
  if (!/^(jpg|png|webp)$/.test(ext)) return false; // skip GIF/SVG/...

  try {
    const stats = await fs.stat(filePath);
    if (stats.size < 30 * 1024) return false; // file < 30KB không cần optimize

    // Resize + encode
    let pipeline = sharp(filePath, { failOn: 'none' })
      .rotate() // auto-rotate theo EXIF
      .resize({
        width: maxWidth,
        withoutEnlargement: true,
        fit: 'inside'
      });

    if (ext === 'jpg') {
      pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true, chromaSubsampling: '4:4:4' });
    } else if (ext === 'png') {
      pipeline = pipeline.png({ quality, compressionLevel: 9, palette: true, effort: 7 });
    } else if (ext === 'webp') {
      pipeline = pipeline.webp({ quality, effort: 4 });
    }

    const buf = await pipeline.toBuffer();
    const savedPercent = Math.round((1 - buf.length / stats.size) * 100);

    if (savedPercent < minSavingsPercent) {
      return false; // không đáng để replace
    }

    // Atomic write: tạm thời .tmp rồi rename
    const tmp = filePath + '.tmp';
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, filePath);

    console.log('[IMG]', path.basename(filePath),
      Math.round(stats.size / 1024) + 'KB →',
      Math.round(buf.length / 1024) + 'KB',
      '(-' + savedPercent + '%)');
    return true;
  } catch (e) {
    console.warn('[IMG] optimize fail:', path.basename(filePath), e.message);
    return false;
  }
}

/**
 * Middleware Express — sau multer.single() hoặc multer.array() tự động optimize file vừa upload.
 * Non-blocking: chạy bất đồng bộ, không chặn response.
 *
 * Usage:
 *   router.post('/upload', multer.single('image'), imgProcessor.afterUploadOptimize(), handler);
 */
function afterUploadOptimize(opts = {}) {
  return (req, res, next) => {
    const files = [];
    if (req.file) files.push(req.file);
    if (req.files) {
      if (Array.isArray(req.files)) files.push(...req.files);
      else for (const k in req.files) files.push(...req.files[k]);
    }
    if (files.length === 0) return next();

    // Chạy ngay nhưng không await — handler chạy song song
    Promise.all(files.map(f => optimizeImage(f.path, opts).catch(() => {})))
      .then(() => { /* done */ });

    next();
  };
}

module.exports = { optimizeImage, afterUploadOptimize };
