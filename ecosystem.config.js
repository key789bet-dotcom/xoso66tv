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
    // 🚀 CLUSTER MODE - dùng nhiều CPU cores (cần thiết cho target 100k users)
    instances: 2,
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
