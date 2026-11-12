'use strict';
const express = require('express');
const { randomUUID } = require('node:crypto');

module.exports = function createLeisurePlans(db, auth) {
  const router = express.Router();
  const get = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (error, row) => error ? reject(error) : resolve(row)));
  const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (error, rows) => error ? reject(error) : resolve(rows)));
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function done(error) { error ? reject(error) : resolve(this.changes); }));
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
  const initialize = async () => {
    await exec(`
    CREATE TABLE IF NOT EXISTS leisure_plans (
      id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL, place_id TEXT NOT NULL, starts_at TEXT NOT NULL,
      time_zone TEXT NOT NULL, duration_minutes INTEGER, comment TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
      request_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      UNIQUE(owner_id, request_id)
    );
    CREATE TABLE IF NOT EXISTS leisure_invitations (
      id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES leisure_plans(id) ON DELETE CASCADE,
      invitee_id INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, access_revoked INTEGER NOT NULL DEFAULT 0, UNIQUE(plan_id, invitee_id)
    );
    CREATE INDEX IF NOT EXISTS leisure_invitations_user ON leisure_invitations(invitee_id, status);
    `);
    const planColumns = await all('PRAGMA table_info(leisure_plans)');
    if (!planColumns.some(column => column.name === 'revision')) await exec('ALTER TABLE leisure_plans ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
    const inviteColumns = await all('PRAGMA table_info(leisure_invitations)');
    if (!inviteColumns.some(column => column.name === 'access_revoked')) await exec('ALTER TABLE leisure_invitations ADD COLUMN access_revoked INTEGER NOT NULL DEFAULT 0');
    // Replace only triggers owned by this module, including on upgrades from the preview schema.
    await exec(`
    DROP TRIGGER IF EXISTS leisure_reset_attendance;
    DROP TRIGGER IF EXISTS leisure_cancel_invites;
    DROP TRIGGER IF EXISTS leisure_revoke_friendship;
    CREATE TRIGGER leisure_reset_attendance AFTER UPDATE OF starts_at, time_zone, duration_minutes, place_id ON leisure_plans
    WHEN OLD.starts_at <> NEW.starts_at OR OLD.time_zone <> NEW.time_zone OR OLD.duration_minutes IS NOT NEW.duration_minutes OR OLD.place_id <> NEW.place_id
    BEGIN UPDATE leisure_invitations SET status = 'pending', updated_at = NEW.updated_at WHERE plan_id = NEW.id AND status = 'accepted'; END;
    CREATE TRIGGER leisure_cancel_invites AFTER UPDATE OF status ON leisure_plans
    WHEN NEW.status = 'cancelled' AND OLD.status <> NEW.status
    BEGIN UPDATE leisure_invitations SET status = 'cancelled', updated_at = NEW.updated_at WHERE plan_id = NEW.id AND status IN ('pending','accepted'); END;
    CREATE TRIGGER leisure_revoke_friendship AFTER DELETE ON friendships
    BEGIN UPDATE leisure_invitations SET status = 'cancelled', access_revoked = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE EXISTS (SELECT 1 FROM leisure_plans p WHERE p.id = leisure_invitations.plan_id
      AND ((p.owner_id = OLD.low_id AND leisure_invitations.invitee_id = OLD.high_id) OR (p.owner_id = OLD.high_id AND leisure_invitations.invitee_id = OLD.low_id))); END;
    `);
  };

  const isFriend = (a, b) => get('SELECT 1 AS ok FROM friendships WHERE low_id = MIN(?, ?) AND high_id = MAX(?, ?) AND accepted = 1', [a, b, a, b]);
  const isId = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
  const isTimeZone = value => { try { return typeof value === 'string' && value.length <= 80 && !!new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { return false; } };
  function isTimestamp(value) {
    if (typeof value !== 'string') return false;
    const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.exec(value);
    if (!match) return false;
    const [, year, month, day, hour, minute, second = '0', zone] = match;
    const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
    if (date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day || date.getUTCHours() !== +hour || date.getUTCMinutes() !== +minute || +second > 59) return false;
    if (zone !== 'Z' && (+zone.slice(1, 3) > 14 || +zone.slice(4) > 59 || (+zone.slice(1, 3) === 14 && +zone.slice(4) !== 0))) return false;
    return Number.isFinite(Date.parse(value));
  }
  function validate(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !isId(data.placeId) || typeof data.startsAt !== 'string' ||
        !isTimestamp(data.startsAt) || Date.parse(data.startsAt) <= Date.now() || !isTimeZone(data.timeZone) ||
        !(data.durationMinutes == null || Number.isSafeInteger(data.durationMinutes) && data.durationMinutes >= 1 && data.durationMinutes <= 1440) ||
        !(data.comment == null || typeof data.comment === 'string' && data.comment.length <= 500)) return null;
    return { placeId: data.placeId, startsAt: new Date(data.startsAt).toISOString(), timeZone: data.timeZone,
      durationMinutes: data.durationMinutes ?? null, comment: (data.comment || '').trim() };
  }
  const baseSelect = `SELECT p.*, places.place AS place_name, places.address AS place_address, places.image AS place_image,
      owner.name AS owner_name FROM leisure_plans p LEFT JOIN posts places ON places.id = p.place_id JOIN users owner ON owner.id = p.owner_id`;
  const rowToPlan = row => ({ id: row.id, ownerId: String(row.owner_id), ownerName: row.owner_name, placeId: row.place_id,
    placeName: row.place_name || null, address: row.place_address || null, image: row.place_image || null, startsAt: row.starts_at,
    timeZone: row.time_zone, durationMinutes: row.duration_minutes, comment: row.comment, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision, invitationStatus: row.invitation_status || null });

  async function accessible(id, userId) {
    return get(`${baseSelect} WHERE p.id = ? AND (p.owner_id = ? OR EXISTS (
      SELECT 1 FROM leisure_invitations i JOIN friendships f ON f.low_id = MIN(p.owner_id, i.invitee_id) AND f.high_id = MAX(p.owner_id, i.invitee_id) AND f.accepted = 1
      WHERE i.plan_id = p.id AND i.invitee_id = ? AND i.access_revoked=0 AND (i.status IN ('pending','accepted') OR (i.status = 'cancelled' AND p.status = 'cancelled'))))`, [id, userId, userId]);
  }

  router.use(auth, (req, res, next) => {
    const id = Number(req.account.id);
    if (req.account.role !== 'user' || !Number.isSafeInteger(id) || id < 1) return res.status(403).json({ error: 'Планы доступны в личном аккаунте.' });
    res.locals.userId = id; res.set('Cache-Control', 'no-store'); next();
  });

  router.get('/', async (_req, res) => {
    const id = res.locals.userId;
    const rows = await all(`${baseSelect} LEFT JOIN leisure_invitations i ON i.plan_id = p.id AND i.invitee_id = ?
      WHERE p.owner_id = ? OR (i.access_revoked=0 AND i.status IN ('pending','accepted') AND EXISTS (SELECT 1 FROM friendships f WHERE f.low_id = MIN(p.owner_id, ?) AND f.high_id = MAX(p.owner_id, ?) AND f.accepted = 1))
      OR (p.status = 'cancelled' AND i.access_revoked=0 AND i.status = 'cancelled' AND EXISTS (SELECT 1 FROM friendships f WHERE f.low_id = MIN(p.owner_id, ?) AND f.high_id = MAX(p.owner_id, ?) AND f.accepted = 1)) ORDER BY p.starts_at`, [id, id, id, id, id, id]);
    const statuses = new Map((await all('SELECT plan_id, status FROM leisure_invitations WHERE invitee_id = ?', [id])).map(i => [i.plan_id, i.status]));
    res.json(rows.map(row => ({ ...rowToPlan(row), invitationStatus: row.owner_id === id ? null : statuses.get(row.id) || null })));
  });

  router.post('/', async (req, res) => {
    const values = validate(req.body);
    const requestId = req.body?.requestId;
    if (!values || req.body.confirmed !== true || typeof requestId !== 'string' || !/^[\w-]{8,128}$/.test(requestId)) return res.status(400).json({ error: 'Подтверди план и укажи место, будущую дату и время.' });
    if (!await get('SELECT 1 FROM posts WHERE id = ?', [values.placeId])) return res.status(404).json({ error: 'Место не найдено.' });
    const id = randomUUID(), now = new Date().toISOString();
    await run(`INSERT OR IGNORE INTO leisure_plans(id,owner_id,place_id,starts_at,time_zone,duration_minutes,comment,status,request_id,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,'active',?,?,? WHERE EXISTS (SELECT 1 FROM posts WHERE id = ?)`, [id, res.locals.userId, values.placeId, values.startsAt, values.timeZone, values.durationMinutes, values.comment, requestId, now, now, values.placeId]);
    const row = await get(`${baseSelect} WHERE p.owner_id = ? AND p.request_id = ?`, [res.locals.userId, requestId]);
    if (!row) return res.status(404).json({ error: 'Место не найдено.' });
    const plan = rowToPlan(row);
    if (plan.placeId !== values.placeId || plan.startsAt !== values.startsAt || plan.timeZone !== values.timeZone || plan.durationMinutes !== values.durationMinutes || plan.comment !== values.comment) return res.status(409).json({ error: 'Этот запрос уже использован для другого плана.' });
    res.status(row.id === id ? 201 : 200).json(plan);
  });

  router.get('/:id', async (req, res) => {
    const row = isId(req.params.id) && await accessible(req.params.id, res.locals.userId);
    if (!row) return res.status(404).json({ error: 'План не найден.' });
    const userId = res.locals.userId, owner = row.owner_id === userId;
    const people = await all(`SELECT i.invitee_id, i.status, u.name, u.surname FROM leisure_invitations i JOIN users u ON u.id = i.invitee_id
      WHERE i.plan_id = ? AND (? = 1 OR i.invitee_id = ? OR i.status = 'accepted') ORDER BY u.name`, [row.id, owner ? 1 : 0, userId]);
    const ownInvite = people.find(person => person.invitee_id === userId);
    res.json({ ...rowToPlan(row), invitationStatus: owner ? null : ownInvite?.status || null,
      participants: people.map(p => ({ id: String(p.invitee_id), name: [p.name, p.surname].filter(Boolean).join(' '), status: p.status })) });
  });

  router.put('/:id', async (req, res) => {
    const values = validate(req.body);
    if (!values || req.body.confirmed !== true || !isId(req.params.id) || !Number.isSafeInteger(req.body.revision) || req.body.revision < 1) return res.status(400).json({ error: 'Проверь данные и подтверди изменение.' });
    if (!await get('SELECT 1 FROM posts WHERE id = ?', [values.placeId])) return res.status(404).json({ error: 'Место не найдено.' });
    const changed = await run(`UPDATE leisure_plans SET place_id=?, starts_at=?, time_zone=?, duration_minutes=?, comment=?, updated_at=?, revision=revision+1 WHERE id=? AND owner_id=? AND status='active' AND revision=? AND EXISTS (SELECT 1 FROM posts WHERE id=?)`,
      [values.placeId, values.startsAt, values.timeZone, values.durationMinutes, values.comment, new Date().toISOString(), req.params.id, res.locals.userId, req.body.revision, values.placeId]);
    if (!changed) {
      const current = await get("SELECT revision FROM leisure_plans WHERE id=? AND owner_id=? AND status='active'", [req.params.id, res.locals.userId]);
      if (current && !await get('SELECT 1 FROM posts WHERE id = ?', [values.placeId])) return res.status(404).json({ error: 'Место не найдено.' });
      return current ? res.status(409).json({ error: 'План изменился. Открой его заново перед сохранением.' }) : res.status(404).json({ error: 'План не найден или отменён.' });
    }
    res.json(rowToPlan(await get(`${baseSelect} WHERE p.id = ?`, [req.params.id])));
  });

  router.post('/:id/cancel', async (req, res) => {
    if (req.body?.confirmed !== true || !isId(req.params.id)) return res.status(400).json({ error: 'Подтверди отмену.' });
    const row = await get('SELECT status FROM leisure_plans WHERE id = ? AND owner_id = ?', [req.params.id, res.locals.userId]);
    if (!row) return res.status(404).json({ error: 'План не найден.' });
    if (row.status !== 'cancelled') await run("UPDATE leisure_plans SET status='cancelled', updated_at=? WHERE id=? AND owner_id=?", [new Date().toISOString(), req.params.id, res.locals.userId]);
    res.json({ ok: true, status: 'cancelled' });
  });

  router.post('/:id/invitations', async (req, res) => {
    const friendId = Number(req.body?.friendId), ownerId = res.locals.userId;
    if (req.body?.confirmed !== true || !isId(req.params.id) || !Number.isSafeInteger(friendId) || friendId < 1 || friendId === ownerId || !Number.isSafeInteger(req.body.revision) || req.body.revision < 1) return res.status(400).json({ error: 'Выбери друга и подтверди приглашение.' });
    const plan = await get('SELECT id, status, revision FROM leisure_plans WHERE id=? AND owner_id=?', [req.params.id, ownerId]);
    if (!plan || plan.status !== 'active') return res.status(404).json({ error: 'Активный план не найден.' });
    if (plan.revision !== req.body.revision) return res.status(409).json({ error: 'План изменился. Открой его заново перед приглашением.' });
    if (!await isFriend(ownerId, friendId)) return res.status(403).json({ error: 'Пригласить можно только подтверждённого друга.' });
    const now = new Date().toISOString(), id = randomUUID();
    const added = await run(`INSERT OR IGNORE INTO leisure_invitations(id,plan_id,invitee_id,status,created_at,updated_at)
      SELECT ?, p.id, ?, 'pending', ?, ? FROM leisure_plans p WHERE p.id=? AND p.owner_id=? AND p.status='active' AND p.revision=?
      AND EXISTS (SELECT 1 FROM friendships f WHERE f.low_id=MIN(p.owner_id, ?) AND f.high_id=MAX(p.owner_id, ?) AND f.accepted=1)`, [id, friendId, now, now, plan.id, ownerId, req.body.revision, friendId, friendId]);
    const invitation = await get('SELECT id, status FROM leisure_invitations WHERE plan_id=? AND invitee_id=?', [plan.id, friendId]);
    if (added && invitation) return res.status(201).json({ id: invitation.id, status: invitation.status });
    const current = await get('SELECT revision FROM leisure_plans WHERE id=? AND owner_id=? AND status=\'active\'', [plan.id, ownerId]);
    if (!current || current.revision !== req.body.revision) return res.status(409).json({ error: 'План изменился. Проверь его снова.' });
    if (!invitation || !await isFriend(ownerId, friendId)) return res.status(403).json({ error: 'Дружба больше недоступна.' });
    res.status(200).json({ id: invitation.id, status: invitation.status });
  });

  router.post('/:id/respond', async (req, res) => {
    if (!isId(req.params.id) || !['accepted', 'declined'].includes(req.body?.status) || req.body?.confirmed !== true || !Number.isSafeInteger(req.body.revision) || req.body.revision < 1) return res.status(400).json({ error: 'Подтверди ответ на приглашение.' });
    const status = req.body.status, now = new Date().toISOString(), id = res.locals.userId;
    const changed = await run(`UPDATE leisure_invitations SET status=?, updated_at=? WHERE plan_id=? AND invitee_id=? AND status='pending'
      AND access_revoked=0 AND EXISTS (SELECT 1 FROM leisure_plans p JOIN friendships f ON f.low_id=MIN(p.owner_id, ?) AND f.high_id=MAX(p.owner_id, ?) AND f.accepted=1 WHERE p.id=leisure_invitations.plan_id AND p.status='active' AND p.revision=?)`, [status, now, req.params.id, id, id, id, req.body.revision]);
    if (!changed) {
      const existing = await get(`SELECT i.status, p.revision FROM leisure_invitations i JOIN leisure_plans p ON p.id=i.plan_id JOIN friendships f ON f.low_id=MIN(p.owner_id, i.invitee_id) AND f.high_id=MAX(p.owner_id, i.invitee_id) AND f.accepted=1 WHERE i.plan_id=? AND i.invitee_id=? AND i.access_revoked=0 AND p.status='active'`, [req.params.id, id]);
      if (!existing) return res.status(404).json({ error: 'Приглашение не найдено.' });
      if (existing.revision !== req.body.revision) return res.status(409).json({ error: 'План изменился. Открой его заново перед ответом.' });
      if (existing.status !== status) return res.status(409).json({ error: 'На это приглашение уже ответили.' });
    }
    res.json({ ok: true, status });
  });

  router.post('/:id/invitations/:friendId/cancel', async (req, res) => {
    const friendId = Number(req.params.friendId);
    if (req.body?.confirmed !== true || !isId(req.params.id) || !Number.isSafeInteger(friendId) || friendId < 1) return res.status(400).json({ error: 'Подтверди отмену приглашения.' });
    const changed = await run(`UPDATE leisure_invitations SET status='cancelled', access_revoked=1, updated_at=? WHERE plan_id=? AND invitee_id=? AND status IN ('pending','accepted')
      AND EXISTS (SELECT 1 FROM leisure_plans p WHERE p.id=leisure_invitations.plan_id AND p.owner_id=?)`, [new Date().toISOString(), req.params.id, friendId, res.locals.userId]);
    if (!changed) return res.status(404).json({ error: 'Активное приглашение не найдено.' });
    res.json({ ok: true, status: 'cancelled' });
  });

  return { router, initialize };
};
