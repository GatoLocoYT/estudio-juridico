// server/routes/cases.js
const express = require("express");
const router = express.Router();

const { getDb } = require("../db/sqlite");

function db() {
  return getDb();
}

const { apiError, isNonEmptyString, trimOrNull, toIntOrNull, parsePagination, pickSort } = require("../middleware/validate");
const { mustExistOr404 } = require("../db/repo");
const { requireAdmin } = require("../middleware/auth");

function ensureClientExists(client_id) {
    return db().prepare(`SELECT id FROM clients WHERE id = ? AND deleted_at IS NULL`).get(client_id);
}

router.get("/", requireAdmin, (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const { safeSort, safeDir } = pickSort(req.query, ["created_at", "updated_at", "opened_at", "status", "priority"], "created_at");

    const client_id = toIntOrNull(req.query.client_id);
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const priority = typeof req.query.priority === "string" ? req.query.priority.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const where = ["c.deleted_at IS NULL"];
    const params = {};

    if (client_id) {
        where.push("c.client_id = @client_id");
        params.client_id = client_id;
    }
    if (status) {
        where.push("c.status = @status");
        params.status = status;
    }
    if (priority) {
        where.push("c.priority = @priority");
        params.priority = priority;
    }
    if (search) {
        where.push("(c.title LIKE @q OR c.area LIKE @q OR c.description LIKE @q)");
        params.q = `%${search}%`;
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const items = db().prepare(
        `SELECT
      c.id, c.client_id, cl.full_name as client_name,
      c.title, c.area, c.status, c.priority, c.description,
      c.opened_at, c.closed_at, c.created_at, c.updated_at
     FROM cases c
     JOIN clients cl
  ON cl.id = c.client_id
 AND cl.deleted_at IS NULL

     ${whereSql}
     ORDER BY c.${safeSort} ${safeDir}
     LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit, offset });


    const total = db().prepare(
        `SELECT COUNT(*) as c
     FROM cases c
     ${whereSql}`
    ).get(params)?.c ?? 0;

    return res.json({ page, limit, total, items });
});

router.get("/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

    const row = db().prepare(
        `SELECT id, client_id, title, area, status, priority, description, opened_at, closed_at, created_at, updated_at
     FROM cases
     WHERE id = ? AND deleted_at IS NULL`
    ).get(id);

    if (!mustExistOr404(res, row, "case")) return;
    return res.json(row);
});

router.post("/", requireAdmin, (req, res) => {
    const client_id = toIntOrNull(req.body.client_id);
    const title = trimOrNull(req.body.title);
    const area = trimOrNull(req.body.area);
    const status = trimOrNull(req.body.status) ?? "open";
    const priority = trimOrNull(req.body.priority) ?? "normal";
    const description = trimOrNull(req.body.description);
    const opened_at = trimOrNull(req.body.opened_at) ?? null; // YYYY-MM-DD si querés setearlo
    const closed_at = trimOrNull(req.body.closed_at) ?? null;

    if (!client_id) return apiError(res, 400, "VALIDATION_ERROR", "client_id is required", { field: "client_id" });
    if (!isNonEmptyString(title, 3, 160)) return apiError(res, 400, "VALIDATION_ERROR", "title is required (3-160)", { field: "title" });
    if (!["open", "pending", "closed", "archived"].includes(status)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid status", { field: "status" });
    if (!["low", "normal", "high", "urgent"].includes(priority)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid priority", { field: "priority" });
    if (status === "closed" && !closed_at) return apiError(res, 400, "VALIDATION_ERROR", "closed_at required when status=closed", { field: "closed_at" });

    if (!ensureClientExists(client_id)) return apiError(res, 404, "NOT_FOUND", "client not found");

    const info = db().prepare(
        `INSERT INTO cases (client_id, title, area, status, priority, description, opened_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?)`
    ).run(client_id, title, area, status, priority, description, opened_at, closed_at);

    return res.status(201).json({ id: info.lastInsertRowid });
});

router.put("/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

    const client_id = toIntOrNull(req.body.client_id);
    const title = trimOrNull(req.body.title);
    const area = trimOrNull(req.body.area);
    const status = trimOrNull(req.body.status) ?? "open";
    const priority = trimOrNull(req.body.priority) ?? "normal";
    const description = trimOrNull(req.body.description);
    const opened_at = trimOrNull(req.body.opened_at) ?? null;
    const closed_at = trimOrNull(req.body.closed_at) ?? null;

    if (!client_id) return apiError(res, 400, "VALIDATION_ERROR", "client_id is required", { field: "client_id" });
    if (!isNonEmptyString(title, 3, 160)) return apiError(res, 400, "VALIDATION_ERROR", "title is required (3-160)", { field: "title" });
    if (!["open", "pending", "closed", "archived"].includes(status)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid status", { field: "status" });
    if (!["low", "normal", "high", "urgent"].includes(priority)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid priority", { field: "priority" });
    if (status === "closed" && !closed_at) return apiError(res, 400, "VALIDATION_ERROR", "closed_at required when status=closed", { field: "closed_at" });

    const current = db().prepare(`SELECT id FROM cases WHERE id = ? AND deleted_at IS NULL`).get(id);
    if (!mustExistOr404(res, current, "case")) return;

    if (!ensureClientExists(client_id)) return apiError(res, 404, "NOT_FOUND", "client not found");

    db().prepare(
        `UPDATE cases SET
      client_id = ?,
      title = ?,
      area = ?,
      status = ?,
      priority = ?,
      description = ?,
      opened_at = COALESCE(?, opened_at),
      closed_at = ?,
      updated_at = datetime('now')
     WHERE id = ? AND deleted_at IS NULL`
    ).run(client_id, title, area, status, priority, description, opened_at, closed_at, id);

    return res.json({ ok: true });
});

router.delete("/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

    const info = db().prepare(
        `UPDATE cases SET deleted_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND deleted_at IS NULL`
    ).run(id);

    if (info.changes === 0) return apiError(res, 404, "NOT_FOUND", "case not found");
    return res.json({ ok: true });
});

module.exports = router;
