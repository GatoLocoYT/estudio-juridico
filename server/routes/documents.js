// server/routes/documents.js
const express = require("express");
const router = express.Router();

const { getDb } = require("../db/sqlite");

function db() {
  return getDb();
}

const { apiError, trimOrNull, toIntOrNull, parsePagination, pickSort, isNonEmptyString } = require("../middleware/validate");
const { requireAdmin } = require("../middleware/auth");
const { mustExistOr404 } = require("../db/repo");

function ensureCaseExists(case_id) {
  return db().prepare(`SELECT id, client_id FROM cases WHERE id = ? AND deleted_at IS NULL`).get(case_id);
}

router.get("/", requireAdmin, (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { safeSort, safeDir } = pickSort(req.query, ["created_at", "updated_at", "doc_type"], "created_at");

  const case_id = toIntOrNull(req.query.case_id);
  const type = typeof req.query.type === "string" ? req.query.type.trim() : "";

  const where = ["d.deleted_at IS NULL"];
  const params = {};

  if (case_id) {
    where.push("d.case_id = @case_id");
    params.case_id = case_id;
  }
  if (type) {
    where.push("d.doc_type = @type");
    params.type = type;
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const items = db().prepare(
    `SELECT d.id, d.case_id, d.filename, d.storage_path, d.mime_type, d.size_bytes, d.doc_type, d.description, d.created_at, d.updated_at
     FROM documents d
     ${whereSql}
     ORDER BY d.${safeSort} ${safeDir}
     LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit, offset });

  const total = db().prepare(
    `SELECT COUNT(*) as c FROM documents d ${whereSql}`
  ).get(params)?.c ?? 0;

  return res.json({ page, limit, total, items });
});

router.get("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const row = db().prepare(
    `SELECT id, case_id, filename, storage_path, mime_type, size_bytes, doc_type, description, created_at, updated_at
     FROM documents
     WHERE id = ? AND deleted_at IS NULL`
  ).get(id);

  if (!mustExistOr404(res, row, "document")) return;
  return res.json(row);
});

router.post("/", requireAdmin, (req, res) => {
  const case_id = toIntOrNull(req.body.case_id);
  const filename = trimOrNull(req.body.filename);
  const storage_path = trimOrNull(req.body.storage_path);
  const mime_type = trimOrNull(req.body.mime_type);
  const size_bytes = toIntOrNull(req.body.size_bytes);
  const doc_type = trimOrNull(req.body.doc_type) ?? "other";
  const description = trimOrNull(req.body.description);

  if (!case_id) return apiError(res, 400, "VALIDATION_ERROR", "case_id is required", { field: "case_id" });
  if (!isNonEmptyString(filename, 1, 255)) return apiError(res, 400, "VALIDATION_ERROR", "filename required", { field: "filename" });
  if (!isNonEmptyString(storage_path, 3, 500)) return apiError(res, 400, "VALIDATION_ERROR", "storage_path required", { field: "storage_path" });
  if (size_bytes !== null && size_bytes < 0) return apiError(res, 400, "VALIDATION_ERROR", "size_bytes must be >= 0", { field: "size_bytes" });

  if (!["contract","evidence","court_filing","id","power_of_attorney","other"].includes(doc_type)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid doc_type", { field: "doc_type" });
  }

  if (!ensureCaseExists(case_id)) return apiError(res, 404, "NOT_FOUND", "case not found");

  const info = db().prepare(
    `INSERT INTO documents (case_id, filename, storage_path, mime_type, size_bytes, doc_type, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(case_id, filename, storage_path, mime_type, size_bytes, doc_type, description);

  return res.status(201).json({ id: info.lastInsertRowid });
});

router.put("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const case_id = toIntOrNull(req.body.case_id);
  const filename = trimOrNull(req.body.filename);
  const storage_path = trimOrNull(req.body.storage_path);
  const mime_type = trimOrNull(req.body.mime_type);
  const size_bytes = toIntOrNull(req.body.size_bytes);
  const doc_type = trimOrNull(req.body.doc_type) ?? "other";
  const description = trimOrNull(req.body.description);

  if (!case_id) return apiError(res, 400, "VALIDATION_ERROR", "case_id is required", { field: "case_id" });
  if (!isNonEmptyString(filename, 1, 255)) return apiError(res, 400, "VALIDATION_ERROR", "filename required", { field: "filename" });
  if (!isNonEmptyString(storage_path, 3, 500)) return apiError(res, 400, "VALIDATION_ERROR", "storage_path required", { field: "storage_path" });
  if (size_bytes !== null && size_bytes < 0) return apiError(res, 400, "VALIDATION_ERROR", "size_bytes must be >= 0", { field: "size_bytes" });

  if (!["contract","evidence","court_filing","id","power_of_attorney","other"].includes(doc_type)) {
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid doc_type", { field: "doc_type" });
  }

  const current = db().prepare(`SELECT id FROM documents WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!mustExistOr404(res, current, "document")) return;

  if (!ensureCaseExists(case_id)) return apiError(res, 404, "NOT_FOUND", "case not found");

  db().prepare(
    `UPDATE documents SET
      case_id = ?,
      filename = ?,
      storage_path = ?,
      mime_type = ?,
      size_bytes = ?,
      doc_type = ?,
      description = ?,
      updated_at = datetime('now')
     WHERE id = ? AND deleted_at IS NULL`
  ).run(case_id, filename, storage_path, mime_type, size_bytes, doc_type, description, id);

  return res.json({ ok: true });
});

router.delete("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const info = db().prepare(
    `UPDATE documents SET deleted_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND deleted_at IS NULL`
  ).run(id);

  if (info.changes === 0) return apiError(res, 404, "NOT_FOUND", "document not found");
  return res.json({ ok: true });
});

module.exports = router;
