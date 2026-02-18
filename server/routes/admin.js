/*
 Sistema Web Estudio Jurídico
 Autor: Ramiro Rahman Rintoul
 Copyright © 2026
 Uso restringido - No redistribuir
*/
const express = require("express");
const bcrypt = require("bcrypt");
const { getDb } = require("../db/sqlite");
const {
  requireAuth,
  requireRole,
  createSession,
  clearSession,
  revokeCurrentSession,
} = require("../middleware/session");

const router = express.Router();

// Login
router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  const e = String(email || "").trim().toLowerCase();
  const p = String(password || "");

  if (!e || !p) return res.status(400).json({ ok: false, error: "Email y contraseña requeridos" });

  const db = getDb();
  const user = db.prepare(`
    SELECT id, email, full_name, role, password_hash, is_active
    FROM users
    WHERE email = ?
  `).get(e);

  // Respuesta uniforme para no filtrar si existe
  if (!user || !user.is_active) {
    return res.status(401).json({ ok: false, error: "Credenciales inválidas" });
  }

  const ok = bcrypt.compareSync(p, user.password_hash);
  if (!ok) return res.status(401).json({ ok: false, error: "Credenciales inválidas" });

  createSession(res, {
    userId: user.id,
    ip: req.ip,
    userAgent: req.headers["user-agent"] || null,
  });

  return res.json({
    ok: true,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
  });
});

// Me
router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Logout
router.post("/logout", requireAuth, (req, res) => {
  revokeCurrentSession(req);
  clearSession(res);
  res.json({ ok: true });
});

// Listar consultas (solo roles internos)
router.get("/consultations", requireAuth, requireRole(["admin", "abogado", "asistente"]), (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.id, c.full_name, c.email, c.phone, c.area, c.status, c.urgency,
           c.created_at, c.updated_at,
           u.full_name as assigned_name
    FROM consultations c
    LEFT JOIN users u ON u.id = c.assigned_to
    ORDER BY c.created_at DESC
    LIMIT 200
  `).all();

  res.json({ ok: true, consultations: rows });
});

// Dashboard (KPIs + actividad reciente)
router.get(
  "/dashboard",
  requireAuth,
  requireRole(["admin", "abogado", "asistente"]),
  (req, res) => {
    const db = getDb();

    try {
      // KPIs
      const clients = db.prepare("SELECT COUNT(*) as n FROM clients").get().n;
      const cases = db.prepare("SELECT COUNT(*) as n FROM cases").get().n;
      const appointments = db.prepare("SELECT COUNT(*) as n FROM appointments").get().n;
      const documents = db.prepare("SELECT COUNT(*) as n FROM documents").get().n;

      // Actividad reciente (ejemplo simple)
      const recentActivity = db.prepare(`
        SELECT
          'case' as type,
          title,
          status,
          updated_at as at,
          id
        FROM cases
        ORDER BY updated_at DESC
        LIMIT 10
      `).all();

      res.json({
        ok: true,
        kpis: {
          clients,
          cases,
          appointments,
          documents,
        },
        recentActivity,
      });

    } catch (err) {
      console.error("[DASHBOARD]", err);
      res.status(500).json({ ok: false, error: "Error al cargar dashboard" });
    }
  }
);

// Registrar usuario interno (solo admin)
router.post(
  "/register",
  requireAuth,
  requireRole(["admin"]),
  async (req, res) => {
    const { email, password, full_name, role } = req.body || {};

    // Validaciones básicas
    if (!email || !password || !full_name || !role) {
      return res.status(400).json({
        ok: false,
        error: "Faltan campos requeridos",
      });
    }

    const validRoles = ["admin", "abogado", "asistente"];

    if (!validRoles.includes(role)) {
      return res.status(400).json({
        ok: false,
        error: "Rol inválido",
      });
    }

    const e = String(email).trim().toLowerCase();

    const db = getDb();

    try {
      // ¿Ya existe?
      const exists = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(e);

      if (exists) {
        return res.status(409).json({
          ok: false,
          error: "El usuario ya existe",
        });
      }

      // Hash password
      const hash = await bcrypt.hash(password, 12);

      // Insert
      db.prepare(`
        INSERT INTO users (email, full_name, role, password_hash, is_active)
        VALUES (?, ?, ?, ?, 1)
      `).run(e, full_name.trim(), role, hash);

      res.json({
        ok: true,
        message: "Usuario creado",
      });

    } catch (err) {
      console.error("[REGISTER]", err);
      res.status(500).json({
        ok: false,
        error: "Error al crear usuario",
      });
    }
  }
);



module.exports = router;
