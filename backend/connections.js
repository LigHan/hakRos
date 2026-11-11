'use strict';

const express = require('express');

const schema = `
  CREATE TABLE IF NOT EXISTS friendships (
    low_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    high_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_by INTEGER NOT NULL,
    accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0, 1)),
    PRIMARY KEY (low_id, high_id),
    CHECK (low_id < high_id),
    CHECK (requested_by IN (low_id, high_id))
  );
  CREATE INDEX IF NOT EXISTS friendships_high_id ON friendships(high_id);

  CREATE TABLE IF NOT EXISTS place_subscriptions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, place_id)
  );
  CREATE INDEX IF NOT EXISTS place_subscriptions_place_id ON place_subscriptions(place_id);

  -- На старых базах удаление связанных записей работает и без PRAGMA foreign_keys.
  CREATE TRIGGER IF NOT EXISTS remove_deleted_place_subscriptions
    AFTER DELETE ON posts BEGIN
      DELETE FROM place_subscriptions WHERE place_id = OLD.id;
    END;
  CREATE TRIGGER IF NOT EXISTS remove_deleted_user_connections
    AFTER DELETE ON users BEGIN
      DELETE FROM place_subscriptions WHERE user_id = OLD.id;
      DELETE FROM friendships WHERE low_id = OLD.id OR high_id = OLD.id;
    END;
`;

function publicUser(row) {
  return { id: String(row.id), name: [row.name, row.surname].filter(Boolean).join(' ') };
}

function normalizeName(name) {
  return name.normalize('NFKC').toLocaleLowerCase('ru');
}

