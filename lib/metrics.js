/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 📊 PROMETHEUS METRICS — Mục 9                                    ║
 * ║                                                                    ║
 * ║ Expose /metrics endpoint cho Prometheus scrape.                  ║
 * ║                                                                    ║
 * ║ Default metrics: process_cpu, memory, event loop lag, GC, etc.   ║
 * ║ Custom: http_requests_total, http_duration_seconds, chat_messages║
 * ║                                                                    ║
 * ║ Setup Grafana: trỏ data source về Prometheus, import dashboard.  ║
 * ╚══════════════════════════════════════════════════════════════════*/
let client = null;
try { client = require('prom-client'); }
catch (e) { console.warn('[METRICS] prom-client not installed → metrics disabled'); }

let initialized = false;
let httpRequestsTotal, httpDurationSeconds, chatMessagesTotal, wsConnections;

function init() {
  if (!client || initialized) return;
  // Default metrics (Node.js process)
  client.collectDefaultMetrics({ prefix: 'x66_' });

  httpRequestsTotal = new client.Counter({
    name: 'x66_http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status']
  });
  httpDurationSeconds = new client.Histogram({
    name: 'x66_http_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  });
  chatMessagesTotal = new client.Counter({
    name: 'x66_chat_messages_total',
    help: 'Total chat messages sent',
    labelNames: ['room_type']
  });
  wsConnections = new client.Gauge({
    name: 'x66_websocket_connections',
    help: 'Active WebSocket connections'
  });

  initialized = true;
  console.log('[METRICS] ✅ Prometheus initialized');
}

function middleware() {
  if (!client) return function(req, res, next){ next(); };
  init();
  return function(req, res, next) {
    if (req.path === '/metrics') return next();
    const start = process.hrtime.bigint();
    res.on('finish', function() {
      try {
        const route = req.route && req.route.path ? req.route.path : req.path.split('/').slice(0, 3).join('/');
        const dur = Number(process.hrtime.bigint() - start) / 1e9;
        httpRequestsTotal.inc({ method: req.method, route: route, status: res.statusCode });
        httpDurationSeconds.observe({ method: req.method, route: route }, dur);
      } catch (_) {}
    });
    next();
  };
}

async function metricsEndpoint(req, res) {
  if (!client || !initialized) return res.status(503).send('# metrics not initialized\n');
  // Optional: auth check (chỉ cho IP nội bộ Prometheus)
  const ip = req.headers['cf-connecting-ip'] || req.ip || '';
  // Allow local + Prometheus IP
  // if (!ip.startsWith('127.') && !ip.startsWith('10.')) {
  //   return res.status(403).send('forbidden');
  // }
  res.setHeader('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}

function trackChatMessage(roomType) {
  if (!initialized || !chatMessagesTotal) return;
  try { chatMessagesTotal.inc({ room_type: roomType || 'unknown' }); } catch (_) {}
}

function setWsConnections(n) {
  if (!initialized || !wsConnections) return;
  try { wsConnections.set(n); } catch (_) {}
}

module.exports = { init, middleware, metricsEndpoint, trackChatMessage, setWsConnections };
