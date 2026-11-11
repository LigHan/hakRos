'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');
const { default: Pbf } = require('pbf');
const { createRussianNameLookup } = require('../map-russian-names');
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
    reverseGeocoderUrl: '',
    namesForPoint: createRussianNameLookup({ tileJsonUrl: upstream + '/planet' }),
    walkingUrl: upstream + '/walk/route/v1/driving/',
    drivingUrl: upstream + '/drive/route/v1/driving/',
  }));
  return (await listen(t, app)) + '/api/map';
}

function house(street, number, longitude = 37.81) {
  return {
    geometry: { type: 'Point', coordinates: [longitude, 48.03] },
    properties: { type: 'house', street, housenumber: number, city: 'Донецьк', district: 'Київський район' },
  };
}

function namesTile() {
  const tile = new Pbf();
  const layers = [
    { name: 'transportation_name', labels: [['Іоніна вулиця', 'Ионина улица']] },
    { name: 'place', labels: [['Донецьк', 'Донецк'], ['Київський район', 'Киевский район']] },
  ];
  for (const layer of layers) {
    tile.writeMessage(3, ({ name, labels }, writer) => {
      writer.writeStringField(1, name);
      writer.writeStringField(3, 'name');
      writer.writeStringField(3, 'name:ru');
      for (const [index, names] of labels.entries()) {
        for (const value of names) writer.writeMessage(4, (text, pbf) => pbf.writeStringField(1, text), value);
        writer.writeMessage(2, (tags, pbf) => {
          pbf.writePackedVarint(2, tags);
          pbf.writeVarintField(3, 1);
          pbf.writePackedVarint(4, [9, 0, 0]);
        }, [0, index * 2, 1, index * 2 + 1]);
      }
      writer.writeVarintField(5, 4096);
      writer.writeVarintField(15, 2);
    }, layer);
  }
  return Buffer.from(tile.finish());
}

test('ищет точный дом и показывает русские названия из тайлов', async t => {
  const provider = express();
  const requests = [];
  let tileRequests = 0;
  provider.get('/api/', (req, res) => {
    requests.push({ query: req.query.q, agent: req.get('User-Agent') });
    if (req.query.q === 'садова 23') return res.json({ features: [house('Садова вулиця', '23')] });
    res.json({ features: req.query.q === 'іоніна 23'
      ? [house('Іоніна вулиця', '24', 37.82), house('Іоніна вулиця', '23'), house('Іоніна вулиця', '23')]
      : [house('ул Снежная', '23')] });
  });
  provider.get('/planet', (req, res) => {
    res.json({ maxzoom: 14, tiles: ['http://' + req.get('host') + '/tiles/{z}/{x}/{y}.pbf'] });
  });
  provider.get('/tiles/:zoom/:x/:y.pbf', (_req, res) => {
    tileRequests++;
    res.send(namesTile());
  });
  const base = await navigationApi(t, provider);
  const query = '/search?q=' + encodeURIComponent('ул. Ионина, 23');
  assert.equal((await fetch(base + '/search')).status, 400);

  const response = await fetch(base + query);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const results = await response.json();
  assert.deepEqual(results, [{
    id: '37.81,48.03',
    title: 'улица Ионина, 23',
    subtitle: 'Донецк, Киевский район',
    address: 'улица Ионина, 23, Донецк, Киевский район',
    latitude: 48.03,
    longitude: 37.81,
  }]);
  assert.deepEqual(requests.map(request => request.query), ['ионина 23', 'іоніна 23']);
  assert(requests.every(request => request.agent.includes('github.com/LigHan/hakRos')));
  assert.deepEqual(await fetch(base + '/search?q=' + encodeURIComponent('Ионина 23')).then(res => res.json()), results);
  assert.equal(requests.length, 2);

  const unlabelled = await fetch(base + '/search?q=' + encodeURIComponent('Садова 23')).then(res => res.json());
  assert.equal(unlabelled[0].title, 'Дом №23');
  assert.equal(unlabelled[0].subtitle, 'Донецк, Киевский район, 48.03000, 37.81000');
  assert.equal(unlabelled[0].address, null);
  assert.equal(tileRequests, 1);
});

test('определяет русский адрес без подмены выбранной точки', async t => {
  const provider = express();
  const requests = [];
  provider.get('/reverse', (req, res) => {
    requests.push({ ...req.query, language: req.get('Accept-Language') });
    if (req.query.lat === '0') return res.json({ features: [house('Садова вулиця', '23')] });
    if (req.query.lat === '1') return res.status(503).json({ error: 'Unavailable' });
    res.json({ features: [house('Садова вулиця', '24', 37.82), house('Іоніна вулиця', '23')] });
  });
  provider.get('/planet', (req, res) => {
    res.json({ maxzoom: 14, tiles: ['http://' + req.get('host') + '/tiles/{z}/{x}/{y}.pbf'] });
  });
  provider.get('/tiles/:zoom/:x/:y.pbf', (_req, res) => res.send(namesTile()));
  const base = await navigationApi(t, provider);

  for (const query of ['?lat=&lon=37', '?lat=91&lon=37', '?lat=48&lon=181', '?lat=48&lat=49&lon=37', '?lat=0x30&lon=37']) {
    assert.equal((await fetch(base + '/reverse' + query)).status, 400);
  }
  assert.equal(requests.length, 0);

  const found = await fetch(base + '/reverse?lat=48.03127&lon=37.81456');
  assert.equal(found.status, 200);
  assert.equal(found.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await found.json(), { address: 'улица Ионина, 23, Донецк, Киевский район' });
  assert.deepEqual(requests[0], { lat: '48.03127', lon: '37.81456', limit: '5', radius: '0.25', language: 'ru' });

  const missing = await fetch(base + '/reverse?lat=0&lon=37');
  assert.equal(missing.status, 200);
  assert.deepEqual(await missing.json(), { address: null });
  const unavailable = await fetch(base + '/reverse?lat=1&lon=37');
  assert.equal(unavailable.status, 502);
  assert.match((await unavailable.json()).error, /введите адрес вручную/);
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