module.exports = function createConnections(db, auth, { onFriendRemoved } = {}) {
  const router = express.Router();

  const initialize = () => new Promise((resolve, reject) => {
    db.exec(schema, error => error ? reject(error) : resolve());
  });
  const all = (sql, params) => new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
  const get = (sql, params) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
  const run = (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) reject(error);
      else resolve(this.changes);
    });
  });

  async function listForUser(accountId) {
    const userId = Number(accountId);
    const [relationships, subscriptions] = await Promise.all([
      all(`
        SELECT u.id, u.name, u.surname, f.requested_by AS requestedBy, f.accepted
        FROM friendships AS f
        JOIN users AS u ON u.id = CASE WHEN f.low_id = ? THEN f.high_id ELSE f.low_id END
        WHERE (f.low_id = ? OR f.high_id = ?) AND u.role = 'user'
        ORDER BY u.name COLLATE NOCASE, u.id
      `, [userId, userId, userId]),
      all(`
        SELECT p.id AS placeId, p.place AS name, p.userHandle AS handle,
          p.userAvatar AS avatar, COALESCE(p.bio, '') AS description
        FROM place_subscriptions AS s
        JOIN posts AS p ON p.id = s.place_id
        WHERE s.user_id = ?
        ORDER BY p.place COLLATE NOCASE, p.id
      `, [userId]),
    ]);

    const friends = [];
    const incomingRequests = [];
    const outgoingRequests = [];
    for (const row of relationships) {
      const person = publicUser(row);
      if (row.accepted) friends.push(person);
      else if (row.requestedBy === userId) outgoingRequests.push(person);
      else incomingRequests.push(person);
    }

    return { userId: String(userId), friends, incomingRequests, outgoingRequests, subscriptions };
  }

  router.use(auth, (req, res, next) => {
    if (req.account.role !== 'user') {
      return res.status(403).json({ error: 'Друзья и подписки доступны в личном аккаунте' });
    }
    const userId = Number(req.account.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(401).json({ error: 'Требуется вход в аккаунт' });
    }
    res.locals.userId = userId;
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', async (_req, res) => {
    res.json(await listForUser(res.locals.userId));
  });

  router.get('/users', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query || query.length > 100) {
      return res.status(400).json({ error: 'Введите имя или ID пользователя' });
    }

    const userId = res.locals.userId;
    if (/^[1-9]\d*$/.test(query)) {
      const id = Number(query);
      if (!Number.isSafeInteger(id) || id === userId) return res.json([]);
      const user = await get("SELECT id, name, surname FROM users WHERE id = ? AND role = 'user'", [id]);
      return res.json(user ? [publicUser(user)] : []);
    }

    const normalized = normalizeName(query);
    const candidates = await all(`
      SELECT id, name, surname FROM users
      WHERE role = 'user' AND id <> ? ORDER BY name COLLATE NOCASE, id
    `, [userId]);
    const results = [];
    for (const candidate of candidates) {
      const person = publicUser(candidate);
      if (normalizeName(person.name).includes(normalized)) results.push(person);
      if (results.length === 20) break;
    }
    res.json(results);
  });

  router.param('friendId', (_req, res, next, value) => {
    const friendId = Number(value);
    const userId = res.locals.userId;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(friendId) || friendId === userId) {
      return res.status(400).json({ error: 'Укажите ID другого пользователя' });
    }
    res.locals.friendId = friendId;
    res.locals.pair = [Math.min(userId, friendId), Math.max(userId, friendId)];
    next();
  });

  router.put('/friends/:friendId/request', async (_req, res) => {
    const { userId, friendId, pair } = res.locals;
    const added = await run(`
      INSERT INTO friendships (low_id, high_id, requested_by)
      SELECT ?, ?, ? FROM users WHERE id = ? AND role = 'user'
      ON CONFLICT (low_id, high_id) DO NOTHING
    `, [...pair, userId, friendId]);
    if (!added && !await get('SELECT 1 FROM friendships WHERE low_id = ? AND high_id = ?', pair)) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ ok: true });
  });

  router.put('/friends/:friendId/accept', async (_req, res) => {
    const { friendId, pair } = res.locals;
    const changed = await run(`
      UPDATE friendships SET accepted = 1
      WHERE low_id = ? AND high_id = ? AND requested_by = ?
    `, [...pair, friendId]);
    if (!changed) return res.status(404).json({ error: 'Входящая заявка не найдена' });
    res.json({ ok: true });
  });

  router.delete('/friends/:friendId', async (_req, res) => {
    const changed = await run('DELETE FROM friendships WHERE low_id = ? AND high_id = ?', res.locals.pair);
    if (changed) onFriendRemoved?.(res.locals.userId, res.locals.friendId);
    res.json({ ok: true });
  });

  router.param('placeId', (_req, res, next, value) => {
    if (!value.trim() || value.length > 128) {
      return res.status(400).json({ error: 'Некорректный ID заведения' });
    }
    next();
  });

  router.get('/places/:placeId', async (req, res) => {
    const row = await get(`
      SELECT EXISTS (
        SELECT 1 FROM place_subscriptions WHERE user_id = ? AND place_id = p.id
      ) AS subscribed
      FROM posts AS p WHERE p.id = ?
    `, [res.locals.userId, req.params.placeId]);
    if (!row) return res.status(404).json({ error: 'Заведение не найдено' });
    res.json({ subscribed: Boolean(row.subscribed) });
  });

  router.put('/places/:placeId', async (req, res) => {
    const userId = res.locals.userId;
    const { placeId } = req.params;
    const added = await run(`
      INSERT INTO place_subscriptions (user_id, place_id)
      SELECT ?, id FROM posts WHERE id = ?
      ON CONFLICT (user_id, place_id) DO NOTHING
    `, [userId, placeId]);
    if (!added && !await get('SELECT 1 FROM place_subscriptions WHERE user_id = ? AND place_id = ?', [userId, placeId])) {
      return res.status(404).json({ error: 'Заведение не найдено' });
    }
    res.json({ subscribed: true });
  });

  router.delete('/places/:placeId', async (req, res) => {
    await run('DELETE FROM place_subscriptions WHERE user_id = ? AND place_id = ?', [res.locals.userId, req.params.placeId]);
    res.json({ subscribed: false });
  });

  return { router, initialize, listForUser };
};
