'use strict';

const { createHash, randomUUID } = require('node:crypto');
const express = require('express');

const categories = new Set(['', 'cafe', 'restaurant', 'park', 'museum', 'shop', 'entertainment']);
const defaultImage = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Обновление через представление выполняет запись карточки, владельца и расписания одним SQL-запросом.
const schema = `
  CREATE VIEW IF NOT EXISTS company_place_editor AS
    SELECT o.owner_id, p.id, p.user, p.userAvatar, p.userHandle,
      p.place, p.address, p.bio, p.category, p.image,
      (
        SELECT json_group_array(json_object('label', label, 'value', value))
        FROM working_hours WHERE post_id = p.id
      ) AS hours
    FROM local_place_owners AS o
    JOIN posts AS p ON p.id = o.place_id;

  CREATE TRIGGER IF NOT EXISTS company_place_insert
    INSTEAD OF INSERT ON company_place_editor BEGIN
      INSERT INTO posts (id, user, userAvatar, userHandle, place, address, bio, category, image)
      VALUES (NEW.id, NEW.user, NEW.userAvatar, NEW.userHandle,
        NEW.place, NEW.address, NEW.bio, NEW.category, NEW.image);
      INSERT INTO local_place_owners (place_id, owner_id) VALUES (NEW.id, NEW.owner_id);
      INSERT INTO working_hours (post_id, label, value)
        SELECT NEW.id, json_extract(value, '$.label'), json_extract(value, '$.value')
        FROM json_each(NEW.hours) ORDER BY CAST(key AS INTEGER);
    END;

  CREATE TRIGGER IF NOT EXISTS company_place_update
    INSTEAD OF UPDATE OF place, address, bio, category, image, hours ON company_place_editor BEGIN
      UPDATE posts SET place = NEW.place, address = NEW.address, bio = NEW.bio,
        category = NEW.category, image = NEW.image WHERE id = OLD.id;
      DELETE FROM working_hours WHERE post_id = OLD.id;
      INSERT INTO working_hours (post_id, label, value)
        SELECT OLD.id, json_extract(value, '$.label'), json_extract(value, '$.value')
        FROM json_each(NEW.hours) ORDER BY CAST(key AS INTEGER);
    END;
`;

