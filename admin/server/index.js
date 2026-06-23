require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const { Telegraf } = require("telegraf");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json({ limit: "2mb" }));

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_ganti";

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

console.log("RUNNING SERVER FILE:", __filename);

// ============================
// MySQL Pool
// ============================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "kompos_db",
  waitForConnections: true,
  connectionLimit: 10,
});

// ============================
// TELEGRAM NOTIFY
// ============================
let tgBot = null;

const lastNotifyAt = new Map();
const lastDailyReportAt = new Map(); // <-- Tambahan untuk jadwal 1 hari sekali
const COOLDOWN = {
  status: 60_000,
  motor: 30_000,
  fan: 30_000,
  pump: 30_000,
  gas: 60_000,
};

function canNotify(key, cooldownMs) {
  const now = Date.now();
  const last = lastNotifyAt.get(key) || 0;
  if (now - last < cooldownMs) return false;
  lastNotifyAt.set(key, now);
  return true;
}

async function notifyDeviceUsers(deviceId, text) {
  if (!tgBot) return;

  const [rows] = await pool.execute(
    `SELECT telegram_id FROM device_users WHERE device_id = ?`,
    [deviceId]
  );

  for (const r of rows) {
    try {
      // Tambahkan parse_mode agar bisa menampilkan emoji dan teks tebal
      await tgBot.telegram.sendMessage(String(r.telegram_id), text, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error("Telegram send failed:", r?.telegram_id, e?.message || e);
    }
  }
}

// ============================
// HELPERS
// ============================
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      device_id: user.device_id ?? null,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const [type, token] = auth.split(" ");
  if (type !== "Bearer" || !token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ message: "Token tidak valid" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

function requireDeviceAccess(req, res, next) {
  const role = req.user?.role;
  if (role === "admin") return next();

  const paramDeviceId = Number(req.params.deviceId);
  const myDeviceId = Number(req.user?.device_id || 0);

  if (!myDeviceId) {
    return res
      .status(403)
      .json({ message: "Device belum terhubung ke akun ini (device_id NULL)" });
  }

  if (paramDeviceId !== myDeviceId) {
    return res.status(403).json({ message: "Akses device ditolak" });
  }

  next();
}

function safeParseTextJson(text, fallback) {
  try {
    if (!text) return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function normalizeActuatorText(v) {
  if (v === "Aktif" || v === "Mati") return v;
  return Number(v) === 1 ? "Aktif" : "Mati";
}

async function upsertTelegramUser(from) {
  const displayName =
    `${from.first_name || ""}${from.last_name ? " " + from.last_name : ""}`.trim() ||
    from.username ||
    "User";

  await pool.execute(
    `
    INSERT INTO users (telegram_id, tg_username, tg_first_name, tg_last_name, display_name)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      tg_username=VALUES(tg_username),
      tg_first_name=VALUES(tg_first_name),
      tg_last_name=VALUES(tg_last_name),
      display_name=VALUES(display_name),
      updated_at=CURRENT_TIMESTAMP
    `,
    [
      from.id,
      from.username || null,
      from.first_name || null,
      from.last_name || null,
      displayName,
    ]
  );

  return displayName;
}

async function resolveOpenHistory(deviceId, ts, reportedBatchId = null) {
  if (reportedBatchId) {
    const [[found]] = await pool.execute(
      `SELECT id, device_id, tanggal_mulai, tanggal_matang, durasi, status
       FROM history_batches
       WHERE id = ? AND device_id = ?
       LIMIT 1`,
      [Number(reportedBatchId), Number(deviceId)]
    );

    if (found && found.status !== "Selesai") {
      return found;
    }
  }

  const [[openHistory]] = await pool.execute(
    `SELECT id, device_id, tanggal_mulai, tanggal_matang, durasi, status
     FROM history_batches
     WHERE device_id = ? AND status <> 'Selesai'
     ORDER BY id DESC
     LIMIT 1`,
    [Number(deviceId)]
  );

  if (openHistory) return openHistory;

  const [result] = await pool.execute(
    `INSERT INTO history_batches (device_id, tanggal_mulai, tanggal_matang, durasi, status)
     VALUES (?, DATE(?), NULL, '1 hari', 'Berjalan')`,
    [Number(deviceId), ts]
  );

  const [[created]] = await pool.execute(
    `SELECT id, device_id, tanggal_mulai, tanggal_matang, durasi, status
     FROM history_batches
     WHERE id = ?`,
    [result.insertId]
  );

  return created;
}

async function updateHistoryProgress(historyId, deviceId, ts, compostStatus) {
  const [[daysRow]] = await pool.execute(
    `SELECT DATEDIFF(DATE(?), tanggal_mulai) + 1 AS hari
     FROM history_batches
     WHERE id = ? AND device_id = ?
     LIMIT 1`,
    [ts, Number(historyId), Number(deviceId)]
  );

  const hari = Math.max(Number(daysRow?.hari || 1), 1);
  const durasiText = `${hari} hari`;

  if (String(compostStatus || "").trim() === "Matang") {
    await pool.execute(
      `UPDATE history_batches
       SET status = 'Selesai',
           tanggal_matang = DATE(?),
           durasi = ?
       WHERE id = ? AND device_id = ?`,
      [ts, durasiText, Number(historyId), Number(deviceId)]
    );
  } else {
    await pool.execute(
      `UPDATE history_batches
       SET status = 'Berjalan',
           durasi = ?
       WHERE id = ? AND device_id = ?`,
      [durasiText, Number(historyId), Number(deviceId)]
    );
  }
}

// ============================
// AUTH
// ============================
app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: "username & password wajib" });
    }

    const [rows] = await pool.execute(
      `SELECT id, username, password_hash, role, device_id, is_active
       FROM auth_users
       WHERE username = ?
       LIMIT 1`,
      [String(username)]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Username / password salah" });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(403).json({ message: "Akun nonaktif" });
    }

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Username / password salah" });
    }

    const token = signToken(user);

    res.json({
      message: "OK",
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        device_id: user.device_id ?? null,
      },
    });
  })
);

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ============================
// ADMIN DASHBOARD
// ============================
app.get(
  "/api/dashboard/summary",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const [[d]] = await pool.query(
      `SELECT COUNT(*) AS totalDevices,
              SUM(status='Aktif') AS activeDevices
       FROM devices`
    );
    const [[u]] = await pool.query(`SELECT COUNT(*) AS totalUsers FROM users`);

    res.json({
      totalDevices: Number(d?.totalDevices || 0),
      activeDevices: Number(d?.activeDevices || 0),
      totalUsers: Number(u?.totalUsers || 0),
    });
  })
);

