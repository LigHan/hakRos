'use strict';
const { DatabaseSync } = require('node:sqlite');
// Adapts built-in SQLite to the interface used by analytics.js.
function createDatabase() {
  const db = new DatabaseSync(':memory:');
  return {
    run(sql, params, cb) { try { const result = db.prepare(sql).run(...params); cb.call({ changes: Number(result.changes) }, null); } catch (err) { cb(err); } },
    all(sql, params, cb) { try { cb(null, db.prepare(sql).all(...params)); } catch (err) { cb(err); } },
    close() { db.close(); },
  };
}
module.exports = { createDatabase };
