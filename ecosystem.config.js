// PM2 Process Manager Config - Production
// Chạy: pm2 start ecosystem.config.js
// Restart: pm2 restart xoso66tv
// Logs: pm2 logs xoso66tv
module.exports = {
  apps: [{
    name: 'xoso66tv',
    script: 'server.js',
    cwd: '/var/www/xoso66tv',           // ⚠️ Đổi nếu deploy folder khác
    instances: 1,                         // Tăng = max nếu muốn cluster
    exec_mode: 'fork',                    // 'cluster' nếu instances > 1
    max_memory_restart: '500M',
    autorestart: true,
    watch: false,                         // Không watch file production
    env: {
      NODE_ENV: 'production',
      PORT: 4000,
      // 🔐 Admin login credentials (bcrypt hash tự tạo lúc start)
      ADMIN_USER: 'admin',
      ADMIN_PASS: 'Baohan@04072023'
    },
    error_file: '/var/log/xoso66tv/error.log',
    out_file: '/var/log/xoso66tv/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    // Restart nếu crash liên tục
    min_uptime: '10s',
    max_restarts: 5
  }]
};