app.get(
  "/api/dashboard/kompos-matang",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const mode = String(req.query.mode || "harian");

    if (mode === "harian") {
      const [rows] = await pool.execute(
        `SELECT WEEKDAY(tanggal_matang) AS wd, COUNT(*) AS cnt
         FROM history_batches
         WHERE status = 'Selesai'
           AND tanggal_matang IS NOT NULL
           AND tanggal_matang >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         GROUP BY wd`,
        []
      );

      const labels = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
      const values = Array(7).fill(0);
      rows.forEach((r) => {
        values[Number(r.wd)] = Number(r.cnt || 0);
      });

      return res.json({ labels, values });
    }

    if (mode === "bulanan") {
      const [rows] = await pool.execute(
        `SELECT DATE_FORMAT(tanggal_matang, '%Y-%m') AS ym, COUNT(*) AS cnt
         FROM history_batches
         WHERE status = 'Selesai'
           AND tanggal_matang IS NOT NULL
           AND tanggal_matang >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         GROUP BY ym
         ORDER BY ym`,
        []
      );

      const labels = [];
      const map = new Map(rows.map((r) => [r.ym, Number(r.cnt || 0)]));
      const now = new Date();

      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        labels.push(ym);
      }

      const values = labels.map((ym) => map.get(ym) || 0);
      return res.json({ labels, values });
    }

    const [rows] = await pool.execute(
      `SELECT YEAR(tanggal_matang) AS yy, COUNT(*) AS cnt
       FROM history_batches
       WHERE status = 'Selesai'
         AND tanggal_matang IS NOT NULL
         AND tanggal_matang >= DATE_SUB(CURDATE(), INTERVAL 5 YEAR)
       GROUP BY yy
       ORDER BY yy`,
      []
    );

    res.json({
      labels: rows.map((r) => String(r.yy)),
      values: rows.map((r) => Number(r.cnt || 0)),
    });
  })
);

