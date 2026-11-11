'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { createMapNavigationRouter, validCoordinates } = require('./map-navigation');
const createFriendLocations = require('./map-friend-locations');

module.exports = function createMapRouter(db, auth, optionalAuth, locationOptions) {
  const router = express.Router();
  const { router: friendLocations, hide, revokeFriendship } = createFriendLocations(db, auth, locationOptions);
  router.use(createMapNavigationRouter(), friendLocations);
  const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (e, rows) => e ? reject(e) : resolve(rows)));
  const get = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (e, row) => e ? reject(e) : resolve(row)));
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function (e) { e ? reject(e) : resolve(this); }));
  const initialize = async () => {
    await run(`CREATE TABLE IF NOT EXISTS map_places (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
    creator_id TEXT NOT NULL, post_id TEXT UNIQUE, created_at TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'private' CHECK (review_status IN ('private','pending','approved'))
  )`);
    const columns = await all('PRAGMA table_info(map_places)');
    if (!columns.some(column => column.name === 'review_status')) await run("ALTER TABLE map_places ADD COLUMN review_status TEXT NOT NULL DEFAULT 'private'");
    await run("UPDATE map_places SET review_status='approved' WHERE creator_id='local-admin' AND post_id IS NOT NULL AND review_status='private'");
  };

  router.get('/places', optionalAuth, async (req, res) => {
    const id = req.account ? String(req.account.id) : '';
    const subscriberId = req.account?.role === 'user' ? id : null;
    const admin = process.env.LOCAL_DEMO === '1' && req.account?.role === 'admin';
    res.set('Cache-Control', 'no-store');
    const places = await all(`SELECT id, name, latitude, longitude, post_id AS postId,
      review_status AS reviewStatus, CASE WHEN creator_id = ? THEN 1 ELSE 0 END AS isOwn,
      EXISTS (SELECT 1 FROM place_subscriptions s WHERE s.user_id = ? AND s.place_id = p.post_id) AS isSubscribed
      FROM map_places p WHERE review_status = 'approved' OR creator_id = ?
      OR (? = 1 AND review_status = 'pending') OR EXISTS (
        SELECT 1 FROM friendships f WHERE f.accepted = 1 AND
        ((CAST(f.low_id AS TEXT) = ? AND CAST(f.high_id AS TEXT) = p.creator_id) OR (CAST(f.high_id AS TEXT) = ? AND CAST(f.low_id AS TEXT) = p.creator_id))
      ) ORDER BY created_at DESC`, [id, subscriberId, id, admin ? 1 : 0, id, id]);
    res.json(places.map(place => ({ ...place, isSubscribed: Boolean(place.isSubscribed) })));
  });
  router.post('/places', auth, async (req, res) => {
    const { name, latitude, longitude, postId } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 || !validCoordinates(latitude, longitude) || (postId != null && (typeof postId !== 'string' || postId.length > 128))) return res.status(400).json({ error: 'Укажите название и корректную точку на карте' });
    if (postId && req.account.role !== 'admin') return res.status(403).json({ error: 'Привязка к публикации доступна администратору' });
    if (postId && !await get('SELECT id FROM posts WHERE id = ?', [postId])) return res.status(404).json({ error: 'Место не найдено' });
    const id = crypto.randomUUID();
    if (postId) {
      await run(`INSERT INTO map_places (id, name, latitude, longitude, creator_id, post_id, created_at, review_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
        ON CONFLICT(post_id) DO UPDATE SET name=excluded.name, latitude=excluded.latitude, longitude=excluded.longitude, review_status='approved'`, [id, name.trim(), latitude, longitude, String(req.account.id), postId, new Date().toISOString()]);
    } else await run('INSERT INTO map_places (id,name,latitude,longitude,creator_id,post_id,created_at,review_status) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)', [id, name.trim(), latitude, longitude, String(req.account.id), new Date().toISOString(), req.account.role === 'admin' && process.env.LOCAL_DEMO === '1' ? 'approved' : 'private']);
    res.status(201).json({ ok: true, id });
  });
  router.post('/places/:id/submit', auth, async (req, res) => {
    const changed = await run("UPDATE map_places SET review_status='pending' WHERE id=? AND creator_id=? AND review_status='private'", [req.params.id, String(req.account.id)]);
    if (!changed.changes) return res.status(409).json({ error: 'Точку нельзя отправить на проверку' });
    res.json({ ok:true });
  });
  router.delete('/places/:id', auth, async (req, res) => {
    const place = await get('SELECT creator_id, review_status FROM map_places WHERE id = ?', [req.params.id]);
    if (!place) return res.status(404).json({ error: 'Точка не найдена' });
    if (place.creator_id !== String(req.account.id) && !(process.env.LOCAL_DEMO === '1' && req.account.role === 'admin' && place.review_status !== 'private')) return res.status(403).json({ error: 'Нет доступа' });
    await run('DELETE FROM map_places WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });
  return { router, initialize, hide, revokeFriendship };
};
