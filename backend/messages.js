'use strict';

const express = require('express');

const pageSize = 40;
const maxBodyLength = 2000;
const schema = `
  CREATE TABLE IF NOT EXISTS friend_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND ${maxBodyLength}),
    created_at TEXT NOT NULL,
    read_at TEXT,
    CHECK (sender_id <> recipient_id),
    UNIQUE (sender_id, recipient_id, request_id)
  );
  CREATE INDEX IF NOT EXISTS friend_messages_pair ON friend_messages(sender_id, recipient_id, id);
  CREATE INDEX IF NOT EXISTS friend_messages_recipient ON friend_messages(recipient_id, sender_id, id);
  CREATE INDEX IF NOT EXISTS friend_messages_unread ON friend_messages(recipient_id, sender_id, id)
    WHERE read_at IS NULL;
  CREATE TRIGGER IF NOT EXISTS remove_deleted_user_messages
    AFTER DELETE ON users BEGIN
      DELETE FROM friend_messages WHERE sender_id = OLD.id OR recipient_id = OLD.id;
    END;
`;

const acceptedFriends = `
  SELECT u.id, u.name, u.surname
  FROM friendships AS f
  JOIN users AS u ON u.id = CASE WHEN f.low_id = $me THEN f.high_id ELSE f.low_id END
  WHERE (f.low_id = $me OR f.high_id = $me) AND f.accepted = 1 AND u.role = 'user'
`;

function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function friendInfo(id, name, surname) {
  return { id: String(id), name: [name, surname].filter(Boolean).join(' ') };
}

function messageInfo(row, userId) {
  return { id: row.id, body: row.body, createdAt: row.created_at, mine: row.sender_id === userId };
}

function unavailable(res) {
  return res.status(404).json({ error: 'Переписка доступна только с подтверждёнными друзьями' });
}

