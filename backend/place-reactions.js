'use strict';

const express = require('express');

// One reaction of each kind per person and place; repeated PUT/DELETE is safe.
module.exports = function createPlaceReactions(db, auth) {
  const router = express.Router();
  const get = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (e, row) => e ? reject(e) : resolve(row)));
  const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (e, rows) => e ? reject(e) : resolve(rows)));
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, e => e ? reject(e) : resolve()));
  const personal = (req, res, next) => req.account.role === 'user' ? next() : res.status(403).json({ error: 'Оценивать места можно из личного аккаунта.' });
  const place = async (req, res, next) => {
    if (!await get('SELECT id FROM posts WHERE id=?', [req.params.id])) return res.status(404).json({ error: 'Место не найдено.' });
    res.set('Cache-Control', 'no-store');
    next();
  };
  const totals = async (id, userId) => get(`SELECT
    (SELECT COUNT(*) FROM place_likes WHERE post_id=?) AS likes,
    EXISTS(SELECT 1 FROM place_likes WHERE post_id=? AND user_id=?) AS liked,
    COALESCE((SELECT AVG(rating) FROM place_ratings WHERE post_id=?), 0) AS rating,
    (SELECT COUNT(*) FROM place_ratings WHERE post_id=?) AS ratingCount,
    (SELECT rating FROM place_ratings WHERE post_id=? AND user_id=?) AS myRating`,
  [id, id, userId, id, id, id, userId]);
  const response = async (id, userId) => {
    const result = await totals(id, userId);
    return { ...result, liked: Boolean(result.liked) };
  };

  router.get('/place-likes', auth, personal, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = await all('SELECT post_id FROM place_likes WHERE user_id=?', [req.account.id]);
    res.json(rows.map(row => row.post_id));
  });
  router.get('/posts/:id/reactions', auth, personal, place, async (req, res) => res.json(await response(req.params.id, req.account.id)));
  router.put('/posts/:id/like', auth, personal, place, async (req, res) => {
    await run('INSERT OR IGNORE INTO place_likes(post_id,user_id) VALUES(?,?)', [req.params.id, req.account.id]);
    res.json(await response(req.params.id, req.account.id));
  });
  router.delete('/posts/:id/like', auth, personal, place, async (req, res) => {
    await run('DELETE FROM place_likes WHERE post_id=? AND user_id=?', [req.params.id, req.account.id]);
    res.json(await response(req.params.id, req.account.id));
  });
  router.put('/posts/:id/rating', auth, personal, place, async (req, res) => {
    const rating = req.body?.rating;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Выберите от 1 до 5 звёзд.' });
    await run(`INSERT INTO place_ratings(post_id,user_id,rating) VALUES(?,?,?)
      ON CONFLICT(post_id,user_id) DO UPDATE SET rating=excluded.rating`, [req.params.id, req.account.id, rating]);
    res.json(await response(req.params.id, req.account.id));
  });
  router.delete('/posts/:id/rating', auth, personal, place, async (req, res) => {
    await run('DELETE FROM place_ratings WHERE post_id=? AND user_id=?', [req.params.id, req.account.id]);
    res.json(await response(req.params.id, req.account.id));
  });
  return router;
};
