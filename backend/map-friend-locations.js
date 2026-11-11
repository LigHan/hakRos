'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const { validCoordinates } = require('./map-navigation');

const lifetime = 5 * 60_000;

module.exports = function createFriendLocations(db, auth, { now = Date.now } = {}) {
  const router = express.Router();
  const shares = new Map();

  function removeShare(ownerId, share = shares.get(ownerId)) {
    if (!share || shares.get(ownerId) !== share) return;
    clearTimeout(share.timer);
    shares.delete(ownerId);
  }

  function activeShare(ownerId) {
    const share = shares.get(ownerId);
    if (share && share.expiresAt <= now()) {
      removeShare(ownerId, share);
      return undefined;
    }
    return share;
  }

  function setExpiry(ownerId, share, timestamp) {
    clearTimeout(share.timer);
    share.expiresAt = timestamp + lifetime;
    share.timer = setTimeout(() => removeShare(ownerId, share), lifetime).unref();
  }

  function confirmedFriends(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT friend.id, friend.name, friend.surname
         FROM friendships AS f
         JOIN users AS account ON account.id = ? AND account.role = 'user'
         JOIN users AS friend ON friend.id = CASE WHEN f.low_id = account.id THEN f.high_id ELSE f.low_id END
           AND friend.role = 'user'
         WHERE f.accepted = 1 AND (f.low_id = account.id OR f.high_id = account.id)`,
        [userId],
        (error, rows) => error ? reject(error) : resolve(rows)
      );
    });
  }

  const userOnly = [auth, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const id = Number(req.account.id);
    if (req.account.role !== 'user' || !Number.isSafeInteger(id) || id < 1) {
      return res.status(403).json({ error: 'Показ геопозиции доступен в личном аккаунте.' });
    }
    res.locals.userId = id;
    next();
  }];

  router.get('/locations', ...userOnly, async (_req, res) => {
    const viewerId = res.locals.userId;
    const friends = await confirmedFriends(viewerId);
    const visible = [];
    for (const friend of friends) {
      const share = activeShare(friend.id);
      if (!share?.position || !share.recipients.has(viewerId)) continue;
      visible.push({
        id: String(friend.id),
        name: [friend.name, friend.surname].filter(Boolean).join(' '),
        ...share.position,
        expiresInMs: share.expiresAt - now(),
      });
    }
    res.json(visible);
  });

  router.post('/location', ...userOnly, async (req, res) => {
    const ownerId = res.locals.userId;
    const ids = req.body?.recipientIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some(id =>
      typeof id !== 'string' || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) === ownerId
    )) {
      return res.status(400).json({ error: 'Выберите хотя бы одного подтверждённого друга.' });
    }

    const recipients = new Set(ids.map(Number));
    const count = recipients.size;
    const share = { id: randomUUID(), recipients, position: null };
    removeShare(ownerId);
    shares.set(ownerId, share);
    setExpiry(ownerId, share, now());

    try {
      const friends = new Set((await confirmedFriends(ownerId)).map(friend => friend.id));
      if (activeShare(ownerId) !== share) {
        return res.status(409).json({ error: 'Показ завершён. Выберите друзей заново.' });
      }
      if (recipients.size !== count || [...recipients].some(id => !friends.has(id))) {
        removeShare(ownerId, share);
        return res.status(403).json({ error: 'Геопозицию можно показать только подтверждённым друзьям.' });
      }
      return res.status(201).json({ id: share.id });
    } catch (error) {
      removeShare(ownerId, share);
      throw error;
    }
  });

  router.put('/location/:shareId', ...userOnly, (req, res) => {
    const ownerId = res.locals.userId;
    const share = activeShare(ownerId);
    if (share?.id !== req.params.shareId) {
      return res.status(404).json({ error: 'Показ завершён. Выберите друзей заново.' });
    }

    const { latitude, longitude } = req.body ?? {};
    if (!validCoordinates(latitude, longitude)) {
      return res.status(400).json({ error: 'Некорректные координаты.' });
    }
    const updatedAt = now();
    share.position = { latitude: Number(latitude.toFixed(3)), longitude: Number(longitude.toFixed(3)), updatedAt };
    setExpiry(ownerId, share, updatedAt);
    res.json({ ok: true });
  });

  router.delete('/location/:shareId', ...userOnly, (req, res) => {
    const ownerId = res.locals.userId;
    const share = shares.get(ownerId);
    if (share?.id === req.params.shareId) removeShare(ownerId, share);
    res.json({ ok: true });
  });

  router.delete('/location', ...userOnly, (_req, res) => {
    removeShare(res.locals.userId);
    res.json({ ok: true });
  });

  function revokeFriendship(first, second) {
    for (const [ownerId, recipientId] of [[first, second], [second, first]]) {
      const share = shares.get(ownerId);
      if (share?.recipients.delete(recipientId) && share.recipients.size === 0) removeShare(ownerId, share);
    }
  }

  return { router, hide: id => removeShare(Number(id)), revokeFriendship };
};