module.exports = function createMessages(db, auth) {
  const router = express.Router();
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
  const initialize = () => new Promise((resolve, reject) => {
    db.exec(schema, error => error ? reject(error) : resolve());
  });

  router.use(auth, (req, res, next) => {
    if (req.account.role !== 'user') {
      return res.status(403).json({ error: 'Сообщения доступны в личном аккаунте' });
    }
    const userId = parseId(String(req.account.id));
    if (userId === null) return res.status(401).json({ error: 'Требуется вход в аккаунт' });
    res.locals.userId = userId;
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/unread', async (_req, res) => {
    const row = await get(`
      WITH friends AS (${acceptedFriends})
      SELECT COUNT(*) AS unread
      FROM friend_messages AS m
      JOIN friends AS f ON f.id = m.sender_id
      WHERE m.recipient_id = $me AND m.read_at IS NULL
    `, { $me: res.locals.userId });
    res.json(row);
  });

  router.get('/', async (_req, res) => {
    const userId = res.locals.userId;
    const rows = await all(`
      WITH friends AS (${acceptedFriends})
      SELECT f.id AS friend_id, f.name, f.surname, m.id, m.sender_id, m.body, m.created_at,
        (SELECT COUNT(*) FROM friend_messages
         WHERE sender_id = f.id AND recipient_id = $me AND read_at IS NULL) AS unread
      FROM friends AS f
      JOIN friend_messages AS m ON m.id = MAX(
        COALESCE((SELECT MAX(id) FROM friend_messages WHERE sender_id = f.id AND recipient_id = $me), 0),
        COALESCE((SELECT MAX(id) FROM friend_messages WHERE sender_id = $me AND recipient_id = f.id), 0)
      )
      ORDER BY m.id DESC
    `, { $me: userId });
    res.json({ conversations: rows.map(row => ({
      friend: friendInfo(row.friend_id, row.name, row.surname),
      latest: messageInfo(row, userId),
      unread: row.unread,
    })) });
  });

  router.param('friendId', (_req, res, next, value) => {
    const friendId = parseId(value);
    if (friendId === null || friendId === res.locals.userId) {
      return res.status(400).json({ error: 'Укажите ID друга' });
    }
    res.locals.friendId = friendId;
    next();
  });

  router.get('/:friendId', async (req, res) => {
    const { before, after } = req.query;
    const cursor = parseId(before ?? after);
    if ((before !== undefined || after !== undefined) && (cursor === null || (before !== undefined && after !== undefined))) {
      return res.status(400).json({ error: 'Некорректная страница сообщений' });
    }
    const ascending = after !== undefined;
    const { userId, friendId } = res.locals;
    const rows = await all(`
      WITH friends AS (${acceptedFriends})
      SELECT f.id AS friend_id, f.name, f.surname, m.id, m.sender_id, m.body, m.created_at
      FROM friends AS f
      LEFT JOIN friend_messages AS m ON (
        (m.sender_id = $me AND m.recipient_id = f.id) OR
        (m.sender_id = f.id AND m.recipient_id = $me)
      ) ${cursor === null ? '' : ascending ? 'AND m.id > $cursor' : 'AND m.id < $cursor'}
      WHERE f.id = $friend
      ORDER BY m.id ${ascending ? 'ASC' : 'DESC'}
      LIMIT ${pageSize + 1}
    `, { $me: userId, $friend: friendId, ...(cursor === null ? {} : { $cursor: cursor }) });
    if (!rows.length) return unavailable(res);
    const [first] = rows;
    const messages = rows.slice(0, pageSize).filter(row => row.id !== null).map(row => messageInfo(row, userId));
    res.json({
      friend: friendInfo(first.friend_id, first.name, first.surname),
      messages: ascending ? messages : messages.reverse(),
      hasMore: rows.length > pageSize,
    });
  });

  router.post('/:friendId', async (req, res) => {
    const { body, requestId } = req.body ?? {};
    const message = typeof body === 'string' ? body.trim() : '';
    if (!message || message.length > maxBodyLength || message.includes('\0')) {
      return res.status(400).json({ error: `Сообщение должно содержать от 1 до ${maxBodyLength} символов` });
    }
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) {
      return res.status(400).json({ error: 'Не удалось подготовить отправку сообщения' });
    }
    const { userId, friendId } = res.locals;
    const key = { $me: userId, $friend: friendId, $request: requestId };
    const row = await get(`
      WITH friends AS (${acceptedFriends})
      INSERT INTO friend_messages (sender_id, recipient_id, request_id, body, created_at)
      SELECT $me, id, $request, $body, $now FROM friends WHERE id = $friend
      ON CONFLICT (sender_id, recipient_id, request_id) DO NOTHING
      RETURNING id, sender_id, body, created_at
    `, { ...key, $body: message, $now: new Date().toISOString() });
    if (row) return res.status(201).json(messageInfo(row, userId));
    const previous = await get(`
      WITH friends AS (${acceptedFriends})
      SELECT id, sender_id, body, created_at FROM friend_messages
      WHERE sender_id = $me AND recipient_id = $friend AND request_id = $request
        AND EXISTS (SELECT 1 FROM friends WHERE id = $friend)
    `, key);
    if (!previous) return unavailable(res);
    if (previous.body !== message) {
      return res.status(409).json({ error: 'Это сообщение уже было отправлено с другим текстом' });
    }
    res.json(messageInfo(previous, userId));
  });

  router.put('/:friendId/read', async (req, res) => {
    const { throughId } = req.body ?? {};
    if (!Number.isSafeInteger(throughId) || throughId < 1) {
      return res.status(400).json({ error: 'Укажите последнее прочитанное сообщение' });
    }
    const { userId, friendId } = res.locals;
    const key = { $me: userId, $friend: friendId, $through: throughId };
    // Validate the boundary in the same statement so later arrivals stay unread.
    const boundary = `
      SELECT 1 FROM friend_messages
      WHERE id = $through AND sender_id = $friend AND recipient_id = $me
        AND EXISTS (SELECT 1 FROM friends WHERE id = $friend)
    `;
    const updated = await run(`
      WITH friends AS (${acceptedFriends})
      UPDATE friend_messages SET read_at = $now
      WHERE sender_id = $friend AND recipient_id = $me AND id <= $through
        AND read_at IS NULL AND EXISTS (${boundary})
    `, { ...key, $now: new Date().toISOString() });
    if (!updated && !await get(`WITH friends AS (${acceptedFriends}) ${boundary}`, key)) {
      return unavailable(res);
    }
    res.json({ ok: true });
  });

  return { initialize, router };
};
