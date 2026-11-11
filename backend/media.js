'use strict';
const crypto = require('node:crypto');
const express = require('express');

// Stored in SQLite alongside the social records, never under a public static path.
module.exports = function createMedia(db, auth) {
  const router = express.Router();
  const secret = crypto.randomBytes(32);
  const limit = 25 * 1024 * 1024;
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, e => e ? reject(e) : resolve()));
  const get = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (e, r) => e ? reject(e) : resolve(r)));
  let canRead = async () => false;
  const initialize = () => run(`CREATE TABLE IF NOT EXISTS social_media (
    id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL, mime_type TEXT NOT NULL,
    kind TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL)`);
  function makeUrl(id, req) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
    const payload = JSON.stringify({ id, token: req.get('Authorization'), expires: Date.now() + 15 * 60 * 1000 });
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    const ticket = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
    return `/api/media/${encodeURIComponent(id)}?ticket=${ticket}`;
  }
  function playbackAuth(req, res, next) {
    if (!req.get('Authorization') && typeof req.query.ticket === 'string') {
      try {
        if (req.query.ticket.length > 1024) throw new Error('ticket');
        const bytes = Buffer.from(req.query.ticket, 'base64url');
        const decipher = crypto.createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        const payload = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
        if (payload.id !== req.params.id || payload.expires <= Date.now()) throw new Error('expired');
        req.headers.authorization = payload.token;
      } catch { return res.status(401).json({ error: 'Ссылка на видео устарела. Откройте публикацию снова.' }); }
    }
    return auth(req, res, next);
  }
  function validBytes(data, mime) {
    if (!Buffer.isBuffer(data) || !data.length) return false;
    if (mime === 'video/mp4' || mime === 'video/quicktime') return data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp';
    if (mime === 'video/webm') return data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (mime === 'image/jpeg') return data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    if (mime === 'image/png') return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mime === 'image/webp') return data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
    return false;
  }
  router.post('/', auth, express.raw({ type: () => true, limit }), async (req, res) => {
    if (!['user', 'company'].includes(req.account.role)) return res.status(403).json({ error: 'Нужен личный аккаунт или аккаунт компании' });
    const mime = (req.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!validBytes(req.body, mime)) return res.status(415).json({ error: 'Выберите MP4, MOV, WebM или изображение JPEG, PNG, WebP.' });
    const id = crypto.randomUUID(), kind = mime.startsWith('video/') ? 'video' : 'image';
    await run('INSERT INTO social_media VALUES(?,?,?,?,?,?)', [id, Number(req.account.id), mime, kind, req.body, new Date().toISOString()]);
    res.status(201).json({ id, url: makeUrl(id, req), mimeType: mime, kind });
  });
  router.get('/:id', playbackAuth, async (req, res) => {
    const row = await get('SELECT * FROM social_media WHERE id=?', [req.params.id]);
    if (!row || (String(row.owner_id) !== String(req.account.id) && !await canRead(row.id, Number(req.account.id)))) return res.status(404).json({ error: 'Медиа недоступно' });
    res.set({ 'Content-Type': row.mime_type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    const size = row.data.length, range = req.get('Range');
    if (!range) { res.set('Content-Length', String(size)); return res.send(row.data); }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start, end;
    if (match && (match[1] || match[2])) {
      if (!match[1]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
      else { start = Number(match[1]); end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1; }
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return res.status(416).set('Content-Range', `bytes */${size}`).end();
    res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }).send(row.data.subarray(start, end + 1));
  });
  router.use((error, _req, res, next) => error.type === 'entity.too.large' ? res.status(413).json({ error: 'Файл больше 25 МиБ. Выберите более короткое видео.' }) : next(error));
  return { router, initialize, makeUrl, setCanRead(check) { canRead = check; }, limit };
};
