// server/middleware/validate.js
function apiError(res, status, code, message, details) {
  return res.status(status).json({
    error: { code, message, ...(details ? { details } : {}) },
  });
}

function isNonEmptyString(v, min = 1, max = 10_000) {
  return typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
}

function trimOrNull(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  return n;
}

function isEmail(v) {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isIsoDatetime(v) {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(v.trim());
}

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const limitRaw = Number.parseInt(query.limit ?? "20", 10) || 20;
  const limit = Math.min(100, Math.max(1, limitRaw));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function pickSort(query, allowed, fallback) {
  const sort = typeof query.sort === "string" ? query.sort : fallback;
  const dir = (typeof query.dir === "string" ? query.dir : "desc").toLowerCase();
  const safeDir = dir === "asc" ? "ASC" : "DESC";
  const safeSort = allowed.includes(sort) ? sort : fallback;
  return { safeSort, safeDir };
}

module.exports = {
  apiError,
  isNonEmptyString,
  trimOrNull,
  toIntOrNull,
  isEmail,
  isIsoDatetime,
  parsePagination,
  pickSort,
};
