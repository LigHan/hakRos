'use strict';

const { setTimeout: delay } = require('node:timers/promises');
const express = require('express');

const defaultGeocoder = 'https://photon.komoot.io/api/';
const defaultRouter = 'https://routing.openstreetmap.de';
const cityCenter = { latitude: 48.0158, longitude: 37.8026 };
const userAgent = 'hakRos/1.0 (https://github.com/LigHan/hakRos)';
const addressWords = /(?<![\p{L}\p{N}])(?:ул(?:ица)?|вул(?:иця)?|д(?:ом)?|буд(?:инок)?)(?![\p{L}\p{N}])\.?/giu;
const houseNumber = /(?<![\p{L}\p{N}])(\d+(?:\/\d+)?[\p{L}]?)(?=$|[\s,])/u;

function validCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

class MapServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Один исходящий запрос в секунду на сервис, в том числе при параллельных запросах.
function providerClient() {
  let tail = Promise.resolve();
  let pending = 0;
  let lastStart = 0;
  return async url => {
    if (pending >= 4) throw new MapServiceError(429, 'Сервис карты занят. Повторите запрос через несколько секунд.');
    pending++;
    const task = tail.then(async () => {
      const wait = 1000 - (Date.now() - lastStart);
      if (wait > 0) await delay(wait);
      lastStart = Date.now();
      const response = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'ru', Accept: 'application/json' },
      });
      if (response.status === 429) throw new MapServiceError(429, 'Сервис карты занят. Повторите запрос через несколько секунд.');
      return { ok: response.ok, data: await response.json() };
    });
    tail = task.catch(() => {});
    try {
      return await task;
    } finally {
      pending--;
    }
  };
}

function cleanQuery(value) {
  return value.normalize('NFKC').toLowerCase()
    .replace(addressWords, ' ')
    .replace(/(?<!\p{L})донецк(?!\p{L})/gu, 'донецьк')
    .replace(/ё/g, 'е')
    .replace(/[,.;\s]+/g, ' ').trim();
}

