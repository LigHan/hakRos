'use strict';

const { createHash } = require('node:crypto');
const express = require('express');
const readJpeg = require('./jpeg');

const maxAvatarBytes = 1024 * 1024;
const legacyAvatarPrefix = 'data:image/jpeg;base64,';
const avatarVersion = data => createHash('sha256').update(data).digest('hex');

function avatarUrl(row) {
  if (!row.avatar_version) return '';
  if (row.avatar_is_public) return `/api/profile-avatars/${row.id}/${row.avatar_version}`;
  return row.avatar_data ? legacyAvatarPrefix + row.avatar_data.toString('base64') : '';
}

module.exports = function createAccountProfile(db, auth) {
  const router = express.Router();
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
  const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
  const schema = `
    CREATE TABLE IF NOT EXISTS account_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      bio TEXT NOT NULL DEFAULT '',
      is_private INTEGER NOT NULL DEFAULT 1 CHECK (is_private IN (0,1)),
      avatar_data BLOB,
      avatar_version TEXT
    );
    CREATE TRIGGER IF NOT EXISTS remove_deleted_account_profile
      AFTER DELETE ON users BEGIN DELETE FROM account_profiles WHERE user_id = OLD.id; END;
  `;

  async function migrateLegacyAvatars() {
    const columns = await all('PRAGMA table_info(users)');
    if (!columns.some(column => column.name === 'avatar')) return;
    const accounts = await all("SELECT id, avatar FROM users WHERE role = 'user' AND avatar IS NOT NULL");
    for (const { id, avatar } of accounts) {
      if (typeof avatar !== 'string' || !avatar.startsWith(legacyAvatarPrefix)) continue;
      const data = readJpeg(avatar.slice(legacyAvatarPrefix.length), 32 * 1024);
      if (!data) continue;
      await run(`INSERT INTO account_profiles (user_id, avatar_data, avatar_version, avatar_is_public)
        VALUES (?, ?, ?, 0) ON CONFLICT(user_id) DO UPDATE SET
        avatar_data = excluded.avatar_data, avatar_version = excluded.avatar_version, avatar_is_public = 0
        WHERE account_profiles.avatar_version IS NULL`, [id, data, avatarVersion(data)]);
    }
  }

  async function initialize() {
    await run('BEGIN IMMEDIATE');
    try {
      await exec(schema);
      const columns = await all('PRAGMA table_info(account_profiles)');
      if (!columns.some(column => column.name === 'avatar_is_public')) {
        await run('ALTER TABLE account_profiles ADD COLUMN avatar_is_public INTEGER NOT NULL DEFAULT 1 CHECK (avatar_is_public IN (0,1))');
        await migrateLegacyAvatars();
      }
      await run('COMMIT');
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  }

  async function canViewProfile(viewerId, authorId) {
    if (String(viewerId) === String(authorId)) return true;
    const author = await get(`SELECT u.role, COALESCE(p.is_private,1) AS private
      FROM users u LEFT JOIN account_profiles p ON p.user_id=u.id WHERE u.id=?`, [authorId]);
    if (!author || !viewerId) return false;
    if (author.role === 'company' || !author.private) return true;
    const viewer = Number(viewerId), authorNumber = Number(authorId);
    if (!Number.isSafeInteger(viewer) || !Number.isSafeInteger(authorNumber)) return false;
    return Boolean(await get(`SELECT 1 FROM friendships WHERE accepted=1
      AND low_id=MIN(?,?) AND high_id=MAX(?,?)`, [viewer,authorNumber,viewer,authorNumber]));
  }

  async function getProfile(id, { includePrivateAvatar = false } = {}) {
    const row = await get(`SELECT u.id,u.name,u.surname,u.role,p.bio,p.is_private,p.avatar_version,p.avatar_is_public,
      CASE WHEN ? AND p.avatar_is_public = 0 THEN p.avatar_data END AS avatar_data
      FROM users u LEFT JOIN account_profiles p ON p.user_id=u.id WHERE u.id=?`, [includePrivateAvatar ? 1 : 0, id]);
    if (!row) return null;
    return { id: String(row.id), name: row.name, surname: row.surname || null, role: row.role,
      bio: row.bio || '', isPrivate: row.role === 'user' ? row.is_private !== 0 : false,
      avatar: avatarUrl(row) };
  }

  // Этот маршрут отдаёт фото, сохранённые через настройки профиля.
  router.get('/profile-avatars/:id/:version', async (req, res) => {
    const row = await get('SELECT avatar_data FROM account_profiles WHERE user_id=? AND avatar_version=? AND avatar_is_public=1', [req.params.id,req.params.version]);
    if (!row?.avatar_data) return res.status(404).end();
    res.set({ 'Content-Type':'image/jpeg', 'X-Content-Type-Options':'nosniff', 'Cache-Control':'public, max-age=86400' });
    res.send(row.avatar_data);
  });

  router.use(['/account/profile','/profiles'], auth, (_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  router.get('/account/profile', async (req,res) => {
    const profile = await getProfile(req.account.id, { includePrivateAvatar: true });
    if (!profile) return res.status(404).json({ error:'Профиль не найден' });
    res.json(profile);
  });
  router.patch('/account/profile', express.json({ limit:'1500kb' }), async (req,res) => {
    const current = await getProfile(req.account.id);
    if (!current) return res.status(404).json({ error:'Профиль не найден' });
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !['bio','isPrivate','avatarBase64','removeAvatar'].some(key => Object.hasOwn(body,key))) {
      return res.status(400).json({ error:'Укажите изменения профиля' });
    }
    if (body.bio !== undefined && (typeof body.bio !== 'string' || body.bio.trim().length > 500)) {
      return res.status(400).json({ error:'Био должно содержать до 500 символов' });
    }
    if (body.isPrivate !== undefined && typeof body.isPrivate !== 'boolean') {
      return res.status(400).json({ error:'Укажите режим приватности' });
    }
    if (current.role !== 'user' && body.isPrivate === true) return res.status(400).json({ error:'Приватность доступна для личного профиля' });
    if (body.removeAvatar !== undefined && typeof body.removeAvatar !== 'boolean') return res.status(400).json({ error:'Некорректное изменение аватарки' });
    if (body.removeAvatar && body.avatarBase64 !== undefined) return res.status(400).json({ error:'Выберите одно действие с аватаркой' });
    let avatar = null;
    if (body.avatarBase64 !== undefined) {
      avatar = readJpeg(body.avatarBase64, maxAvatarBytes);
      if (!avatar) return res.status(400).json({ error:'Аватарка должна быть JPEG до 1 МБ' });
    }
    const changesAvatar = Boolean(avatar || body.removeAvatar);
    const version = avatar ? avatarVersion(avatar) : null;
    await run(`INSERT INTO account_profiles (user_id,bio,is_private,avatar_data,avatar_version)
      VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,is_private=excluded.is_private,
      avatar_data=CASE WHEN ? THEN excluded.avatar_data ELSE account_profiles.avatar_data END,
      avatar_version=CASE WHEN ? THEN excluded.avatar_version ELSE account_profiles.avatar_version END,
      avatar_is_public=CASE WHEN ? THEN 1 ELSE account_profiles.avatar_is_public END`,
      [req.account.id, body.bio === undefined ? current.bio : body.bio.trim(),
        body.isPrivate === undefined ? Number(current.isPrivate) : Number(body.isPrivate), avatar, version, changesAvatar, changesAvatar, changesAvatar]);
    res.json(await getProfile(req.account.id, { includePrivateAvatar: true }));
  });
  router.get('/profiles/:id', async (req,res) => {
    const profile = await getProfile(req.params.id);
    if (!profile) return res.status(404).json({ error:'Профиль не найден' });
    const canView = await canViewProfile(req.account.id,profile.id);
    res.json({ ...profile, bio: canView ? profile.bio : '', canView });
  });
  return { router,initialize,getProfile,canViewProfile };
};

module.exports.avatarUrl = avatarUrl;
