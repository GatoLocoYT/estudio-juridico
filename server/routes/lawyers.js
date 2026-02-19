// server/routes/lawyers.js
/*
 Sistema Web Estudio Jurídico
 Autor: Ramiro Rahman Rintoul
 Copyright © 2026
 Uso restringido - No redistribuir
*/
const express = require("express");
const router = express.Router();

const { getDb } = require("../db/sqlite");
const { requireAdmin } = require("../middleware/auth");
const {
  apiError,
  trimOrNull,
  isNonEmptyString,
  isEmail,
  parsePagination,
  pickSort,
} = require("../middleware/validate");
const { mustExistOr404 } = require("../db/repo");

function db() {
  return getDb();
}

// LIST
router.get("/", requireAdmin, (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { safeSort, safeDir } = pickSort(
    req.query,
    ["created_at", "updated_at", "full_name", "status"],
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
      specialty LIKE @q
    )`);
    params.q = `%${search}%`;
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const items = db()
    .prepare(
      `SELECT id, full_name, email, specialty, status, created_at, updated_at
       FROM lawyers
       ${whereSql}
       ORDER BY ${safeSort} ${safeDir}
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset });

  const total =
    db()
      .prepare(`SELECT COUNT(*) as c FROM lawyers ${whereSql}`)
      .get(params)?.c ?? 0;

  return res.json({ page, limit, total, items });
});

// GET ONE
router.get("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const row = db()
    .prepare(
      `SELECT id, full_name, email, specialty, status, created_at, updated_at
       FROM lawyers
       WHERE id = ? AND deleted_at IS NULL`
    )
    .get(id);

  if (!mustExistOr404(res, row, "lawyer")) return;
  return res.json(row);
});

// CREATE
router.post("/", requireAdmin, (req, res) => {
  const full_name = trimOrNull(req.body.full_name);
  const email = trimOrNull(req.body.email);
  const specialty = trimOrNull(req.body.specialty);
  const status = trimOrNull(req.body.status) ?? "active";

  if (!isNonEmptyString(full_name, 3, 120)) {
    return apiError(res, 400, "VALIDATION_ERROR", "full_name is required (3-120)", {
      field: "full_name",
    });
  }
  if (email && !isEmail(email)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid email", { field: "email" });
  }
  if (!["active", "inactive"].includes(status)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid status", { field: "status" });
  }

  if (email) {
    const exists = db()
      .prepare(`SELECT 1 FROM lawyers WHERE email = ? AND deleted_at IS NULL LIMIT 1`)
      .get(email);
    if (exists) return apiError(res, 409, "CONFLICT", "Email already exists");
  }

  const info = db()
    .prepare(
      `INSERT INTO lawyers (full_name, email, specialty, status)
       VALUES (?, ?, ?, ?)`
    )
    .run(full_name, email, specialty, status);

  return res.status(201).json({ id: info.lastInsertRowid });
});

// UPDATE
router.put("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const full_name = trimOrNull(req.body.full_name);
  const email = trimOrNull(req.body.email);
  const specialty = trimOrNull(req.body.specialty);
  const status = trimOrNull(req.body.status) ?? "active";

  if (!isNonEmptyString(full_name, 3, 120)) {
    return apiError(res, 400, "VALIDATION_ERROR", "full_name is required (3-120)", {
      field: "full_name",
    });
  }
  if (email && !isEmail(email)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid email", { field: "email" });
  }
  if (!["active", "inactive"].includes(status)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid status", { field: "status" });
  }

  const current = db()
    .prepare(`SELECT id, email FROM lawyers WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!mustExistOr404(res, current, "lawyer")) return;

  if (email && email !== current.email) {
    const exists = db()
      .prepare(`SELECT 1 FROM lawyers WHERE email = ? AND deleted_at IS NULL LIMIT 1`)
      .get(email);
    if (exists) return apiError(res, 409, "CONFLICT", "Email already exists");
  }

  db()
    .prepare(
      `UPDATE lawyers SET
        full_name = ?,
        email = ?,
        specialty = ?,
        status = ?,
        updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL`
    )
    .run(full_name, email, specialty, status, id);

  return res.json({ ok: true });
});

// DELETE (soft)
router.delete("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const info = db()
    .prepare(
      `UPDATE lawyers
       SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL`
    )
    .run(id);

  if (info.changes === 0) return apiError(res, 404, "NOT_FOUND", "lawyer not found");
  return res.json({ ok: true });
});

module.exports = router;
