const express = require("express");
const router = express.Router();

const { getDb } = require("../db/sqlite");
const { apiError, parsePagination, pickSort } = require("../middleware/validate");
const { mustExistOr404 } = require("../db/repo");
const { requireAdmin } = require("../middleware/auth");

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

  const whereSql = "WHERE deleted_at IS NULL";

  const items = db()
    .prepare(`
      SELECT id, full_name, email, specialty, status, created_at, updated_at
      FROM lawyers
      ${whereSql}
      ORDER BY ${safeSort} ${safeDir}
      LIMIT @limit OFFSET @offset
    `)
    .all({ limit, offset });

  const total =
    db()
      .prepare(`SELECT COUNT(*) as c FROM lawyers ${whereSql}`)
      .get()?.c ?? 0;

  return res.json({ page, limit, total, items });
});

// GET ONE
router.get("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const row = db()
    .prepare(`
      SELECT id, full_name, email, specialty, status, created_at, updated_at
      FROM lawyers
      WHERE id = ? AND deleted_at IS NULL
    `)
    .get(id);

  if (!mustExistOr404(res, row, "lawyer")) return;
  return res.json(row);
});

// CREATE
router.post("/", requireAdmin, (req, res) => {
  const { full_name, email, specialty } = req.body;

  if (!full_name || full_name.trim().length < 3) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid full_name");
  }

  const info = db()
    .prepare(`
      INSERT INTO lawyers (full_name, email, specialty)
      VALUES (?, ?, ?)
    `)
    .run(full_name.trim(), email || null, specialty || null);

  return res.status(201).json({ id: info.lastInsertRowid });
});

// UPDATE
router.put("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const current = db()
    .prepare(`SELECT id FROM lawyers WHERE id = ? AND deleted_at IS NULL`)
    .get(id);

  if (!mustExistOr404(res, current, "lawyer")) return;

  const { full_name, email, specialty, status } = req.body;

  db()
    .prepare(`
      UPDATE lawyers SET
        full_name = ?,
        email = ?,
        specialty = ?,
        status = ?,
        updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `)
    .run(
      full_name,
      email || null,
      specialty || null,
      status || "active",
      id
    );

  return res.json({ ok: true });
});

// DELETE (soft)
router.delete("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const info = db()
    .prepare(`
      UPDATE lawyers
      SET deleted_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `)
    .run(id);

  if (info.changes === 0)
    return apiError(res, 404, "NOT_FOUND", "lawyer not found");

  return res.json({ ok: true });
});

module.exports = router;
