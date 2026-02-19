// server/routes/clients.js
const express = require("express");
const router = express.Router();

const { getDb } = require("../db/sqlite"); // ✅ esto
const {
  apiError,
  isNonEmptyString,
  trimOrNull,
  isEmail,
  parsePagination,
  pickSort,
} = require("../middleware/validate");
const { mustExistOr404 } = require("../db/repo");
const { requireAdmin } = require("../middleware/auth");

// Helper: obtené la DB cuando la necesites
function db() {
  return getDb();
}

// LIST
router.get("/", requireAdmin, (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { safeSort, safeDir } = pickSort(
    req.query,
    ["created_at", "full_name", "updated_at"],
    "created_at"
  );

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

  const where = ["deleted_at IS NULL"];
  const params = {};

  if (status) {
    where.push("status = @status");
    params.status = status;
  }

  if (search) {
    where.push(`(
      full_name LIKE @q OR
      email LIKE @q OR
      phone LIKE @q OR
      dni LIKE @q
    )`);
    params.q = `%${search}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const items = db()
    .prepare(
      `SELECT id, full_name, dni, email, phone, address, notes, status, created_at, updated_at
       FROM clients
       ${whereSql}
       ORDER BY ${safeSort} ${safeDir}
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset });

  const total =
    db()
      .prepare(`SELECT COUNT(*) as c FROM clients ${whereSql}`)
      .get(params)?.c ?? 0;

  return res.json({ page, limit, total, items });
});

// GET ONE
router.get("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const row = db()
    .prepare(
      `SELECT id, full_name, dni, email, phone, address, notes, status, created_at, updated_at
       FROM clients
       WHERE id = ? AND deleted_at IS NULL`
    )
    .get(id);

  if (!mustExistOr404(res, row, "client")) return;
  return res.json(row);
});

// Cambiar SOLO status (acción rápida dashboard)
router.put("/:id/status", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const status = trimOrNull(req.body.status);
  if (!["active", "inactive", "prospect"].includes(status)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid status", { field: "status" });
  }

  const current = db()
    .prepare(`SELECT id FROM clients WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!mustExistOr404(res, current, "client")) return;

  db().prepare(`
    UPDATE clients
    SET status = ?, updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).run(status, id);

  return res.json({ ok: true });
});


// CREATE
router.post("/", requireAdmin, (req, res) => {
  const full_name = trimOrNull(req.body.full_name);
  const dni = trimOrNull(req.body.dni);
  const email = trimOrNull(req.body.email);
  const phone = trimOrNull(req.body.phone);
  const address = trimOrNull(req.body.address);
  const notes = trimOrNull(req.body.notes);
  const status = trimOrNull(req.body.status) ?? "active";

  if (!isNonEmptyString(full_name, 3, 120)) {
    return apiError(res, 400, "VALIDATION_ERROR", "full_name is required (3-120 chars)", {
      field: "full_name",
    });
  }
  if (email && !isEmail(email)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid email", { field: "email" });
  }
  if (!["active", "inactive", "prospect"].includes(status)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid status", { field: "status" });
  }

  if (email) {
    const exists = db()
      .prepare(`SELECT 1 FROM clients WHERE email = ? AND deleted_at IS NULL LIMIT 1`)
      .get(email);
    if (exists) return apiError(res, 409, "CONFLICT", "Email already exists");
  }
  if (dni) {
    const exists = db()
      .prepare(`SELECT 1 FROM clients WHERE dni = ? AND deleted_at IS NULL LIMIT 1`)
      .get(dni);
    if (exists) return apiError(res, 409, "CONFLICT", "DNI already exists");
  }

  const info = db()
    .prepare(
      `INSERT INTO clients (full_name, dni, email, phone, address, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(full_name, dni, email, phone, address, notes, status);

  return res.status(201).json({ id: info.lastInsertRowid });
});

// UPDATE (PUT)
router.put("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const full_name = trimOrNull(req.body.full_name);
  const dni = trimOrNull(req.body.dni);
  const email = trimOrNull(req.body.email);
  const phone = trimOrNull(req.body.phone);
  const address = trimOrNull(req.body.address);
  const notes = trimOrNull(req.body.notes);
  const status = trimOrNull(req.body.status) ?? "active";

  if (!isNonEmptyString(full_name, 3, 120)) {
    return apiError(res, 400, "VALIDATION_ERROR", "full_name is required (3-120 chars)", {
      field: "full_name",
    });
  }
  if (email && !isEmail(email)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid email", { field: "email" });
  }
  if (!["active", "inactive", "prospect"].includes(status)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid status", { field: "status" });
  }

  const current = db()
    .prepare(`SELECT id, email, dni FROM clients WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!mustExistOr404(res, current, "client")) return;

  if (email && email !== current.email) {
    const exists = db()
      .prepare(`SELECT 1 FROM clients WHERE email = ? AND deleted_at IS NULL LIMIT 1`)
      .get(email);
    if (exists) return apiError(res, 409, "CONFLICT", "Email already exists");
  }
  if (dni && dni !== current.dni) {
    const exists = db()
      .prepare(`SELECT 1 FROM clients WHERE dni = ? AND deleted_at IS NULL LIMIT 1`)
      .get(dni);
    if (exists) return apiError(res, 409, "CONFLICT", "DNI already exists");
  }

  db()
    .prepare(
      `UPDATE clients SET
        full_name = ?,
        dni = ?,
        email = ?,
        phone = ?,
        address = ?,
        notes = ?,
        status = ?,
        updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL`
    )
    .run(full_name, dni, email, phone, address, notes, status, id);

  return res.json({ ok: true });
});
// Cambiar SOLO el estado (acción rápida para dashboard)
router.put("/:id/status", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const status = trimOrNull(req.body.status);
  if (!["active", "inactive", "prospect"].includes(status)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid status", { field: "status" });
  }

  const current = db()
    .prepare(`SELECT id FROM clients WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!mustExistOr404(res, current, "client")) return;

  db()
    .prepare(`
      UPDATE clients
      SET status = ?,
          updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `)
    .run(status, id);

  return res.json({ ok: true });
});

// Nota rápida del cliente (para dashboard)
router.put("/:id/notes", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const notes = trimOrNull(req.body.notes);

  const current = db()
    .prepare(`SELECT id FROM clients WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!mustExistOr404(res, current, "client")) return;

  db()
    .prepare(`
      UPDATE clients
      SET notes = ?,
          updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `)
    .run(notes, id);

  return res.json({ ok: true });
});


// DELETE (soft)
router.delete("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const info = db()
    .prepare(
      `UPDATE clients SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL`
    )
    .run(id);

  if (info.changes === 0) return apiError(res, 404, "NOT_FOUND", "client not found");
  return res.json({ ok: true });
});

module.exports = router;