app.get(
  "/api/dashboard/activity",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 5), 20);

    const [rows] = await pool.query(
      `
      (SELECT 'Pengguna Baru' AS title, created_at AS ts, display_name AS detail
       FROM users
       ORDER BY created_at DESC
       LIMIT ?)
      UNION ALL
      (SELECT 'Kompos Jadi' AS title, created_at AS ts, CONCAT('Device ', device_id) AS detail
       FROM history_batches
       WHERE status = 'Selesai'
       ORDER BY created_at DESC
       LIMIT ?)
      UNION ALL
      (SELECT 'Alat Baru' AS title, created_at AS ts, CONCAT('ID ', device_id) AS detail
       FROM devices
       ORDER BY created_at DESC
       LIMIT ?)
      ORDER BY ts DESC
      LIMIT ?
      `,
      [limit, limit, limit, limit]
    );

    res.json(rows.map((r) => ({ title: r.title, detail: r.detail, ts: r.ts })));
  })
);

// ============================
// ADMIN USERS
// ============================
app.get(
  "/api/users",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`
      SELECT
        d.device_id AS idAlat,
        u.telegram_id AS idTelegram,
        u.display_name AS nama,
        d.status AS status
      FROM device_users du
      JOIN devices d ON d.device_id = du.device_id
      JOIN users u ON u.telegram_id = du.telegram_id
      ORDER BY d.device_id ASC, u.display_name ASC
    `);
    res.json(rows);
  })
);