function comparable(value) {
  return value.normalize('NFKC').toLowerCase().replace(addressWords, ' ')
    .replace(/[іы]/g, 'и').replace(/ё/g, 'е').replace(/[ьъ’']/g, '');
}

function tokens(value) {
  return comparable(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function addressMatches(place, query) {
  const requested = tokens(query);
  const house = query.match(houseNumber)?.[1];
  const fields = [place.name, place.street, place.housenumber, place.city, place.district,
    place.locality, place.county, place.state, place.country, place.postcode];
  const words = new Set(tokens(fields.filter(value => typeof value === 'string').join(' ')));
  if (house) {
    const numberWords = tokens(house);
    const name = tokens(typeof place.name === 'string' ? place.name : '');
    const street = tokens(typeof place.street === 'string' ? place.street : '');
    if (!requested.some(word => !numberWords.includes(word) && (street.includes(word) || name.includes(word)))) return false;
    // Число может быть частью названия места, например «Парк 50 лет».
    if (comparable(String(place.housenumber ?? '')) !== comparable(house) && !numberWords.every(word => name.includes(word))) {
      return false;
    }
  }
  return requested.every(word => words.has(word) ||
    (!house && word.length >= 3 && [...words].some(candidate => candidate.startsWith(word))));
}

function addressResults(features, query) {
  const results = new Map();
  for (const feature of features) {
    const place = feature?.properties;
    if (!place || feature.geometry?.type !== 'Point' || !addressMatches(place, query)) continue;
    if (!Array.isArray(feature.geometry.coordinates)) continue;
    const [longitude, latitude] = feature.geometry.coordinates;
    if (!validCoordinates(latitude, longitude)) continue;

    const streetAddress = [place.street, place.housenumber].filter(Boolean).join(', ');
    const title = place.type === 'house' ? streetAddress || place.name : place.name || streetAddress;
    if (typeof title !== 'string' || !title) continue;
    const locality = place.city || place.locality || place.county || place.state || place.country;
    const subtitle = [place.type === 'house' ? null : streetAddress, locality, place.district]
      .filter((part, index, all) => part && part !== title && all.indexOf(part) === index).join(', ');
    const id = longitude + ',' + latitude + ' ' + title;
    results.set(id, { id, title, subtitle, latitude, longitude });
    if (results.size === 5) break;
  }
  return [...results.values()];
}

function coordinatesParam(point) {
  return point.longitude.toFixed(6) + ',' + point.latitude.toFixed(6);
}

function sendServiceError(res, error, fallback) {
  if (error instanceof MapServiceError) return res.status(error.status).json({ error: error.message });
  return res.status(502).json({ error: fallback });
}

function createMapNavigationRouter({
  geocoderUrl = process.env.MAP_GEOCODER_URL?.trim() || defaultGeocoder,
  walkingUrl = process.env.MAP_WALK_ROUTER_URL?.trim() || defaultRouter + '/routed-foot/route/v1/driving/',
  drivingUrl = process.env.MAP_DRIVE_ROUTER_URL?.trim() || defaultRouter + '/routed-car/route/v1/driving/',
} = {}) {
  const router = express.Router();
  const geocode = providerClient();
  const route = providerClient();
  const cache = new Map();

  async function searchPhoton(query) {
    const url = new URL(geocoderUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('lat', String(cityCenter.latitude));
    url.searchParams.set('lon', String(cityCenter.longitude));
    url.searchParams.set('limit', '8');
    const { ok, data } = await geocode(url);
    if (!ok || !Array.isArray(data?.features)) throw new Error('Некорректный ответ геокодера');
    return data.features;
  }

  router.get('/search', async (req, res) => {
    const text = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (text.length < 2 || text.length > 160) {
      return res.status(400).json({ error: 'Введите адрес или название длиной от 2 до 160 символов.' });
    }
    res.set('Cache-Control', 'no-store');
    const query = cleanQuery(text);
    if (!tokens(query).length) return res.json([]);
    const cached = cache.get(query);
    if (cached && cached.expires > Date.now()) return res.json(cached.results);

    try {
      let results = addressResults(await searchPhoton(query), query);
      const localSpelling = query.replace(/и/g, 'і').replace(/ы/g, 'и');
      if (!results.length && localSpelling !== query) {
        results = addressResults(await searchPhoton(localSpelling), query);
      }
      if (cache.size >= 128) cache.delete(cache.keys().next().value);
      cache.set(query, { results, expires: Date.now() + 10 * 60 * 1000 });
      return res.json(results);
    } catch (error) {
      return sendServiceError(res, error, 'Поиск адресов временно недоступен. Попробуйте ещё раз.');
    }
  });

  router.post('/route', async (req, res) => {
    const { from, to, mode } = req.body ?? {};
    if (!validCoordinates(from?.latitude, from?.longitude) ||
        !validCoordinates(to?.latitude, to?.longitude) || (mode !== 'walk' && mode !== 'drive')) {
      return res.status(400).json({ error: 'Укажите начальную и конечную точки маршрута и способ передвижения.' });
    }
    res.set('Cache-Control', 'no-store');
    const start = coordinatesParam(from);
    const end = coordinatesParam(to);
    if (start === end) return res.status(400).json({ error: 'Выберите разные точки начала и конца маршрута.' });

    try {
      const url = new URL(mode === 'walk' ? walkingUrl : drivingUrl);
      url.pathname = url.pathname.replace(/\/?$/, '/') + start + ';' + end;
      url.searchParams.set('overview', 'simplified');
      url.searchParams.set('geometries', 'geojson');
      url.searchParams.set('steps', 'false');
      const { ok, data } = await route(url);
      if (data?.code === 'NoRoute' || data?.code === 'NoSegment') {
        return res.status(404).json({ error: 'Между этими точками не найден маршрут для выбранного способа передвижения.' });
      }
      const match = data?.routes?.[0];
      const coordinates = match?.geometry?.coordinates;
      if (!ok || data?.code !== 'Ok' || match?.geometry?.type !== 'LineString' || !Array.isArray(coordinates) ||
          coordinates.length < 2 || coordinates.length > 10000 ||
          coordinates.some(point => !Array.isArray(point) || !validCoordinates(point[1], point[0])) ||
          !Number.isFinite(match.distance) || !Number.isFinite(match.duration) || match.distance < 0 || match.duration < 0) {
        throw new Error('Некорректный ответ сервиса маршрутов');
      }
      return res.json({
        coordinates: coordinates.map(([longitude, latitude]) => [longitude, latitude]),
        distance: match.distance,
        duration: match.duration,
      });
    } catch (error) {
      return sendServiceError(res, error, 'Сервис маршрутов временно недоступен. Попробуйте ещё раз.');
    }
  });

  return router;
}

module.exports = { createMapNavigationRouter, validCoordinates };
