// server/db/repo.js
const { apiError } = require("../middleware/validate");

function mustExistOr404(res, row, entityName = "resource") {
  if (!row) {
    apiError(res, 404, "NOT_FOUND", `${entityName} not found`);
    return null;
  }
  return row;
}

function nowUpdateSql() {
  return "updated_at = datetime('now')";
}

module.exports = { mustExistOr404, nowUpdateSql };
