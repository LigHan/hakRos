'use strict';

// Social posts are separate from the legacy `posts` table, which stores places.
const crypto = require('node:crypto');
const express = require('express');

module.exports = function createSocial(db, auth, media) {
  const router = express.Router();
  let hasProfiles = false;
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function (error) { error ? reject(error) : resolve(this); }));
  const get = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (error, row) => error ? reject(error) : resolve(row)));
  const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (error, rows) => error ? reject(error) : resolve(rows)));
  const initialize = async () => {
    await new Promise((resolve, reject) => db.exec(`
    CREATE TABLE IF NOT EXISTS social_items (
      id TEXT PRIMARY KEY, author_id INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('post','story')),
      body TEXT NOT NULL, image_url TEXT, place_id TEXT, original_id TEXT,
      request_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT,
      UNIQUE(author_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS social_items_feed ON social_items(created_at DESC);
    CREATE TABLE IF NOT EXISTS social_likes (item_id TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY(item_id,user_id));
    CREATE TABLE IF NOT EXISTS social_comments (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, user_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, request_id TEXT NOT NULL, UNIQUE(user_id,request_id));
    CREATE TABLE IF NOT EXISTS social_media (id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL, mime_type TEXT NOT NULL, kind TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL);
  `, error => error ? reject(error) : resolve()));
    const columns = await all('PRAGMA table_info(social_items)');
    if (!columns.some(column => column.name === 'media_id')) await run('ALTER TABLE social_items ADD COLUMN media_id TEXT');
    hasProfiles = Boolean(await get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_profiles'"));
  };

  // The same check is applied to lists, individual items and every write operation.
  const allowed = alias => `(
    ${alias}.author_id = ? OR
    ${hasProfiles ? `(${alias}.place_id IS NULL AND COALESCE((SELECT ap.is_private FROM account_profiles ap WHERE ap.user_id=${alias}.author_id),1)=0) OR` : ''}
    (${alias}.place_id IS NULL AND EXISTS (SELECT 1 FROM friendships f WHERE f.accepted = 1 AND f.low_id = MIN(${alias}.author_id, ?) AND f.high_id = MAX(${alias}.author_id, ?))) OR
    (${alias}.place_id IS NOT NULL AND EXISTS (SELECT 1 FROM place_subscriptions s WHERE s.user_id = ? AND s.place_id = ${alias}.place_id))
  ) AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > ?)`;
  const accessArgs = (user, now) => [user, user, user, user, now];
  const select = () => `SELECT i.id, i.kind, i.body, i.image_url AS imageUrl, i.place_id AS placeId,
    i.media_id AS mediaId,
    (SELECT m.kind FROM social_media m WHERE m.id=i.media_id) AS mediaKind,
    (SELECT m.mime_type FROM social_media m WHERE m.id=i.media_id) AS mediaMimeType,
    ${hasProfiles ? "(SELECT '/api/profile-avatars/' || ap.user_id || '/' || ap.avatar_version FROM account_profiles ap WHERE ap.user_id=i.author_id AND ap.avatar_version IS NOT NULL)" : 'NULL'} AS authorAvatar,
    i.created_at AS createdAt, i.expires_at AS expiresAt, i.original_id AS originalId,
    CAST(i.author_id AS TEXT) AS authorId, TRIM(u.name || ' ' || COALESCE(u.surname,'')) AS authorName,
    p.place AS placeName,
    (SELECT o.body FROM social_items o WHERE o.id=i.original_id) AS originalBody,
    (SELECT o.image_url FROM social_items o WHERE o.id=i.original_id) AS originalImageUrl,
    (SELECT o.media_id FROM social_items o WHERE o.id=i.original_id) AS originalMediaId,
    (SELECT m.kind FROM social_items o JOIN social_media m ON m.id=o.media_id WHERE o.id=i.original_id) AS originalMediaKind,
    (SELECT TRIM(ou.name || ' ' || COALESCE(ou.surname,'')) FROM social_items o JOIN users ou ON ou.id=o.author_id WHERE o.id=i.original_id) AS originalAuthorName,
    (SELECT COUNT(*) FROM social_likes l WHERE l.item_id=i.id) AS likes,
    EXISTS(SELECT 1 FROM social_likes l WHERE l.item_id=i.id AND l.user_id=?) AS liked,
    (SELECT COUNT(*) FROM social_comments c WHERE c.item_id=i.id) AS comments
    FROM social_items i JOIN users u ON u.id=i.author_id LEFT JOIN posts p ON p.id=i.place_id`;
  function visibility(now, id) {
    return `(${allowed('i')}) AND (i.original_id IS NULL OR EXISTS (SELECT 1 FROM social_items o WHERE o.id=i.original_id AND ${allowed('o')}))${id ? ' AND i.id = ?' : ''}`;
  }
  async function visible(id, user) {
    const now = new Date().toISOString();
    return get(`${select()} WHERE ${visibility(now, id)}`, [user, ...accessArgs(user, now), ...accessArgs(user, now), id]);
  }
  const clientItem = (row, req) => ({ ...row, liked: Boolean(row.liked), mediaUrl: row.mediaId && media ? media.makeUrl(row.mediaId, req) : null, originalMediaUrl: row.originalMediaId && media ? media.makeUrl(row.originalMediaId, req) : null });
  const validKey = key => typeof key === 'string' && /^[a-zA-Z0-9_-]{12,128}$/.test(key);
  const validId = value => typeof value === 'string' && value.length <= 128 && value.length > 0;

  router.use(auth, (req, res, next) => {
    const user = Number(req.account.id);
    if (!['user', 'company'].includes(req.account.role) || !Number.isSafeInteger(user) || user < 1) return res.status(403).json({ error: 'Нужен личный аккаунт или аккаунт заведения' });
    res.locals.user = user;
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/feed', async (req, res) => {
    const now = new Date().toISOString(), user = res.locals.user;
    const rows = await all(`${select()} WHERE ${visibility(now)} ORDER BY i.created_at DESC, i.id DESC LIMIT 200`, [user, ...accessArgs(user, now), ...accessArgs(user, now)]);
    res.json(rows.map(row => clientItem(row, req)));
  });
  router.post('/items', async (req, res) => {
    const user = res.locals.user;
    const { kind, requestId, placeId = null, originalId = null, mediaId = null } = req.body || {};
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const imageUrl = typeof req.body?.imageUrl === 'string' && req.body.imageUrl.trim() ? req.body.imageUrl.trim() : null;
    if (!['post', 'story'].includes(kind) || !validKey(requestId) || body.length > (kind === 'story' ? 280 : 2000) || (!body && !imageUrl && !originalId && !mediaId) || (mediaId !== null && !validId(mediaId)) || (imageUrl && mediaId) || (imageUrl && (imageUrl.length > 2048 || !/^https?:\/\//i.test(imageUrl))) || (originalId !== null && (!validId(originalId) || kind !== 'post'))) return res.status(400).json({ error: 'Проверьте текст, медиа и тип материала' });
    if (mediaId && !await get('SELECT 1 FROM social_media WHERE id=? AND owner_id=?', [mediaId, user])) return res.status(403).json({ error: 'Можно прикрепить только загруженный вами файл' });
    if (req.account.role === 'company') {
      if (!validId(placeId) || !await get('SELECT 1 FROM local_place_owners WHERE owner_id=? AND place_id=?', [String(user), placeId])) return res.status(403).json({ error: 'Выберите своё заведение' });
    } else if (placeId !== null) return res.status(403).json({ error: 'Публиковать от имени заведения может только его владелец' });
    if (originalId) {
      const original = await visible(originalId, user);
      if (!original || original.kind !== 'post' || original.originalId) return res.status(404).json({ error: 'Публикация недоступна для репоста' });
    }
    const previous = await get('SELECT * FROM social_items WHERE author_id=? AND request_id=?', [user, requestId]);
    if (previous) {
      if (previous.kind !== kind || previous.body !== body || previous.image_url !== imageUrl || previous.place_id !== placeId || previous.original_id !== originalId || previous.media_id !== mediaId) return res.status(409).json({ error: 'Ключ публикации уже использован для другого текста' });
      return res.json(clientItem(await visible(previous.id, user), req));
    }
    const id = crypto.randomUUID(), now = new Date();
    const expires = kind === 'story' ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() : null;
    try {
      await run('INSERT INTO social_items(id, author_id, kind, body, image_url, place_id, original_id, request_id, created_at, expires_at, media_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [id, user, kind, body, imageUrl, placeId, originalId, requestId, now.toISOString(), expires, mediaId]);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Повторите запрос с тем же содержимым' });
      throw error;
    }
    res.status(201).json(clientItem(await visible(id, user), req));
  });
  router.get('/items/:id', async (req, res) => {
    const item = await visible(req.params.id, res.locals.user);
    if (!item) return res.status(404).json({ error: 'Материал недоступен' });
    res.json(clientItem(item, req));
  });
  router.put('/items/:id/like', async (req, res) => {
    const item = await visible(req.params.id, res.locals.user);
    if (!item || item.kind !== 'post') return res.status(404).json({ error: 'Публикация недоступна' });
    await run('INSERT OR IGNORE INTO social_likes(item_id,user_id) VALUES(?,?)', [item.id, res.locals.user]);
    res.json(clientItem(await visible(item.id, res.locals.user), req));
  });
  router.delete('/items/:id/like', async (req, res) => {
    const item = await visible(req.params.id, res.locals.user);
    if (!item || item.kind !== 'post') return res.status(404).json({ error: 'Публикация недоступна' });
    await run('DELETE FROM social_likes WHERE item_id=? AND user_id=?', [item.id, res.locals.user]);
    res.json(clientItem(await visible(item.id, res.locals.user), req));
  });
  router.get('/items/:id/comments', async (req, res) => {
    const item = await visible(req.params.id, res.locals.user);
    if (!item || item.kind !== 'post') return res.status(404).json({ error: 'Публикация недоступна' });
    res.json(await all(`SELECT c.id, c.body, c.created_at AS createdAt, TRIM(u.name || ' ' || COALESCE(u.surname,'')) AS authorName FROM social_comments c JOIN users u ON u.id=c.user_id WHERE c.item_id=? ORDER BY c.created_at, c.id LIMIT 200`, [item.id]));
  });
  router.post('/items/:id/comments', async (req, res) => {
    const item = await visible(req.params.id, res.locals.user);
    if (!item || item.kind !== 'post') return res.status(404).json({ error: 'Публикация недоступна' });
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const requestId = req.body?.requestId;
    if (!body || body.length > 1000 || !validKey(requestId)) return res.status(400).json({ error: 'Введите комментарий' });
    const prior = await get('SELECT item_id, body FROM social_comments WHERE user_id=? AND request_id=?', [res.locals.user, requestId]);
    if (prior && (prior.item_id !== item.id || prior.body !== body)) return res.status(409).json({ error: 'Ключ комментария уже использован' });
    if (!prior) await run('INSERT INTO social_comments(id,item_id,user_id,body,created_at,request_id) VALUES(?,?,?,?,?,?)', [crypto.randomUUID(), item.id, res.locals.user, body, new Date().toISOString(), requestId]);
    res.json({ ok: true });
  });
  async function canReadMedia(mediaId, user) {
    const now = new Date().toISOString();
    return Boolean(await get(`SELECT 1 FROM social_items i WHERE ${visibility(now)} AND (i.media_id=? OR EXISTS (SELECT 1 FROM social_items original WHERE original.id=i.original_id AND original.media_id=?)) LIMIT 1`, [...accessArgs(user, now), ...accessArgs(user, now), mediaId, mediaId]));
  }
  return { router, initialize, canReadMedia };
};
