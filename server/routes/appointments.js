// server/routes/appointments.js
const express = require("express");
const router = express.Router();

const { getDb } = require("../db/sqlite");

function db() {
  return getDb();
}

const {
    apiError,
    trimOrNull,
    toIntOrNull,
    isIsoDatetime,
    parsePagination,
    pickSort,
    isNonEmptyString,
} = require("../middleware/validate");
const { requireAdmin } = require("../middleware/auth");
const { mustExistOr404 } = require("../db/repo");

function ensureClientExists(client_id) {
    return db().prepare(`SELECT id FROM clients WHERE id = ? AND deleted_at IS NULL`).get(client_id);
}

function ensureCaseExists(case_id) {
    return db().prepare(`SELECT id, client_id FROM cases WHERE id = ? AND deleted_at IS NULL`).get(case_id);
}

function checkOverlap({ id = null, lawyer_id, start_at, end_at }) {
    const row = db.get(
        `
    SELECT 1
    FROM appointments a
    WHERE a.deleted_at IS NULL
      AND a.status IN ('scheduled','confirmed')
      AND a.lawyer_id = @lawyer_id
      AND NOT (
        a.end_at <= @start_at OR
        a.start_at >= @end_at
      )
      AND (@id IS NULL OR a.id <> @id)
    LIMIT 1;
    `,
        { id, lawyer_id, start_at, end_at }
    );

    return !!row;
}