app.delete(
  "/api/users/:deviceId/:telegramId",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.params.deviceId);
    const telegramId = Number(req.params.telegramId);

    if (!deviceId || !telegramId) {
      return res.status(400).json({ message: "deviceId & telegramId wajib" });
    }

    await pool.execute(`DELETE FROM device_users WHERE device_id=? AND telegram_id=?`, [
      deviceId,
      telegramId,
    ]);

    const [[c]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM device_users WHERE telegram_id=?`,
      [telegramId]
    );

    if (Number(c?.cnt || 0) === 0) {
      await pool.execute(`DELETE FROM users WHERE telegram_id=?`, [telegramId]);
    }

    res.json({ message: "OK" });
  })
);

// ============================
// ADMIN DEVICE DATA
// ============================
app.get(
  "/api/devices/:deviceId/history",
  requireAuth,
  requireDeviceAccess,
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.params.deviceId);

    const [rows] = await pool.execute(
      `SELECT
         id,
         DATE_FORMAT(tanggal_mulai, '%d/%m/%Y') AS tanggalMulai,
         IFNULL(DATE_FORMAT(tanggal_matang, '%d/%m/%Y'), '') AS tanggalMatang,
         durasi,
         status
       FROM history_batches
       WHERE device_id = ?
       ORDER BY id DESC`,
      [deviceId]
    );

    res.json(rows);
  })
);

app.get(
  "/api/devices/:deviceId/history/:historyId/monitoring",
  requireAuth,
  requireDeviceAccess,
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.params.deviceId);
    const historyId = Number(req.params.historyId);

    const [[hist]] = await pool.execute(
      `SELECT
         id,
         DATE_FORMAT(tanggal_mulai, '%d/%m/%Y') AS tanggalMulai,
         IFNULL(DATE_FORMAT(tanggal_matang, '%d/%m/%Y'), '') AS tanggalMatang,
         durasi,
         status
       FROM history_batches
       WHERE id = ? AND device_id = ?
       LIMIT 1`,
      [historyId, deviceId]
    );

    if (!hist) {
      return res.status(404).json({ message: "History tidak ditemukan" });
    }

    const [rows] = await pool.execute(
      `SELECT
         DATE_FORMAT(ts, '%d/%m/%Y %H:%i') AS tanggal,
         suhu,
         kelembaban,
         ph,
         gas,
         COALESCE(pengaduk, 'Mati') AS pengaduk,
         COALESCE(pompa, 'Mati') AS pompa,
         COALESCE(fan, 'Mati') AS fan,
         COALESCE(status, '-') AS status
       FROM monitoring_rows
       WHERE device_id = ? AND batch_id = ?
       ORDER BY ts DESC
       LIMIT 1000`,
      [deviceId, historyId]
    );

    res.json({ history: hist, rows });
  })
);

app.get(
  "/api/devices/:deviceId/monitoring/current",
  requireAuth,
  requireDeviceAccess,
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.params.deviceId);

    const [[openHistory]] = await pool.execute(
      `SELECT id, tanggal_mulai, durasi, status
       FROM history_batches
       WHERE device_id = ? AND status <> 'Selesai'
       ORDER BY id DESC
       LIMIT 1`,
      [deviceId]
    );

    if (!openHistory) {
      return res.json({ history: null, rows: [] });
    }

    const [rows] = await pool.execute(
      `SELECT
         DATE_FORMAT(ts, '%d/%m/%Y %H:%i') AS tanggal,
         suhu,
         kelembaban,
         ph,
         gas,
         COALESCE(pengaduk, 'Mati') AS pengaduk,
         COALESCE(pompa, 'Mati') AS pompa,
         COALESCE(fan, 'Mati') AS fan,
         COALESCE(status, '-') AS status
       FROM monitoring_rows
       WHERE device_id = ?
         AND batch_id = ?
         AND DATE(ts) = CURDATE()
       ORDER BY ts DESC
       LIMIT 1000`,
      [deviceId, Number(openHistory.id)]
    );

    res.json({
      history: openHistory,
      rows,
    });
  })
);

// ============================
// USER ROUTES
// ============================
app.get(
  "/api/my/history",
  requireAuth,
  requireRole("user", "admin"),
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.user.device_id || 0);

    if (!deviceId) {
      return res.status(400).json({ message: "Akun belum terhubung ke device" });
    }

    const [rows] = await pool.execute(
      `SELECT
         id,
         DATE_FORMAT(tanggal_mulai, '%d/%m/%Y') AS tanggalMulai,
         IFNULL(DATE_FORMAT(tanggal_matang, '%d/%m/%Y'), '') AS tanggalMatang,
         durasi,
         status
       FROM history_batches
       WHERE device_id = ?
       ORDER BY id DESC`,
      [deviceId]
    );

    res.json(rows);
  })
);

app.get(
  "/api/my/history/:historyId/monitoring",
  requireAuth,
  requireRole("user", "admin"),
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.user.device_id || 0);
    const historyId = Number(req.params.historyId);

    if (!deviceId) {
      return res.status(400).json({ message: "Akun belum terhubung ke device" });
    }

    const [[hist]] = await pool.execute(
      `SELECT
         id,
         DATE_FORMAT(tanggal_mulai, '%d/%m/%Y') AS tanggalMulai,
         IFNULL(DATE_FORMAT(tanggal_matang, '%d/%m/%Y'), '') AS tanggalMatang,
         durasi,
         status
       FROM history_batches
       WHERE id = ? AND device_id = ?
       LIMIT 1`,
      [historyId, deviceId]
    );

    if (!hist) {
      return res.status(404).json({ message: "History tidak ditemukan" });
    }

    const [rows] = await pool.execute(
      `SELECT
         DATE_FORMAT(ts, '%d/%m/%Y %H:%i') AS tanggal,
         suhu,
         kelembaban,
         ph,
         gas,
         COALESCE(pengaduk, 'Mati') AS pengaduk,
         COALESCE(pompa, 'Mati') AS pompa,
         COALESCE(fan, 'Mati') AS fan,
         COALESCE(status, '-') AS status
       FROM monitoring_rows
       WHERE device_id = ? AND batch_id = ?
       ORDER BY ts DESC
       LIMIT 1000`,
      [deviceId, historyId]
    );

    res.json({ history: hist, rows });
  })
);

app.get(
  "/api/my/monitoring/current",
  requireAuth,
  requireRole("user", "admin"),
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.user.device_id || 0);

    if (!deviceId) {
      return res.status(400).json({ message: "Akun belum terhubung ke device" });
    }

    const [[openHistory]] = await pool.execute(
      `SELECT id, tanggal_mulai, durasi, status
       FROM history_batches
       WHERE device_id = ? AND status <> 'Selesai'
       ORDER BY id DESC
       LIMIT 1`,
      [deviceId]
    );

    if (!openHistory) {
      return res.json({
        history: null,
        rows: [],
      });
    }

    const [rows] = await pool.execute(
      `SELECT
         DATE_FORMAT(ts, '%d/%m/%Y %H:%i') AS tanggal,
         suhu,
         kelembaban,
         ph,
         gas,
         COALESCE(pengaduk, 'Mati') AS pengaduk,
         COALESCE(pompa, 'Mati') AS pompa,
         COALESCE(fan, 'Mati') AS fan,
         COALESCE(status, '-') AS status
       FROM monitoring_rows
       WHERE device_id = ?
         AND batch_id = ?
       ORDER BY ts DESC`,
      [deviceId, Number(openHistory.id)]
    );

    const [[meta]] = await pool.execute(
      `SELECT DATE_FORMAT(tanggal_mulai, '%d/%m/%Y') AS tanggalMulai,
              DATEDIFF(CURDATE(), tanggal_mulai) + 1 AS durasiBerjalan
       FROM history_batches
       WHERE id = ?`,
      [Number(openHistory.id)]
    );

    res.json({
      history: {
        id: Number(openHistory.id),
        tanggalMulai: meta?.tanggalMulai || "",
        durasiBerjalan: Number(meta?.durasiBerjalan || 1),
        targetHari: 14,
        status: openHistory.status,
      },
      rows,
    });
  })
);

app.get(
  "/api/my/dashboard/current",
  requireAuth,
  requireRole("user", "admin"),
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.user.device_id || 0);

    if (!deviceId) {
      return res.status(400).json({ message: "Akun belum terhubung ke device" });
    }

    const [[openHistory]] = await pool.execute(
      `SELECT id
       FROM history_batches
       WHERE device_id = ? AND status <> 'Selesai'
       ORDER BY id DESC
       LIMIT 1`,
      [deviceId]
    );

    let latestRows;
    if (openHistory?.id) {
      [latestRows] = await pool.execute(
        `SELECT *
         FROM monitoring_rows
         WHERE device_id = ? AND batch_id = ?
         ORDER BY ts DESC
         LIMIT 1`,
        [deviceId, Number(openHistory.id)]
      );
    } else {
      [latestRows] = await pool.execute(
        `SELECT *
         FROM monitoring_rows
         WHERE device_id = ?
         ORDER BY ts DESC
         LIMIT 1`,
        [deviceId]
      );
    }

    const row = latestRows[0] || null;
    if (!row) {
      return res.json({
        row: null,
        memberships: null,
        activeRules: [],
      });
    }

    res.json({
      row: {
        tanggal: row.ts,
        suhu: row.suhu,
        kelembaban: row.kelembaban,
        ph: row.ph,
        gas: row.gas,
        pengaduk: row.pengaduk || "Mati",
        pompa: row.pompa || "Mati",
        fan: row.fan || "Mati",
        status: row.status || "-",
        fuzzy_output: Number(row.fuzzy_output || 0),
      },
      memberships: {
        suhu: safeParseTextJson(row.mu_suhu_json, {}),
        kelembaban: safeParseTextJson(row.mu_kelembaban_json, {}),
        ph: safeParseTextJson(row.mu_ph_json, {}),
        gas: safeParseTextJson(row.mu_gas_json, {}),
      },
      activeRules: String(row.rule_aktif_text || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  })
);

// ============================
// IOT OPEN ROUTES
// ============================
app.post(
  "/api/iot/devices/register",
  asyncHandler(async (req, res) => {
    const { device_id, pair_code } = req.body || {};
    if (!device_id || !pair_code) {
      return res.status(400).json({ message: "device_id & pair_code wajib" });
    }

    await pool.execute(
      `
      INSERT INTO devices (device_id, pair_code, status)
      VALUES (?, ?, 'Aktif')
      ON DUPLICATE KEY UPDATE
        pair_code=VALUES(pair_code),
        status='Aktif'
      `,
      [Number(device_id), String(pair_code)]
    );

    res.json({ message: "OK", device_id, pair_code });
  })
);

// Route ini tetap ada untuk kompatibilitas manual, tapi alat baru tidak wajib pakai
app.post(
  "/api/iot/devices/:deviceId/history",
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.params.deviceId);
    const { tanggalMulai, tanggalMatang, durasi, status } = req.body || {};

    if (!tanggalMulai || !durasi || !status) {
      return res.status(400).json({ message: "tanggalMulai/durasi/status wajib" });
    }

    const [[openHistory]] = await pool.execute(
      `SELECT id FROM history_batches
       WHERE device_id = ? AND status <> 'Selesai'
       ORDER BY id DESC LIMIT 1`,
      [deviceId]
    );

    if (openHistory) {
      return res.json({ message: "OK", batch_id: openHistory.id, reused: true });
    }

    const [result] = await pool.execute(
      `INSERT INTO history_batches (device_id, tanggal_mulai, tanggal_matang, durasi, status)
       VALUES (?, ?, ?, ?, ?)`,
      [deviceId, tanggalMulai, tanggalMatang || null, durasi, status]
    );

    res.json({ message: "OK", batch_id: result.insertId });
  })
);

app.post(
  "/api/iot/devices/:deviceId/monitoring",
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.params.deviceId);
    // Mengambil data langsung dari req.body agar konsisten
    const {
      batch_id,
      ts,
      suhu,
      kelembaban,
      ph,
      gas,
      pengaduk,
      pompa,
      fan,
      status,
      mu_suhu_json,
      mu_kelembaban_json,
      mu_ph_json,
      mu_gas_json,
      rule_aktif_text,
      fuzzy_output,
    } = req.body || {};

    if (!ts) {
      return res.status(400).json({ message: "ts wajib" });
    }

    // 1. Tentukan Batch ID (History) yang sedang berjalan
    const openHistory = await resolveOpenHistory(deviceId, ts, batch_id);
    const historyId = Number(openHistory.id);

    // 2. Normalisasi status aktuator untuk database & perbandingan
    const pengadukText = normalizeActuatorText(pengaduk);
    const pompaText = normalizeActuatorText(pompa);
    const fanText = normalizeActuatorText(fan);

    // 3. Ambil data terakhir dari DB sebelum data baru masuk (untuk deteksi perubahan status)
    const [prevRows] = await pool.execute(
      `SELECT pengaduk, pompa, fan, status, gas
       FROM monitoring_rows
       WHERE device_id = ?
       ORDER BY ts DESC
       LIMIT 1`,
      [deviceId]
    );
    const prev = prevRows[0] || null;

    // 4. Simpan data baru ke Database
    const actualsTs = new Date()

    await pool.execute(
      `INSERT INTO monitoring_rows
       (
         device_id, batch_id, ts, suhu, kelembaban, ph, gas,
         pengaduk, pompa, fan, status,
         mu_suhu_json, mu_kelembaban_json, mu_ph_json, mu_gas_json,
         rule_aktif_text, fuzzy_output
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deviceId, historyId, actualsTs, suhu ?? null, kelembaban ?? null, ph ?? null, gas ?? null,
        pengadukText, pompaText, fanText, status ?? null,
        mu_suhu_json || null, mu_kelembaban_json || null, mu_ph_json || null, mu_gas_json || null,
        rule_aktif_text || null, fuzzy_output ?? null,
      ]
    );

    // 5. Update lama hari di tabel history_batches
    await updateHistoryProgress(historyId, deviceId, actualsTs, status);

    // ==========================================
    // LOGIKA NOTIFIKASI TELEGRAM (FINAL)
    // ==========================================
    
    const statusNow = String(status || "");
    const statusPrev = prev?.status ? String(prev.status) : "";

    // Deteksi kenaikan status (Mati -> Aktif)
    const motorNowAktif = pengadukText === "Aktif";
    const fanNowAktif = fanText === "Aktif";
    const pumpNowAktif = pompaText === "Aktif";

    const motorPrevAktif = prev?.pengaduk === "Aktif";
    const fanPrevAktif = prev?.fan === "Aktif";
    const pumpPrevAktif = prev?.pompa === "Aktif";

    const formatPesan = (pemicu) => {
      return `🌱 *Notifikasi Sauber Composter*\n` +
             `🔔 *Pemicu:* ${pemicu}\n` +
             `📊 *Status Kematangan:* ${statusNow || "-"}\n\n` +
             `⚙️ *Status Aktuator:*\n` +
             ` • Pengaduk : ${pengadukText}\n` +
             ` • Pompa EM4: ${pompaText}\n` +
             ` • Kipas    : ${fanText}\n\n` +
             `🕒 *Waktu:* ${ts}`;
    };

    let shouldNotify = false;
    let pemicuList = [];

    // A. Cek jika ada aktuator yang baru saja menyala
    if (motorNowAktif && !motorPrevAktif) { pemicuList.push("Pengaduk Aktif"); shouldNotify = true; }
    if (fanNowAktif && !fanPrevAktif) { pemicuList.push("Kipas Aktif"); shouldNotify = true; }
    if (pumpNowAktif && !pumpPrevAktif) { pemicuList.push("Pompa EM4 Aktif"); shouldNotify = true; }
    
    // B. Cek jika status kematangan berubah (misal: Belum Matang -> Setengah Matang)
    if (statusNow && statusNow !== statusPrev) { pemicuList.push("Status Berubah"); shouldNotify = true; }

    // C. Cek Alarm Gas Kritis (Safety)
    const gasNow = Number(gas ?? 0);
    if (gasNow >= 80) { pemicuList.push(`🚨 ALARM GAS (${gasNow})`); shouldNotify = true; }

    // D. Cek Jadwal Laporan Harian (24 Jam Sekali)
    const nowMs = Date.now();
    const lastDaily = lastDailyReportAt.get(deviceId) || 0;
    if (nowMs - lastDaily >= 24 * 60 * 60 * 1000) {
      pemicuList.push("Laporan Harian Rutin");
      shouldNotify = true;
      lastDailyReportAt.set(deviceId, nowMs);
    }

    // Eksekusi Pengiriman
    if (shouldNotify && pemicuList.length > 0) {
      await notifyDeviceUsers(deviceId, formatPesan(pemicuList.join(", ")));
    }

    res.json({
      message: "OK",
      history_id: historyId,
      process_status: statusNow === "Matang" ? "Selesai" : "Berjalan",
    });
  })
);

