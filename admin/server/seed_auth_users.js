require("dotenv").config();
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

function slugUsername(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_");
}

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "kompos_db",
  });

  const DEVICE_ID = 101;
  const PAIR_CODE = "482193"; // bebas, yang penting device-nya ada

  // ===== Pastikan DEVICE ada =====
  await pool.execute(
    `INSERT INTO devices (device_id, pair_code, status)
     VALUES (?, ?, 'Aktif')
     ON DUPLICATE KEY UPDATE pair_code=VALUES(pair_code), status='Aktif'`,
    [DEVICE_ID, PAIR_CODE]
  );

  // ===== ADMIN =====
  const adminPass = "admin123";
  const adminHash = await bcrypt.hash(adminPass, 10);

  await pool.execute(
    `INSERT INTO auth_users (username, password_hash, role, device_id, is_active)
     VALUES (?, ?, 'admin', NULL, 1)
     ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), role='admin', is_active=1, device_id=NULL`,
    ["admin", adminHash]
  );

  console.log("✅ admin -> username: admin | password:", adminPass);

  // ===== USERS (buat login web + buat daftar pengguna admin) =====
  const userPass = "kompos123";
  const userHash = await bcrypt.hash(userPass, 10);

  const names = [
    "Hartatik",
    "Suratmi",
    "Sri Hariati",
    "Dwi shela kartikasari",
    "April liana urbanyati",
    "Sukesi Diyan Pertiwi",
    "Ozi",
    "Khoyimatul laila",
    "Siti badriah",
    "Kholima",
    "Wati",
    "Rina yusnita",
    "Ima lestari",
    "Sohibul Fa'il",
    "Jihannada Tsaltsa Bila Najla",
    "andien",
    "Maryati",
    "Irwanto",
    "Mudana",
    "User Dummy 20", // <-- biar jadi 20
  ];

  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    const u = slugUsername(n);

    // (A) Seed akun login web (auth_users)
    await pool.execute(
      `INSERT INTO auth_users (username, password_hash, role, device_id, is_active)
       VALUES (?, ?, 'user', ?, 1)
       ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), role='user', is_active=1, device_id=VALUES(device_id)`,
      [u, userHash, DEVICE_ID]
    );

    // (B) Seed "users" (profil telegram) supaya muncul di tabel admin /api/users
    const telegramId = 1630800000 + (i + 1); // dummy unik
    const firstName = n.split(" ")[0] || n;

    await pool.execute(
      `INSERT INTO users (telegram_id, tg_username, tg_first_name, tg_last_name, display_name)
       VALUES (?, ?, ?, NULL, ?)
       ON DUPLICATE KEY UPDATE
         tg_username=VALUES(tg_username),
         tg_first_name=VALUES(tg_first_name),
         display_name=VALUES(display_name),
         updated_at=CURRENT_TIMESTAMP`,
      [telegramId, u, firstName, n]
    );

    // (C) Hubungkan user telegram ke device 101 (device_users)
    await pool.execute(
      `INSERT INTO device_users (device_id, telegram_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE device_id=VALUES(device_id)`,
      [DEVICE_ID, telegramId]
    );

    console.log(`✅ user -> ${n} | login: ${u}/${userPass} | telegram_id: ${telegramId} | device: ${DEVICE_ID}`);
  }

  await pool.end();
  console.log("DONE.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});