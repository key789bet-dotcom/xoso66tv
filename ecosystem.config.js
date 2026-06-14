// PM2 Process Manager Config - Production
//
// MIGRATION (1 lần khi đổi fork → cluster):
//   pm2 delete xoso66tv
//   pm2 start ecosystem.config.js
//   pm2 save                  # lưu để auto-restart sau reboot
//
// SỬ DỤNG HÀNG NGÀY:
//   pm2 reload xoso66tv       # zero-downtime restart (rolling, recommended)
//   pm2 restart xoso66tv      # hard restart tất cả workers
//   pm2 scale xoso66tv +2     # thêm 2 workers
//   pm2 scale xoso66tv 2      # giảm về 2 workers
//   pm2 list                  # xem trạng thái
//   pm2 logs xoso66tv         # xem log
module.exports = {
  apps: [{
    name: 'xoso66tv',
    script: 'server.js',
    cwd: '/var/www/xoso66tv',
    // ⚠️ 1 INSTANCE — FIX DỨT ĐIỂM lỗi save admin "hiện 1 lúc rồi quay về cũ"
    // ─────────────────────────────────────────────────────────────────────
    // TRƯỚC: instances: 2 → mỗi worker có RAM cache riêng (db-relational.js
    //   cache full data vào _cache local). Khi admin save:
    //   • Request đi vào Worker A → save file + update cache A
    //   • Worker B cache CŨ — không biết gì
    //   • Refresh round-robin trúng B → hiện data CŨ (đến khi periodic
    //     reload 5 phút sau workers mới đồng bộ qua MySQL)
    //
    // SAU: instances: 1 → 1 worker = 1 cache → KHÔNG bao giờ desync.
    //   VPS KV8 có 8 vCPU, 1 Node worker handle 1000+ concurrent req/s
    //   vẫn dư công suất cho traffic hiện tại.
    //
    // Khi nào cần scale lên nhiều worker → implement Redis pub/sub trong
    // db-relational.js để invalidate cache giữa workers (PHẢI làm trước
    // khi tăng instances, nếu không lỗi này quay lại).
    instances: 1,
    exec_mode: 'cluster',
    max_memory_restart: '500M',           // restart worker nếu memory > 500MB
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 4001,    // ⚠️ KHỚP với nginx proxy_pass http://127.0.0.1:4001
      // 🔐 Admin login credentials (bcrypt hash tự tạo lúc start)
      ADMIN_USER: 'admin',
      ADMIN_PASS: 'Baohan@04072023'
    },
    error_file: '/var/log/xoso66tv/error.log',
    out_file: '/var/log/xoso66tv/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    min_uptime: '10s',
    max_restarts: 5,
    restart_delay: 2000,
    // Graceful shutdown — đợi 5s để worker đóng connection trước khi kill
    kill_timeout: 5000,
    listen_timeout: 8000
  }]
};
