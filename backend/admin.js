'use strict';

const express = require('express');

// Отдельные маршруты админки используют общую сессию статистики и не доверяют роли из клиента.
module.exports = function createAdminRouter(db, auth) {
  const router = express.Router();
  const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve(this.changes); }));

  router.use(auth, (req, res, next) => {
    // Демо-администратор существует только на localhost; сетевой режим требует отдельной защиты.
    if (process.env.LOCAL_DEMO !== '1' || req.account.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    next();
  });

  router.get('/places', async (_req, res) => {
    res.json(await all(`SELECT p.id, p.place, p.bio, p.address, p.category,
      pr.entry_type, pr.entry_price, pr.spend_min, pr.spend_max, pr.source AS price_source, pr.updated_at AS price_updated_at
      FROM posts p LEFT JOIN place_pricing pr ON pr.post_id=p.id ORDER BY p.place`));
  });

  router.put('/places/:id/pricing', async (req, res) => {
    const { entryType, entryPrice, spendMin, spendMax, source } = req.body || {};
    const valid = n => n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10000000);
    if (!['unknown', 'free', 'paid'].includes(entryType) || ![entryPrice, spendMin, spendMax].every(valid) ||
        (entryType === 'paid' ? !(entryPrice > 0) : entryPrice !== null) ||
        (spendMin !== null && spendMax !== null && spendMin > spendMax) ||
        typeof source !== 'string' || source.trim().length > 300 ||
        ((entryType !== 'unknown' || spendMin !== null || spendMax !== null) && !source.trim())) {
      return res.status(400).json({ error: 'Проверь стоимость и укажи источник сведений.' });
    }
    if (!await get('SELECT id FROM posts WHERE id = ?', [req.params.id])) return res.status(404).json({ error: 'Место не найдено' });
    await run(`INSERT INTO place_pricing(post_id,entry_type,entry_price,spend_min,spend_max,source,updated_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET entry_type=excluded.entry_type, entry_price=excluded.entry_price,
      spend_min=excluded.spend_min, spend_max=excluded.spend_max, source=excluded.source, updated_at=excluded.updated_at`,
      [req.params.id, entryType, entryPrice, spendMin, spendMax, source.trim(), new Date().toISOString()]);
    res.json({ ok: true });
  });

  router.get('/map-places', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await all(`SELECT p.id, p.name, p.latitude, p.longitude, p.post_id AS postId,
      p.review_status AS reviewStatus, u.name AS creatorName FROM map_places p
      LEFT JOIN users u ON CAST(u.id AS TEXT)=p.creator_id
      WHERE p.review_status IN ('pending','approved') ORDER BY p.created_at DESC`));
  });
  router.post('/map-places/:id/review', async (req, res) => {
    const decision = req.body?.decision;
    if (!['approve','reject'].includes(decision)) return res.status(400).json({error:'Выберите решение'});
    const changed = await run("UPDATE map_places SET review_status=? WHERE id=? AND review_status='pending'", [decision === 'approve' ? 'approved' : 'private', req.params.id]);
    if (!changed) return res.status(409).json({error:'Точка не ожидает проверки'});
    res.json({ok:true});
  });

  router.post('/map-places/:id/link', async (req, res) => {
    const postId = req.body?.postId;
    if (typeof postId !== 'string' || !postId || postId.length > 128 || req.body?.confirmed !== true) return res.status(400).json({ error: 'Выберите место и подтвердите привязку.' });
    if (!await get('SELECT id FROM posts WHERE id=?', [postId])) return res.status(404).json({ error: 'Место не найдено.' });
    const point = await get('SELECT post_id, review_status FROM map_places WHERE id=?', [req.params.id]);
    if (!point || point.review_status !== 'approved') return res.status(404).json({ error: 'Опубликованная точка не найдена.' });
    if (point.post_id && point.post_id !== postId) return res.status(409).json({ error: 'Точка уже связана с другим местом.' });
    const existing = await get('SELECT id FROM map_places WHERE post_id=?', [postId]);
    if (existing && existing.id !== req.params.id) return res.status(409).json({ error: 'У места уже есть связанная точка.' });
    try {
      const changed = await run("UPDATE map_places SET post_id=? WHERE id=? AND review_status='approved' AND (post_id IS NULL OR post_id=?)", [postId, req.params.id, postId]);
      if (!changed) return res.status(409).json({ error: 'Точка изменилась. Обновите список.' });
      res.json({ ok: true });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'У места уже есть связанная точка.' });
      throw error;
    }
  });

  router.put('/places/:id', async (req, res) => {
    const { place, bio, address, category } = req.body || {};
    if (typeof place !== 'string' || !place.trim() || place.trim().length > 200 ||
        ![bio, address, category].every(value => typeof value === 'string' && value.length <= 2000)) {
      return res.status(400).json({ error: 'Укажите название и корректные данные места' });
    }
    // Эти коды используются фильтрами приложения; неизвестный прежний код можно сохранить без изменения.
    const current = await get('SELECT category FROM posts WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Место не найдено' });
    const allowedCategories = ['', 'cafe', 'restaurant', 'park', 'museum', 'shop', 'entertainment'];
    if (!allowedCategories.includes(category.trim()) && category.trim() !== current.category) return res.status(400).json({ error: 'Выберите существующую категорию' });
    const changed = await run('UPDATE posts SET place = ?, bio = ?, address = ?, category = ? WHERE id = ?', [place.trim(), bio.trim(), address.trim(), category.trim(), req.params.id]);
    if (!changed) return res.status(404).json({ error: 'Место не найдено' });
    res.json({ ok: true });
  });

  // Модерация удаляет зависимые данные одной транзакцией; события статистики остаются историей действий.
  router.delete('/places/:id', async (req, res) => {
    const id = req.params.id;
    if (id.length > 128) return res.status(400).json({ error: 'Некорректный идентификатор' });
    if (!await get('SELECT id FROM posts WHERE id = ?', [id])) return res.status(404).json({ error: 'Место не найдено' });
    // В SQL попадают только шестнадцатеричные байты идентификатора, а не текст запроса.
    const value = `CAST(X'${Buffer.from(id, 'utf8').toString('hex')}' AS TEXT)`;
    const statements = ['gallery', 'tags', 'working_hours', 'reviews', 'contact_info', 'stories', 'place_pricing'].map(table => `DELETE FROM ${table} WHERE post_id = ${value};`);
    statements.push(`DELETE FROM map_places WHERE post_id = ${value};`);
    // Связь владельца сохраняется для подсчёта прежних событий компании за период статистики.
    statements.push(`DELETE FROM posts WHERE id = ${value};`);
    try {
      await new Promise((resolve, reject) => db.exec(`BEGIN IMMEDIATE; ${statements.join(' ')} COMMIT;`, error => error ? reject(error) : resolve()));
    } catch (error) {
      await new Promise(resolve => db.exec('ROLLBACK;', () => resolve()));
      throw error;
    }
    res.json({ ok: true });
  });

  router.delete('/reviews/:id', async (req, res) => {
    const changed = await run('DELETE FROM reviews WHERE id = ?', [req.params.id]);
    if (!changed) return res.status(404).json({ error: 'Отзыв не найден' });
    res.json({ ok: true });
  });

  // Пароль и его хеш не возвращаются; роль и права через этот интерфейс не меняются.
  router.get('/users', async (_req, res) => {
    res.json(await all('SELECT id, email, name, surname, role FROM users ORDER BY id'));
  });

  router.put('/users/:id', async (req, res) => {
    const { email, name, surname } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof name !== 'string' || !name.trim() || name.trim().length > 200 ||
        typeof surname !== 'string' || surname.trim().length > 200) {
      return res.status(400).json({ error: 'Укажите корректные email и имя' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === 'admin@local.test') return res.status(409).json({ error: 'Этот email зарезервирован для администратора' });
    const existing = await get('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ?', [normalizedEmail, req.params.id]);
    if (existing) return res.status(409).json({ error: 'Email уже зарегистрирован' });
    try {
      const changed = await run('UPDATE users SET email = ?, name = ?, surname = ? WHERE id = ?', [normalizedEmail, name.trim(), surname.trim() || null, req.params.id]);
      if (!changed) return res.status(404).json({ error: 'Пользователь не найден' });
      res.json({ ok: true });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Email уже зарегистрирован' });
      throw error;
    }
  });

  return router;
};
