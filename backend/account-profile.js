'use strict';

const { createHash } = require('node:crypto');
const express = require('express');

const maxAvatarBytes = 1024 * 1024;

module.exports = function createAccountProfile(db, auth) {
  const router = express.Router();
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
  const initialize = () => new Promise((resolve, reject) => db.exec(`
    CREATE TABLE IF NOT EXISTS account_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      bio TEXT NOT NULL DEFAULT '',
      is_private INTEGER NOT NULL DEFAULT 1 CHECK (is_private IN (0,1)),
      avatar_data BLOB,
      avatar_version TEXT
    );
    CREATE TRIGGER IF NOT EXISTS remove_deleted_account_profile
      AFTER DELETE ON users BEGIN DELETE FROM account_profiles WHERE user_id = OLD.id; END;
  `, error => error ? reject(error) : resolve()));

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

  async function getProfile(id) {
    const row = await get(`SELECT u.id,u.name,u.surname,u.role,p.bio,p.is_private,p.avatar_version
      FROM users u LEFT JOIN account_profiles p ON p.user_id=u.id WHERE u.id=?`, [id]);
    if (!row) return null;
    return { id: String(row.id), name: row.name, surname: row.surname || null, role: row.role,
      bio: row.bio || '', isPrivate: row.role === 'user' ? row.is_private !== 0 : false,
      avatar: row.avatar_version ? `/api/profile-avatars/${row.id}/${row.avatar_version}` : '' };
  }

  // Avatar is public identity information; publication media use a separate access-checked endpoint.
  router.get('/profile-avatars/:id/:version', async (req, res) => {
    const row = await get('SELECT avatar_data FROM account_profiles WHERE user_id=? AND avatar_version=?', [req.params.id,req.params.version]);
    if (!row?.avatar_data) return res.status(404).end();
    res.set({ 'Content-Type':'image/jpeg', 'X-Content-Type-Options':'nosniff', 'Cache-Control':'public, max-age=86400' });
    res.send(row.avatar_data);
  });

  router.use(['/account/profile','/profiles'], auth, (_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  router.get('/account/profile', async (req,res) => {
    const profile = await getProfile(req.account.id);
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
      const base64 = body.avatarBase64;
      if (typeof base64 !== 'string' || base64.length > Math.ceil(maxAvatarBytes/3)*4) return res.status(400).json({ error:'Аватарка должна быть JPEG до 1 МБ' });
      avatar = Buffer.from(base64,'base64');
      if (avatar.length < 5 || avatar.length > maxAvatarBytes || avatar.toString('base64') !== base64 ||
          avatar.readUInt16BE(0) !== 0xffd8 || avatar[2] !== 0xff || avatar.readUInt16BE(avatar.length-2) !== 0xffd9) {
        return res.status(400).json({ error:'Аватарка должна быть JPEG до 1 МБ' });
      }
    }
    const changesAvatar = Boolean(avatar || body.removeAvatar);
    const version = avatar ? createHash('sha256').update(avatar).digest('hex') : null;
    await run(`INSERT INTO account_profiles (user_id,bio,is_private,avatar_data,avatar_version)
      VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,is_private=excluded.is_private,
      avatar_data=CASE WHEN ? THEN excluded.avatar_data ELSE account_profiles.avatar_data END,
      avatar_version=CASE WHEN ? THEN excluded.avatar_version ELSE account_profiles.avatar_version END`,
      [req.account.id, body.bio === undefined ? current.bio : body.bio.trim(),
        body.isPrivate === undefined ? Number(current.isPrivate) : Number(body.isPrivate), avatar, version, changesAvatar, changesAvatar]);
    res.json(await getProfile(req.account.id));
  });
  router.get('/profiles/:id', async (req,res) => {
    const profile = await getProfile(req.params.id);
    if (!profile) return res.status(404).json({ error:'Профиль не найден' });
    const canView = await canViewProfile(req.account.id,profile.id);
    res.json({ ...profile, bio: canView ? profile.bio : '', canView });
  });
  return { router,initialize,getProfile,canViewProfile };
};