function isImageUrl(value) {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function parseFields(body, current) {
  const { place, address = '', bio = '', category = '', image = current?.image ?? '', workingHours = [] } = body ?? {};
  if (typeof place !== 'string' || !place.trim() || place.trim().length > 200) {
    return { error: 'Укажите название заведения длиной до 200 символов.' };
  }
  if (typeof address !== 'string' || address.trim().length > 2000 ||
      typeof bio !== 'string' || bio.trim().length > 2000) {
    return { error: 'Адрес и описание должны быть до 2000 символов.' };
  }
  if (typeof category !== 'string' || (!categories.has(category) && category !== current?.category)) {
    return { error: 'Выберите категорию из списка.' };
  }
  if (typeof image !== 'string' || (image.trim() && image.trim() !== current?.image && !isImageUrl(image.trim()))) {
    return { error: 'Введите ссылку на фото, которая начинается с https:// или http://.' };
  }
  if (!Array.isArray(workingHours) || workingHours.length > 30 || workingHours.some(slot =>
    typeof slot?.label !== 'string' || !slot.label.trim() || slot.label.trim().length > 80 ||
    typeof slot?.value !== 'string' || !slot.value.trim() || slot.value.trim().length > 100
  )) {
    return { error: 'Укажите день и часы в каждой строке расписания. Можно добавить до 30 строк.' };
  }

  const hours = workingHours.map(slot => ({ label: slot.label.trim(), value: slot.value.trim() }));
  return {
    values: [place.trim(), address.trim(), bio.trim(), category, image.trim() || defaultImage, JSON.stringify(hours)],
  };
}

module.exports = function createCompanyPlaces(db, auth, databaseService) {
  const router = express.Router();

  const initialize = () => new Promise((resolve, reject) => {
    db.exec(schema, error => error ? reject(error) : resolve());
  });
  const all = (sql, params) => new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
  const get = (sql, params) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
  const run = (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params, error => error ? reject(error) : resolve());
  });

  const findOwned = (ownerId, id) => get(
    'SELECT id, category, image FROM company_place_editor WHERE owner_id = ? AND id = ?',
    [ownerId, id]
  );

  async function getOwnedPlace(ownerId, id) {
    const row = await findOwned(ownerId, id);
    return row ? databaseService.getPostById(row.id) : null;
  }

  router.use(auth, (req, res, next) => {
    if (req.account.role !== 'company') {
      return res.status(403).json({ error: 'Кабинет заведений доступен в аккаунте компании.' });
    }
    res.locals.ownerId = req.account.id;
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.param('placeId', (_req, res, next, id) => {
    if (!id.trim() || id.length > 128) return res.status(400).json({ error: 'Некорректный ID заведения.' });
    next();
  });

  router.get('/', async (_req, res) => {
    const rows = await all(
      'SELECT id FROM company_place_editor WHERE owner_id = ? ORDER BY place COLLATE NOCASE, id',
      [res.locals.ownerId]
    );
    const places = await Promise.all(rows.map(row => databaseService.getPostById(row.id)));
    res.json(places.filter(Boolean));
  });

  router.get('/:placeId', async (req, res) => {
    const place = await getOwnedPlace(res.locals.ownerId, req.params.placeId);
    if (!place) return res.status(404).json({ error: 'Ваше заведение не найдено.' });
    res.json(place);
  });

  router.post('/', async (req, res) => {
    const ownerId = res.locals.ownerId;
    const requestId = req.body?.requestId;
    if (requestId !== undefined && (typeof requestId !== 'string' || !/^[a-z0-9-]{8,80}$/i.test(requestId))) {
      return res.status(400).json({ error: 'Некорректный ID запроса.' });
    }

    const id = requestId
      ? `place-${createHash('sha256').update(`${ownerId}:${requestId}`).digest('hex')}`
      : `place-${randomUUID()}`;
    const existing = requestId && await getOwnedPlace(ownerId, id);
    if (existing) return res.json(existing);

    const fields = parseFields(req.body);
    if (fields.error) return res.status(400).json({ error: fields.error });

    await run(`
      INSERT INTO company_place_editor (
        owner_id, id, user, userAvatar, userHandle, place, address, bio, category, image, hours
      )
      SELECT ?, ?, name, ?, LOWER(CASE WHEN INSTR(email, '@') > 0
        THEN SUBSTR(email, 1, INSTR(email, '@') - 1) ELSE email END), ?, ?, ?, ?, ?, ?
      FROM users
      WHERE id = ? AND role = 'company'
        AND NOT EXISTS (SELECT 1 FROM posts WHERE id = ?)
        AND NOT EXISTS (SELECT 1 FROM local_place_owners WHERE place_id = ?)
    `, [ownerId, id, defaultImage, ...fields.values, ownerId, id, id]);

    const created = await getOwnedPlace(ownerId, id);
    if (!created) return res.status(409).json({ error: 'Не удалось создать заведение.' });
    res.status(201).json(created);
  });

  router.put('/:placeId', async (req, res) => {
    const ownerId = res.locals.ownerId;
    const { placeId } = req.params;
    const current = await findOwned(ownerId, placeId);
    if (!current) return res.status(404).json({ error: 'Ваше заведение не найдено.' });

    const fields = parseFields(req.body, current);
    if (fields.error) return res.status(400).json({ error: fields.error });

    await run(`
      UPDATE company_place_editor
      SET place = ?, address = ?, bio = ?, category = ?, image = ?, hours = ?
      WHERE owner_id = ? AND id = ?
    `, [...fields.values, ownerId, placeId]);
    const updated = await getOwnedPlace(ownerId, placeId);
    if (!updated) return res.status(404).json({ error: 'Ваше заведение не найдено.' });
    res.json(updated);
  });

  return { router, initialize };
};
