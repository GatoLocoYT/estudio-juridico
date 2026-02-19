// server/routes/appointments.js
const express = require("express");
const router = express.Router();

const { getDb } = require("../db/sqlite");
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

function db() {
  return getDb();
}

function ensureClientExists(client_id) {
  return db().prepare(`SELECT id FROM clients WHERE id = ? AND deleted_at IS NULL`).get(client_id);
}

function ensureCaseExists(case_id) {
  return db().prepare(`SELECT id, client_id FROM cases WHERE id = ? AND deleted_at IS NULL`).get(case_id);
}

function ensureLawyerExists(lawyer_id) {
  if (!lawyer_id) return true; // optional
  return db().prepare(`SELECT id FROM lawyers WHERE id = ? AND deleted_at IS NULL`).get(lawyer_id);
}

function checkOverlap({ excludeId = null, lawyer_id, start_at, end_at }) {
  // Si no hay abogado asignado, no chequeamos solapamiento
  if (!lawyer_id) return false;

  const row = db()
    .prepare(
      `
      SELECT 1
      FROM appointments a
      WHERE a.deleted_at IS NULL
        AND a.status IN ('scheduled','confirmed')
        AND a.lawyer_id = @lawyer_id
        AND NOT (a.end_at <= @start_at OR a.start_at >= @end_at)
        AND (@excludeId IS NULL OR a.id <> @excludeId)
      LIMIT 1;
    `
    )
    .get({ excludeId, lawyer_id, start_at, end_at });

  return !!row;
}

function validateAppointmentBody(body, res) {
  const client_id = toIntOrNull(body.client_id);
  const case_id = toIntOrNull(body.case_id);
  const lawyer_id = toIntOrNull(body.lawyer_id);

  const start_at = trimOrNull(body.start_at);
  const end_at = trimOrNull(body.end_at);

  const channel = trimOrNull(body.channel) ?? "in_person";
  const status = trimOrNull(body.status) ?? "scheduled";
  const title = trimOrNull(body.title);
  const notes = trimOrNull(body.notes);

  if (!client_id) return apiError(res, 400, "VALIDATION_ERROR", "client_id is required", { field: "client_id" });

  if (!start_at || !isIsoDatetime(start_at))
    return apiError(res, 400, "VALIDATION_ERROR", "start_at must be 'YYYY-MM-DD HH:MM:SS'", { field: "start_at" });

  if (!end_at || !isIsoDatetime(end_at))
    return apiError(res, 400, "VALIDATION_ERROR", "end_at must be 'YYYY-MM-DD HH:MM:SS'", { field: "end_at" });

  if (!["in_person", "phone", "video"].includes(channel))
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid channel", { field: "channel" });

  if (!["scheduled", "confirmed", "cancelled", "done", "no_show"].includes(status))
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid status", { field: "status" });

  // duración (15..240 min)
  const startMs = Date.parse(start_at.replace(" ", "T"));
  const endMs = Date.parse(end_at.replace(" ", "T"));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs))
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid datetime values");

  if (endMs <= startMs) return apiError(res, 400, "VALIDATION_ERROR", "end_at must be after start_at");

  const mins = (endMs - startMs) / 60000;
  if (mins < 15 || mins > 240)
    return apiError(res, 400, "VALIDATION_ERROR", "Appointment duration must be between 15 and 240 minutes", {
      field: "end_at",
    });

  if (title && !isNonEmptyString(title, 1, 120))
    return apiError(res, 400, "VALIDATION_ERROR", "Invalid title", { field: "title" });

  return { client_id, case_id, lawyer_id, start_at, end_at, channel, status, title, notes };
}

