'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');
const { createMapNavigationRouter } = require('../map-navigation');

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

async function navigationApi(t, provider) {
  const upstream = await listen(t, provider);
  const app = express();
  app.use(express.json());
  app.use('/api/map', createMapNavigationRouter({
    geocoderUrl: upstream + '/api/',
    walkingUrl: upstream + '/walk/route/v1/driving/',
    drivingUrl: upstream + '/drive/route/v1/driving/',
  }));
  return (await listen(t, app)) + '/api/map';
}

function house(street, number, longitude = 37.81) {
  return {
    geometry: { type: 'Point', coordinates: [longitude, 48.03] },
    properties: { type: 'house', street, housenumber: number, city: 'Донецьк' },
  };
}

test('ищет дом по варианту написания улицы и отбрасывает совпадение только по номеру', async t => {
  const provider = express();
  const requests = [];
  provider.get('/api/', (req, res) => {
    requests.push({ query: req.query.q, agent: req.get('User-Agent') });
    res.json({ features: req.query.q === 'іоніна 23'
      ? [house('Іоніна вулиця', '24', 37.82), house('Іоніна вулиця', '23'), house('Іоніна вулиця', '23')]
      : [house('ул Снежная', '23')] });
  });
  const base = await navigationApi(t, provider);
  const query = '/search?q=' + encodeURIComponent('ул. Ионина, 23');
  assert.equal((await fetch(base + '/search')).status, 400);

  const response = await fetch(base + query);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const results = await response.json();
  assert.deepEqual(results.map(({ title, latitude, longitude }) => ({ title, latitude, longitude })),
    [{ title: 'Іоніна вулиця, 23', latitude: 48.03, longitude: 37.81 }]);
  assert.deepEqual(requests.map(request => request.query), ['ионина 23', 'іоніна 23']);
  assert(requests.every(request => request.agent.includes('github.com/LigHan/hakRos')));
  assert.deepEqual(await fetch(base + '/search?q=' + encodeURIComponent('Ионина 23')).then(res => res.json()), results);
  assert.equal(requests.length, 2);
});

test('передаёт точки в правильный профиль OSRM и возвращает линию маршрута', async t => {
  const provider = express();
  const requests = [];
  const line = [[37.8, 48.01], [37.804, 48.019], [37.81, 48.03]];
  provider.get('/:mode/route/v1/driving/:points', (req, res) => {
    requests.push({ ...req.params, query: req.query });
    if (req.params.mode === 'drive') return res.status(400).json({ code: 'NoRoute' });
    res.json({
      code: 'Ok',
      routes: [{ geometry: { type: 'LineString', coordinates: line }, distance: 2580, duration: 1860 }],
    });
  });
  const base = await navigationApi(t, provider);
  const from = { latitude: 48.01, longitude: 37.8 };
  const to = { latitude: 48.03, longitude: 37.81 };
  const route = (fields = {}) => fetch(base + '/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, mode: 'walk', ...fields }),
  });

  assert.equal((await route({ from: { ...from, latitude: 95 } })).status, 400);
  assert.equal((await route({ to: from })).status, 400);
  assert.equal(requests.length, 0);

  const walking = await route();
  assert.equal(walking.status, 200);
  assert.equal(walking.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await walking.json(), { coordinates: line, distance: 2580, duration: 1860 });
  assert.equal(requests[0].mode, 'walk');
  assert.equal(requests[0].points, '37.800000,48.010000;37.810000,48.030000');
  assert.equal(requests[0].query.geometries, 'geojson');

  const driving = await route({ mode: 'drive' });
  assert.equal(driving.status, 404);
  assert.equal(requests[1].mode, 'drive');
  assert.match((await driving.json()).error, /не найден маршрут/);
});
