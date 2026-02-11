require("dotenv").config();
const bcrypt = require("bcrypt");
const { getDb } = require("./db/sqlite");

const email = (process.env.SEED_ADMIN_EMAIL || "admin@estudio.com").toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD || "CambiarEsto123!";
const fullName = process.env.SEED_ADMIN_NAME || "Administrador";

const db = getDb();

const exists = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
if (exists) {
  console.log("Admin ya existe:", email);
  process.exit(0);
}

const hash = bcrypt.hashSync(password, 12);

db.prepare(`
  INSERT INTO users (email, full_name, role, password_hash, is_active)
  VALUES (?, ?, 'admin', ?, 1)
`).run(email, fullName, hash);

console.log("Admin creado:");
console.log("Email:", email);
console.log("Password:", password);