// ============================
// API UNTUK RESET / TUTUP BATCH LAMA DARI ALAT
// ============================
app.post(
  "/api/iot/devices/:deviceId/reset",
  asyncHandler(async (req, res) => {
    const deviceId = Number(req.params.deviceId);

    // Ubah status batch yang masih berjalan menjadi 'Selesai'
    await pool.execute(
      `UPDATE history_batches 
       SET status = 'Selesai', 
           tanggal_matang = CURDATE() 
       WHERE device_id = ? AND status <> 'Selesai'`,
      [deviceId]
    );

    res.json({ message: "Batch lama berhasil ditutup" });
  })
);

// ============================
// TELEGRAM BOT
// ============================
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (botToken) {
  tgBot = new Telegraf(botToken);

  tgBot.start(async (ctx) => {
    const name = await upsertTelegramUser(ctx.from);
    await ctx.reply(
      `Halo ${name}!\n\nKetik:\n/pair KODE\nuntuk menghubungkan alat.\nContoh: /pair 482193`
    );
  });

  tgBot.hears(/^\/pair\s+(\S+)/i, async (ctx) => {
    await upsertTelegramUser(ctx.from);
    const code = String(ctx.match[1]).trim();

    const [devices] = await pool.execute(
      `SELECT device_id FROM devices WHERE pair_code=? LIMIT 1`,
      [code]
    );

    if (!devices.length) {
      return ctx.reply("Kode pairing tidak ditemukan / salah.");
    }

    const deviceId = devices[0].device_id;

    await pool.execute(
      `INSERT INTO device_users (device_id, telegram_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE device_id=device_id`,
      [deviceId, ctx.from.id]
    );

    ctx.reply(`✅ Berhasil terhubung ke alat ID ${deviceId}.`);
  });

  tgBot.launch().then(() => console.log("🤖 Telegram bot running (polling)"));
} else {
  console.log("⚠️ TELEGRAM_BOT_TOKEN belum diisi di .env");
}

// ============================
// ERROR HANDLER
// ============================
app.use((err, req, res, next) => {
  console.error("ERROR:", err);
  res.status(500).json({
    message: "Internal Server Error",
    detail: String(err?.message || err),
  });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`✅ Backend running: http://localhost:${port}`);
});