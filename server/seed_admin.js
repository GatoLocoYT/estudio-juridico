/*
 Sistema Web Estudio Jurídico
 Autor: Ramiro Rahman Rintoul
 Copyright © 2026
 Uso restringido - No redistribuir
*/
const bcrypt = require("bcrypt");
const { getDb } = require("./db/sqlite");

function ensureAdminSeed() {
  const db = getDb();

  // ✅ En producción: OBLIGATORIO setear variables, no hay defaults inseguros
  const emailRaw = process.env.SEED_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "";
  const passRaw = process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "";
  const nameRaw = process.env.SEED_ADMIN_NAME || process.env.ADMIN_FULL_NAME || "Administrador";

  const email = String(emailRaw).trim().toLowerCase();
  const password = String(passRaw);
  const fullName = String(nameRaw).trim() || "Administrador";

  if (!email || !password) {
    console.log("[SEED] Admin seed: variables no configuradas (SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD). Skip");
    return { ok: false, reason: "missing_env" };
  }

  const existing = db.prepare(`SELECT id, is_active FROM users WHERE email = ?`).get(email);

  if (existing) {
    // opcional: reactivar admin si estaba deshabilitado
    if (!existing.is_active && process.env.SEED_ADMIN_REACTIVATE === "1") {
      db.prepare(`UPDATE users SET is_active = 1 WHERE id = ?`).run(existing.id);
      console.log("[SEED] Admin reactivado:", email);
      return { ok: true, action: "reactivated", email };
    }

    console.log("[SEED] Admin ya existe:", email);
    return { ok: true, action: "exists", email };
  }

  const hash = bcrypt.hashSync(password, 12);

  db.prepare(`
    INSERT INTO users (email, full_name, role, password_hash, is_active)
    VALUES (?, ?, 'admin', ?, 1)
  `).run(email, fullName, hash);

  console.log("[SEED] Admin creado:", email);
  return { ok: true, action: "created", email };
}

module.exports = { ensureAdminSeed };
