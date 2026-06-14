-- ╔══════════════════════════════════════════════════════════════╗
-- ║ XOSO66 TV — Schema MySQL Relational (Phase 2)                 ║
-- ║                                                                ║
-- ║ Thiết kế cho 100,000+ users                                    ║
-- ║ - Index trên tất cả lookup columns                             ║
-- ║ - JSON columns cho các field flexible (profile, settings)      ║
-- ║ - Foreign keys + ON DELETE CASCADE                             ║
-- ║ - utf8mb4 hỗ trợ emoji + tiếng Việt                            ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ─── 1. USERS — bảng chính ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                  VARCHAR(32)  PRIMARY KEY,
  username            VARCHAR(64)  NOT NULL,
  email               VARCHAR(128) DEFAULT NULL,
  phone               VARCHAR(32)  DEFAULT NULL,
  password_hash       VARCHAR(255) DEFAULT NULL,
  role                ENUM('user','idol','blv','admin') NOT NULL DEFAULT 'user',
  vip_tier            TINYINT      NOT NULL DEFAULT 0,
  x_coin              BIGINT       NOT NULL DEFAULT 0,
  display_name        VARCHAR(64)  DEFAULT NULL,
  avatar              VARCHAR(255) DEFAULT NULL,
  status              ENUM('active','banned','pending') NOT NULL DEFAULT 'active',
  xoso66_linked       TINYINT(1)   NOT NULL DEFAULT 0,
  xoso66_username     VARCHAR(64)  DEFAULT NULL,
  last_login_at       DATETIME     DEFAULT NULL,
  last_login_ip       VARCHAR(64)  DEFAULT NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Field linh hoạt khác (settings, bonus history, etc)
  extra               JSON         DEFAULT NULL,

  UNIQUE KEY uk_username (username),
  UNIQUE KEY uk_email    (email),
  KEY idx_role          (role),
  KEY idx_status        (status),
  KEY idx_vip           (vip_tier),
  KEY idx_created       (created_at),
  KEY idx_xoso66        (xoso66_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2. IDOLS — danh sách idol live ──────────────────────────────
CREATE TABLE IF NOT EXISTS idols (
  id              VARCHAR(32)  PRIMARY KEY,
  user_id         VARCHAR(32)  DEFAULT NULL,
  name            VARCHAR(64)  NOT NULL,
  slug            VARCHAR(64)  NOT NULL,
  avatar          VARCHAR(255) DEFAULT NULL,
  card_image      VARCHAR(255) DEFAULT NULL,
  category        VARCHAR(32)  DEFAULT 'idol',
  bio             TEXT         DEFAULT NULL,
  live_now        TINYINT(1)   NOT NULL DEFAULT 0,
  live_started_at DATETIME     DEFAULT NULL,
  status          ENUM('active','pending','blocked') NOT NULL DEFAULT 'active',
  lock_coin       INT          NOT NULL DEFAULT 0,
  pin_code        VARCHAR(8)   DEFAULT NULL,
  followers       INT          NOT NULL DEFAULT 0,
  total_views     BIGINT       NOT NULL DEFAULT 0,
  total_x_coin    BIGINT       NOT NULL DEFAULT 0,
  emoji           VARCHAR(8)   DEFAULT NULL,
  color           INT          DEFAULT 0,
  stream_key      VARCHAR(64)  DEFAULT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  extra           JSON         DEFAULT NULL,

  UNIQUE KEY uk_slug    (slug),
  KEY idx_user          (user_id),
  KEY idx_live          (live_now, category),
  KEY idx_status        (status),
  KEY idx_category      (category),
  CONSTRAINT fk_idols_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3. BLVS — bình luận viên ────────────────────────────────────
CREATE TABLE IF NOT EXISTS blvs (
  id              VARCHAR(32)  PRIMARY KEY,
  user_id         VARCHAR(32)  DEFAULT NULL,
  name            VARCHAR(64)  NOT NULL,
  slug            VARCHAR(64)  NOT NULL,
  avatar          VARCHAR(255) DEFAULT NULL,
  card_image      VARCHAR(255) DEFAULT NULL,
  live_now        TINYINT(1)   NOT NULL DEFAULT 0,
  live_started_at DATETIME     DEFAULT NULL,
  status          ENUM('active','pending','blocked') NOT NULL DEFAULT 'active',
  stream_key      VARCHAR(64)  DEFAULT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  extra           JSON         DEFAULT NULL,

  UNIQUE KEY uk_slug    (slug),
  KEY idx_user          (user_id),
  KEY idx_live          (live_now),
  KEY idx_status        (status),
  CONSTRAINT fk_blvs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 4. OBS_REQUESTS — đăng ký stream OBS ────────────────────────
CREATE TABLE IF NOT EXISTS obs_requests (
  id              VARCHAR(32)  PRIMARY KEY,
  requester_type  ENUM('idol','blv') NOT NULL,
  requester_id    VARCHAR(32)  NOT NULL,
  stream_key      VARCHAR(128) DEFAULT NULL,
  rtmp_url        VARCHAR(255) DEFAULT NULL,
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  stream_active   TINYINT(1)   NOT NULL DEFAULT 0,
  reviewed_by     VARCHAR(64)  DEFAULT NULL,
  reviewed_at     DATETIME     DEFAULT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_status       (status),
  KEY idx_requester    (requester_type, requester_id),
  KEY idx_active       (stream_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5. BANNERS — banner hero ────────────────────────────────────
CREATE TABLE IF NOT EXISTS banners (
  id          VARCHAR(32)  PRIMARY KEY,
  title       VARCHAR(128) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  cta_text    VARCHAR(32)  DEFAULT NULL,
  url         VARCHAR(255) DEFAULT NULL,
  image       VARCHAR(255) DEFAULT NULL,
  gradient    VARCHAR(255) DEFAULT NULL,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_active_order (active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6. TRANSACTIONS — lịch sử X COIN ────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
  user_id     VARCHAR(32)  NOT NULL,
  type        ENUM('deposit','gift','game','reward','checkin','refund','admin') NOT NULL,
  amount      BIGINT       NOT NULL,           -- âm = trừ, dương = cộng
  balance     BIGINT       NOT NULL,           -- balance sau giao dịch
  ref_type    VARCHAR(32)  DEFAULT NULL,       -- 'idol_gift', 'lottery', ...
  ref_id      VARCHAR(64)  DEFAULT NULL,       -- ID đối tượng liên quan
  note        VARCHAR(255) DEFAULT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_user_time (user_id, created_at DESC),
  KEY idx_type      (type, created_at),
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 7. AUDIT_LOG — admin action log ─────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
  action      VARCHAR(64)  NOT NULL,
  target      VARCHAR(255) DEFAULT NULL,
  by_user     VARCHAR(64)  NOT NULL DEFAULT 'system',
  ip          VARCHAR(64)  DEFAULT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_time       (created_at DESC),
  KEY idx_action     (action, created_at),
  KEY idx_by_user    (by_user, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 8. SETTINGS — config động (header banner, partner links, ...) ──
CREATE TABLE IF NOT EXISTS settings (
  `key`       VARCHAR(64)  PRIMARY KEY,
  `value`     JSON         NOT NULL,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════
-- ESTIMATE DUNG LƯỢNG cho 100k users:
--   users:        100,000 × 1.5KB = 150MB
--   idols:           1,000 × 2KB  =   2MB
--   blvs:              500 × 2KB  =   1MB
--   transactions: 5,000,000 × 200B = 1GB  (giả sử 50 tx/user)
--   audit_log:    1,000,000 × 200B = 200MB
--   Total:        ≈ 1.4GB
-- VPS hiện tại 387GB → dư hơn 270x
-- ═══════════════════════════════════════════════════════════════
