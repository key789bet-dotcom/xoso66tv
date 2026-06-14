/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║ BUNNYCDN STREAM API WRAPPER                                   ║
 * ║                                                                ║
 * ║ Tạo + quản lý live streams qua BunnyCDN Stream API            ║
 * ║                                                                ║
 * ║ Docs: https://docs.bunny.net/reference/video_createvideo      ║
 * ║                                                                ║
 * ║ API endpoints chính:                                           ║
 * ║   POST   /library/{libraryId}/videos                          ║
 * ║   GET    /library/{libraryId}/videos/{videoId}                ║
 * ║   DELETE /library/{libraryId}/videos/{videoId}                ║
 * ║   GET    /library/{libraryId}/videos (list)                   ║
 * ║                                                                ║
 * ║ Live streaming: dùng tab "Live Streaming" trong dashboard      ║
 * ║   Push: rtmps://live.bunnycdn.com/live + stream key            ║
 * ║   Play: https://{cdnHostname}/{videoId}/playlist.m3u8          ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const config = require('./bunny-config-store');
const API_BASE = 'https://video.bunnycdn.com';

function _getConfig() {
  const c = config.get();
  if (!c.enabled || !c.libraryId || !c.apiKey) {
    throw new Error('BunnyCDN chưa cấu hình hoặc chưa bật. Vào /admin/bunny-stream để setup.');
  }
  return c;
}

async function _fetch(url, opts) {
  const c = _getConfig();
  opts = opts || {};
  opts.headers = Object.assign({
    'AccessKey': c.apiKey,
    'Accept': 'application/json'
  }, opts.headers || {});
  const fetchFn = (typeof fetch === 'function') ? fetch : require('node-fetch');
  const resp = await fetchFn(url, opts);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('BunnyCDN API ' + resp.status + ': ' + text.slice(0, 200));
  }
  return resp.status === 204 ? null : resp.json();
}

/**
 * Tạo video object trên BunnyCDN (dùng cho VOD upload hoặc Live Stream container)
 * Returns: { videoLibraryId, guid, title, ... }
 */
async function createVideo(title) {
  const c = _getConfig();
  return _fetch(API_BASE + '/library/' + c.libraryId + '/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: String(title).slice(0, 200) })
  });
}

/**
 * Lấy info video (status, encoding progress, thumbnails, ...)
 */
async function getVideo(videoId) {
  const c = _getConfig();
  return _fetch(API_BASE + '/library/' + c.libraryId + '/videos/' + videoId);
}

/**
 * Xoá video khỏi library
 */
async function deleteVideo(videoId) {
  const c = _getConfig();
  return _fetch(API_BASE + '/library/' + c.libraryId + '/videos/' + videoId, {
    method: 'DELETE'
  });
}

/**
 * URL HLS playlist để play video (Live hoặc VOD)
 */
function getHlsUrl(videoId) {
  const c = config.get();
  if (!c.cdnHostname || !videoId) return '';
  return 'https://' + c.cdnHostname + '/' + videoId + '/playlist.m3u8';
}

/**
 * URL iframe player BunnyCDN (drop-in, có UI sẵn)
 */
function getIframeUrl(videoId) {
  const c = config.get();
  if (!c.libraryId || !videoId) return '';
  return 'https://iframe.mediadelivery.net/embed/' + c.libraryId + '/' + videoId;
}

/**
 * URL thumbnail
 */
function getThumbnailUrl(videoId) {
  const c = config.get();
  if (!c.cdnHostname || !videoId) return '';
  return 'https://' + c.cdnHostname + '/' + videoId + '/thumbnail.jpg';
}

/**
 * RTMP push URL cho OBS (format: rtmps://live.bunnycdn.com/live)
 * Stream key format: {libraryId}_{videoGuid}_{streamKey}
 *   - libraryId: từ config
 *   - videoGuid: từ createVideo()
 *   - streamKey: secret key (từ tab Live Streaming trong dashboard)
 */
function getRtmpUrl() {
  const c = config.get();
  return c.rtmpUrl || 'rtmps://live.bunnycdn.com/live';
}

module.exports = {
  createVideo,
  getVideo,
  deleteVideo,
  getHlsUrl,
  getIframeUrl,
  getThumbnailUrl,
  getRtmpUrl,
  // Re-export config helpers
  isReady: () => config.isReady(),
  getConfig: () => config.get()
};
