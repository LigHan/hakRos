'use strict';
const { randomUUID } = require('node:crypto');

// Prototype integration boundary: all arguments must originate from trusted server code.
const EVENT_TYPES = Object.freeze(['search', 'card_view', 'share_initiated', 'favorite_added', 'like_added', 'route_requested']);
const PLACE_TYPES = new Set(EVENT_TYPES.filter(type => type !== 'search'));
const id = x => typeof x === 'string' && x.trim() === x && x.length > 0 && x.length <= 128;
const date = s => typeof s === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

async function initialize(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL,
    actor_id TEXT, place_id TEXT
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS analytics_time ON analytics_events(occurred_at)');
  await run(db, 'CREATE INDEX IF NOT EXISTS analytics_actor_time ON analytics_events(actor_id, occurred_at)');
  await run(db, 'CREATE INDEX IF NOT EXISTS analytics_place_time ON analytics_events(place_id, occurred_at)');
}

// Do not pass req.body directly: actorId must come from the verified session, and
// placeId must be resolved and checked by the server. No arbitrary attributes stored.
async function record(db, { type, actorId = null, placeId = null }, clock = () => new Date()) {
  if (!EVENT_TYPES.includes(type)) throw new TypeError('Unknown event type');
  if (actorId !== null && !id(actorId)) throw new TypeError('Invalid actor id');
  if (placeId !== null && !id(placeId)) throw new TypeError('Invalid place id');
  if (PLACE_TYPES.has(type) && placeId === null) throw new TypeError('This event needs a place id');
  if (type === 'search' && placeId !== null) throw new TypeError('Search cannot have a place id');
  const occurredAt = clock().toISOString();
  await run(db, 'INSERT INTO analytics_events (id, event_type, occurred_at, actor_id, place_id) VALUES (?, ?, ?, ?, ?)', [randomUUID(), type, occurredAt, actorId, placeId]);
}

// scope is constructed by trusted server authentication/authorization middleware.
// Company place IDs must come from an authoritative ownership lookup, never a request.
async function summarize(db, scope, period) {
  if (!scope || !period || !date(period.from) || !date(period.to) || period.from >= period.to) throw new TypeError('Invalid scope or UTC period');
  let filter = '', params = [period.from, period.to];
  if (scope.role === 'user') {
    if (!id(scope.userId)) throw new TypeError('Invalid user scope');
    filter = ' AND actor_id = ?'; params.push(scope.userId);
  } else if (scope.role === 'company') {
    if (!Array.isArray(scope.ownedPlaceIds) || scope.ownedPlaceIds.length > 500 || !scope.ownedPlaceIds.every(id)) throw new TypeError('Invalid company scope');
    if (scope.ownedPlaceIds.length === 0) filter = ' AND 0';
    else { filter = ` AND place_id IN (${scope.ownedPlaceIds.map(() => '?').join(',')})`; params.push(...scope.ownedPlaceIds); }
  } else if (scope.role !== 'admin') throw new TypeError('Invalid role');
  const rows = await all(db, `SELECT event_type, COUNT(*) AS n FROM analytics_events WHERE occurred_at >= ? AND occurred_at < ?${filter} GROUP BY event_type`, params);
  const counts = Object.fromEntries(EVENT_TYPES.map(type => [type, 0]));
  for (const row of rows) if (Object.hasOwn(counts, row.event_type)) counts[row.event_type] = row.n;
  return { from: period.from, to: period.to, counts };
}
module.exports = { EVENT_TYPES, initialize, record, summarize };