// LIST
router.get("/", requireAdmin, (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { safeSort, safeDir } = pickSort(req.query, ["start_at", "created_at", "updated_at", "status"], "start_at");

  const from = trimOrNull(req.query.from);
  const to = trimOrNull(req.query.to);
  const status = trimOrNull(req.query.status);
  const client_id = toIntOrNull(req.query.client_id);
  const case_id = toIntOrNull(req.query.case_id);
  const lawyer_id = toIntOrNull(req.query.lawyer_id);

  const where = ["a.deleted_at IS NULL"];
  const params = {};

  if (from) { where.push("a.start_at >= @from"); params.from = from; }
  if (to) { where.push("a.start_at < @to"); params.to = to; }
  if (status) { where.push("a.status = @status"); params.status = status; }
  if (client_id) { where.push("a.client_id = @client_id"); params.client_id = client_id; }
  if (case_id) { where.push("a.case_id = @case_id"); params.case_id = case_id; }
  if (lawyer_id) { where.push("a.lawyer_id = @lawyer_id"); params.lawyer_id = lawyer_id; }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const items = db()
    .prepare(
      `SELECT
        a.id,
        a.client_id, cl.full_name as client_name,
        a.case_id, c.title as case_title,
        a.lawyer_id, lw.full_name as lawyer_name,
        a.start_at, a.end_at, a.channel, a.status, a.title, a.notes,
        a.created_at, a.updated_at
      FROM appointments a
      JOIN clients cl
        ON cl.id = a.client_id AND cl.deleted_at IS NULL
      LEFT JOIN cases c
        ON c.id = a.case_id AND c.deleted_at IS NULL
      LEFT JOIN lawyers lw
        ON lw.id = a.lawyer_id AND lw.deleted_at IS NULL
      ${whereSql}
      ORDER BY a.${safeSort} ${safeDir}
      LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset });

  const total =
    db()
      .prepare(`SELECT COUNT(*) as c FROM appointments a ${whereSql}`)
      .get(params)?.c ?? 0;

  return res.json({ page, limit, total, items });
});

// GET ONE
router.get("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const row = db()
    .prepare(
      `SELECT id, client_id, case_id, lawyer_id, start_at, end_at, channel, status, title, notes, created_at, updated_at
       FROM appointments
       WHERE id = ? AND deleted_at IS NULL`
    )
    .get(id);

  if (!mustExistOr404(res, row, "appointment")) return;
  return res.json(row);
});

// CREATE
router.post("/", requireAdmin, (req, res) => {
  const data = validateAppointmentBody(req.body, res);
  if (!data) return;

  if (!ensureClientExists(data.client_id)) return apiError(res, 404, "NOT_FOUND", "client not found");

  if (data.case_id) {
    const c = ensureCaseExists(data.case_id);
    if (!c) return apiError(res, 404, "NOT_FOUND", "case not found");
    if (c.client_id !== data.client_id)
      return apiError(res, 400, "VALIDATION_ERROR", "case_id does not belong to client_id");
  }

  if (!ensureLawyerExists(data.lawyer_id)) return apiError(res, 404, "NOT_FOUND", "lawyer not found");

  // chequeo overlap solo si impacta agenda
  if (["scheduled", "confirmed"].includes(data.status)) {
    const conflict = checkOverlap({
      lawyer_id: data.lawyer_id,
      start_at: data.start_at,
      end_at: data.end_at,
    });
    if (conflict) return apiError(res, 409, "CONFLICT", "Appointment overlaps with existing booking");
  }

  const info = db()
    .prepare(
      `
      INSERT INTO appointments (client_id, case_id, lawyer_id, start_at, end_at, channel, status, title, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      data.client_id,
      data.case_id,
      data.lawyer_id,
      data.start_at,
      data.end_at,
      data.channel,
      data.status,
      data.title,
      data.notes
    );

  return res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// UPDATE
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
    if (c.client_id !== data.client_id)
      return apiError(res, 400, "VALIDATION_ERROR", "case_id does not belong to client_id");
  }

  if (!ensureLawyerExists(data.lawyer_id)) return apiError(res, 404, "NOT_FOUND", "lawyer not found");

  if (["scheduled", "confirmed"].includes(data.status)) {
    const conflict = checkOverlap({
      excludeId: id,
      lawyer_id: data.lawyer_id,
      start_at: data.start_at,
      end_at: data.end_at,
    });
    if (conflict) return apiError(res, 409, "CONFLICT", "Appointment overlaps with existing booking");
  }

  db()
    .prepare(
      `
      UPDATE appointments SET
        client_id = ?,
        case_id = ?,
        lawyer_id = ?,
        start_at = ?,
        end_at = ?,
        channel = ?,
        status = ?,
        title = ?,
        notes = ?,
        updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `
    )
    .run(
      data.client_id,
      data.case_id,
      data.lawyer_id,
      data.start_at,
      data.end_at,
      data.channel,
      data.status,
      data.title,
      data.notes,
      id
    );

  return res.json({ ok: true });
});

// helpers para cambio de estado
function setStatus(id, status, res) {
  const info = db()
    .prepare(`UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`)
    .run(status, id);
  if (info.changes === 0) return apiError(res, 404, "NOT_FOUND", "appointment not found");
  return res.json({ ok: true });
}

// Estado: confirm
router.post("/:id/confirm", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const appt = db()
    .prepare(`SELECT id, lawyer_id, start_at, end_at FROM appointments WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!mustExistOr404(res, appt, "appointment")) return;

  const conflict = checkOverlap({
    excludeId: id,
    lawyer_id: appt.lawyer_id,
    start_at: appt.start_at,
    end_at: appt.end_at,
  });
  if (conflict) return apiError(res, 409, "CONFLICT", "Appointment overlaps with existing booking");

  return setStatus(id, "confirmed", res);
});

// Estado: cancel
router.post("/:id/cancel", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");
  return setStatus(id, "cancelled", res);
});

// Estado: done
router.post("/:id/mark-done", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");
  return setStatus(id, "done", res);
});

// Estado: no_show (para dashboard)
router.post("/:id/no-show", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");
  return setStatus(id, "no_show", res);
});

// DELETE (soft)
router.delete("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return apiError(res, 400, "VALIDATION_ERROR", "Invalid id");

  const info = db()
    .prepare(`UPDATE appointments SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`)
    .run(id);

  if (info.changes === 0) return apiError(res, 404, "NOT_FOUND", "appointment not found");
  return res.json({ ok: true });
});

module.exports = router;