function validateAppointmentBody(body, res) {
    const client_id = toIntOrNull(body.client_id);
    const case_id = toIntOrNull(body.case_id);
    const start_at = trimOrNull(body.start_at);
    const end_at = trimOrNull(body.end_at);
    const channel = trimOrNull(body.channel) ?? "in_person";
    const status = trimOrNull(body.status) ?? "scheduled";
    const title = trimOrNull(body.title);
    const notes = trimOrNull(body.notes);

    if (!client_id) return apiError(res, 400, "VALIDATION_ERROR", "client_id is required", { field: "client_id" });
    if (!start_at || !isIsoDatetime(start_at)) return apiError(res, 400, "VALIDATION_ERROR", "start_at must be 'YYYY-MM-DD HH:MM:SS'", { field: "start_at" });
    if (!end_at || !isIsoDatetime(end_at)) return apiError(res, 400, "VALIDATION_ERROR", "end_at must be 'YYYY-MM-DD HH:MM:SS'", { field: "end_at" });

    if (!["in_person", "phone", "video"].includes(channel)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid channel", { field: "channel" });
    if (!["scheduled", "confirmed", "cancelled", "done", "no_show"].includes(status)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid status", { field: "status" });

    // Check duración básica (15..240 min)
    const startMs = Date.parse(start_at.replace(" ", "T"));
    const endMs = Date.parse(end_at.replace(" ", "T"));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid datetime values");
    if (endMs <= startMs) return apiError(res, 400, "VALIDATION_ERROR", "end_at must be after start_at");
    const mins = (endMs - startMs) / 60000;
    if (mins < 15 || mins > 240) return apiError(res, 400, "VALIDATION_ERROR", "Appointment duration must be between 15 and 240 minutes", { field: "end_at" });

    if (title && !isNonEmptyString(title, 1, 120)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid title", { field: "title" });

    return { client_id, case_id, start_at, end_at, channel, status, title, notes };
}

router.get("/", requireAdmin, (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const { safeSort, safeDir } = pickSort(req.query, ["start_at", "created_at", "updated_at", "status"], "start_at");

    const from = trimOrNull(req.query.from); // 'YYYY-MM-DD HH:MM:SS'
    const to = trimOrNull(req.query.to);
    const status = trimOrNull(req.query.status);
    const client_id = toIntOrNull(req.query.client_id);
    const case_id = toIntOrNull(req.query.case_id);

    const where = ["a.deleted_at IS NULL"];
    const params = {};

    if (from) { where.push("a.start_at >= @from"); params.from = from; }
    if (to) { where.push("a.start_at < @to"); params.to = to; }
    if (status) { where.push("a.status = @status"); params.status = status; }
    if (client_id) { where.push("a.client_id = @client_id"); params.client_id = client_id; }
    if (case_id) { where.push("a.case_id = @case_id"); params.case_id = case_id; }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const items = db().prepare(
        `SELECT
      a.id, a.client_id, cl.full_name as client_name,
      a.case_id, a.start_at, a.end_at, a.channel, a.status, a.title, a.notes,
      a.created_at, a.updated_at
     FROM appointments a
     JOIN clients cl
  ON cl.id = a.client_id
 AND cl.deleted_at IS NULL

LEFT JOIN cases c
  ON c.id = a.case_id
 AND c.deleted_at IS NULL

LEFT JOIN lawyers lw
  ON lw.id = a.lawyer_id
 AND lw.deleted_at IS NULL

     ${whereSql}
     ORDER BY a.${safeSort} ${safeDir}
     LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit, offset });

    const total = db().prepare(
        `SELECT COUNT(*) as c
     FROM appointments a
     ${whereSql}`
    ).get(params)?.c ?? 0;

    return res.json({ page, limit, total, items });
});

router.get("/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

    const row = db().prepare(
        `SELECT id, client_id, case_id, start_at, end_at, channel, status, title, notes, created_at, updated_at
     FROM appointments
     WHERE id = ? AND deleted_at IS NULL`
    ).get(id);

    if (!mustExistOr404(res, row, "appointment")) return;
    return res.json(row);
});

router.post("/", requireAdmin, (req, res) => {
    const data = validateAppointmentBody(req.body, res);
    if (!data) return; // ya respondió con error

    if (!ensureClientExists(data.client_id)) return apiError(res, 404, "NOT_FOUND", "client not found");

    if (data.case_id) {
        const c = ensureCaseExists(data.case_id);
        if (!c) return apiError(res, 404, "NOT_FOUND", "case not found");
        // V1: forzamos consistencia cliente-caso
        if (c.client_id !== data.client_id) return apiError(res, 400, "VALIDATION_ERROR", "case_id does not belong to client_id");
    }

    // Si el turno no está cancelado/done/no_show, controlamos solapamiento
    if (["scheduled", "confirmed"].includes(data.status)) {
        const conflict = checkOverlap({ start_at: data.start_at, end_at: data.end_at });
        if (conflict) return apiError(res, 409, "CONFLICT", "Appointment overlaps with existing booking");
    }

    const info = db().prepare(
        `INSERT INTO appointments (client_id, case_id, start_at, end_at, channel, status, title, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(data.client_id, data.case_id, data.start_at, data.end_at, data.channel, data.status, data.title, data.notes);

    return res.status(201).json({ id: info.lastInsertRowid });
});

router.put("/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

    const current = db().prepare(`SELECT id FROM appointments WHERE id = ? AND deleted_at IS NULL`).get(id);
    if (!mustExistOr404(res, current, "appointment")) return;

    const data = validateAppointmentBody(req.body, res);
    if (!data) return;

    if (!ensureClientExists(data.client_id)) return apiError(res, 404, "NOT_FOUND", "client not found");

    if (data.case_id) {
        const c = ensureCaseExists(data.case_id);
        if (!c) return apiError(res, 404, "NOT_FOUND", "case not found");
        if (c.client_id !== data.client_id) return apiError(res, 400, "VALIDATION_ERROR", "case_id does not belong to client_id");
    }

    if (["scheduled", "confirmed"].includes(data.status)) {
        const conflict = checkOverlap({ start_at: data.start_at, end_at: data.end_at, excludeId: id });
        if (conflict) return apiError(res, 409, "CONFLICT", "Appointment overlaps with existing booking");
    }

    db().prepare(
        `UPDATE appointments SET
      client_id = ?,
      case_id = ?,
      start_at = ?,
      end_at = ?,
      channel = ?,
      status = ?,
      title = ?,
      notes = ?,
      updated_at = datetime('now')
     WHERE id = ? AND deleted_at IS NULL`
    ).run(data.client_id, data.case_id, data.start_at, data.end_at, data.channel, data.status, data.title, data.notes, id);

    return res.json({ ok: true });
});

// Estado: confirm
router.post("/:id/confirm", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

    const appt = db().prepare(
        `SELECT id, start_at, end_at FROM appointments WHERE id = ? AND deleted_at IS NULL`
    ).get(id);
    if (!mustExistOr404(res, appt, "appointment")) return;

    const conflict = checkOverlap({ start_at: appt.start_at, end_at: appt.end_at, excludeId: id });
    if (conflict) return apiError(res, 409, "CONFLICT", "Appointment overlaps with existing booking");

    db().prepare(
        `UPDATE appointments SET status = 'confirmed', updated_at = datetime('now')
     WHERE id = ? AND deleted_at IS NULL`
    ).run(id);

    return res.json({ ok: true });
});

// Estado: cancel
router.post("/:id/cancel", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

    const info = db().prepare(
        `UPDATE appointments SET status = 'cancelled', updated_at = datetime('now')
     WHERE id = ? AND deleted_at IS NULL`
    ).run(id);

    if (info.changes === 0) return apiError(res, 404, "NOT_FOUND", "appointment not found");
    return res.json({ ok: true });
});

// Estado: done
router.post("/:id/mark-done", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

    const info = db().prepare(
        `UPDATE appointments SET status = 'done', updated_at = datetime('now')
     WHERE id = ? AND deleted_at IS NULL`
    ).run(id);

    if (info.changes === 0) return apiError(res, 404, "NOT_FOUND", "appointment not found");
    return res.json({ ok: true });
});

// DELETE (soft)
router.delete("/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

    const info = db().prepare(
        `UPDATE appointments SET deleted_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND deleted_at IS NULL`
    ).run(id);

    if (info.changes === 0) return apiError(res, 404, "NOT_FOUND", "appointment not found");
    return res.json({ ok: true });
});

module.exports = router;
