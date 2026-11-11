'use strict';

const express = require('express');
const crypto = require('node:crypto');

// Позиции людей живут только в памяти процесса и автоматически устаревают.
module.exports = function createMapRouter(db, auth, optionalAuth) {
  const router = express.Router();
  const locations = new Map();
  const ttl = 5 * 60 * 1000;
  const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (e, rows) => e ? reject(e) : resolve(rows)));
  const get = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (e, row) => e ? reject(e) : resolve(row)));
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function (e) { e ? reject(e) : resolve(this); }));
  const validCoordinates = (latitude, longitude) => typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  const prune = () => { for (const [id, location] of locations) if (Date.now() - location.updatedAt > ttl) locations.delete(id); };
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
    const admin = process.env.LOCAL_DEMO === '1' && req.account?.role === 'admin';
    res.set('Cache-Control', 'no-store');
    res.json(await all(`SELECT id, name, latitude, longitude, post_id AS postId,
      review_status AS reviewStatus, CASE WHEN creator_id = ? THEN 1 ELSE 0 END AS isOwn
      FROM map_places p WHERE review_status = 'approved' OR creator_id = ?
      OR (? = 1 AND review_status = 'pending') OR EXISTS (
        SELECT 1 FROM friendships f WHERE f.accepted = 1 AND
        ((CAST(f.low_id AS TEXT) = ? AND CAST(f.high_id AS TEXT) = p.creator_id) OR (CAST(f.high_id AS TEXT) = ? AND CAST(f.low_id AS TEXT) = p.creator_id))
      ) ORDER BY created_at DESC`, [id, id, admin ? 1 : 0, id, id]));
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
  router.get('/locations', auth, async (_req, res) => {
    prune();
    res.set('Cache-Control', 'no-store');
    res.json([...locations.values()]);
  });
  router.put('/location', auth, async (req, res) => {
    if (req.account.role !== 'user') return res.status(403).json({ error: 'Доступно аккаунту пользователя' });
    const { latitude, longitude } = req.body || {};
    if (!validCoordinates(latitude, longitude)) return res.status(400).json({ error: 'Некорректные координаты' });
    const user = await get('SELECT id, name FROM users WHERE id = ?', [req.account.id]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    prune();
    locations.set(String(user.id), { id: String(user.id), name: user.name, latitude, longitude, updatedAt: Date.now() });
    res.set('Cache-Control', 'no-store').json({ ok: true });
  });
  router.delete('/location', auth, (req, res) => { locations.delete(String(req.account.id)); res.json({ ok: true }); });
  return { router, initialize, hide: id => locations.delete(String(id)) };
};
