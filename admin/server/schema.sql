-- =========================
-- DATABASE
-- =========================
CREATE DATABASE IF NOT EXISTS kompos_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE kompos_db;

-- =========================
-- TABLE: users (dari Telegram)
-- =========================
CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  tg_username VARCHAR(64) NULL,
  tg_first_name VARCHAR(128) NULL,
  tg_last_name VARCHAR(128) NULL,
  display_name VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =========================
-- TABLE: devices (alat)
-- =========================
CREATE TABLE IF NOT EXISTS devices (
  device_id INT PRIMARY KEY,
  pair_code VARCHAR(32) UNIQUE,
  status ENUM('Aktif','Tidak Aktif') DEFAULT 'Aktif',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =========================
-- TABLE: device_users (relasi alat <-> user)
-- =========================
CREATE TABLE IF NOT EXISTS device_users (
  device_id INT NOT NULL,
  telegram_id BIGINT NOT NULL,
  PRIMARY KEY (device_id, telegram_id),
  CONSTRAINT fk_du_device FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE,
  CONSTRAINT fk_du_user FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================
-- TABLE: history_batches (riwayat pengomposan)
-- =========================
CREATE TABLE IF NOT EXISTS history_batches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id INT NOT NULL,
  tanggal_mulai DATE NOT NULL,
  tanggal_matang DATE NULL,
  durasi VARCHAR(50) NOT NULL,        -- contoh: "13 Hari"
  status VARCHAR(50) NOT NULL,        -- contoh: "Selesai"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hist_device FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE,
  INDEX idx_hist_device (device_id, id)
) ENGINE=InnoDB;

-- =========================
-- TABLE: monitoring_rows (data monitoring 5 menit)
-- =========================
CREATE TABLE IF NOT EXISTS monitoring_rows (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id INT NOT NULL,
  batch_id BIGINT NULL,               -- boleh null jika belum masuk batch
  ts DATETIME NOT NULL,               -- waktu data masuk
  suhu DECIMAL(5,2) NULL,
  kelembaban DECIMAL(5,2) NULL,
  pengaduk ENUM('Aktif','Mati') NULL,
  pompa ENUM('Aktif','Mati') NULL,
  fan ENUM('Aktif','Mati') NULL,
  status VARCHAR(50) NULL,            -- contoh: "Matang"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_mon_device FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE,
  CONSTRAINT fk_mon_batch  FOREIGN KEY (batch_id) REFERENCES history_batches(id) ON DELETE SET NULL,

  INDEX idx_mon_device_ts (device_id, ts),
  INDEX idx_mon_device_batch_ts (device_id, batch_id, ts)
) ENGINE=InnoDB;

-- =========================
-- OPTIONAL (lebih aman): Buat user khusus aplikasi (bukan root)
-- Ganti PASSWORD_KAMU
-- =========================
-- CREATE USER IF NOT EXISTS 'kompos_app'@'localhost' IDENTIFIED BY 'PASSWORD_KAMU';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON kompos_db.* TO 'kompos_app'@'localhost';
-- FLUSH PRIVILEGES;
