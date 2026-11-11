'use strict';

const { VectorTile } = require('@mapbox/vector-tile');
const { default: Pbf } = require('pbf');
const { readRussianLabel } = require('./map-assets/russian-labels');

const layerGroups = {
  transportation_name: 'street',
  place: 'area',
  poi: 'place',
  water_name: 'place',
  waterway: 'place',
  aerodrome_label: 'place',
};
const aliases = ['name', 'name:uk', 'name:ru', 'name:nonlatin', 'name:en', 'name:latin', 'name_en'];
const noRussianName = () => '';

function nameKey(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/ё/g, 'е');
}

function indexTile(bytes) {
  const tile = new VectorTile(new Pbf(bytes));
  const names = { street: new Map(), area: new Map(), place: new Map() };
  for (const [layerId, group] of Object.entries(layerGroups)) {
    const layer = tile.layers[layerId];
    if (!layer) continue;
    const index = names[group];
    for (let i = 0; i < layer.length; i++) {
      const fields = layer.feature(i).properties;
      const russian = readRussianLabel(fields['name:ru']);
      if (!russian) continue;
      for (const field of aliases) {
        const alias = nameKey(fields[field]);
        if (!alias) continue;
        const previous = index.get(alias);
        // У одного названия могут быть разные объекты в том же тайле.
        index.set(alias, previous === undefined || previous === russian ? russian : '');
      }
    }
  }
  return (value, group) => names[group].get(nameKey(value)) || '';
}

function tileCoordinates(latitude, longitude, zoom) {
  const width = 2 ** zoom;
  const radians = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
  const clamp = value => Math.max(0, Math.min(width - 1, Math.floor(value)));
  return {
    x: clamp((longitude + 180) / 360 * width),
    y: clamp((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * width),
  };
}

async function fetchTileData(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('Не удалось загрузить данные OpenFreeMap');
  return response;
}

function createRussianNameLookup({ tileJsonUrl = 'https://tiles.openfreemap.org/planet' } = {}) {
  const cache = new Map();
  let metadata;
  let metadataExpires = 0;

  function tileMetadata() {
    if (Date.now() < metadataExpires) return metadata;
    metadataExpires = Date.now() + 10 * 60_000;
    metadata = fetchTileData(tileJsonUrl)
      .then(response => response.json())
      .then(({ tiles, maxzoom }) => {
        const template = tiles?.[0];
        if (typeof template !== 'string' || !['{z}', '{x}', '{y}'].every(token => template.includes(token)) ||
            new URL(template).origin !== new URL(tileJsonUrl).origin) {
          throw new Error('Некорректный адрес тайлов OpenFreeMap');
        }
        const zoom = Number.isInteger(maxzoom) && maxzoom >= 0 ? Math.min(14, maxzoom) : 14;
        return { template, zoom };
      })
      .catch(() => {
        metadataExpires = Date.now() + 15_000;
        return null;
      });
    return metadata;
  }

  return async ({ latitude, longitude }) => {
    const source = await tileMetadata();
    if (!source) return noRussianName;
    const { x, y } = tileCoordinates(latitude, longitude, source.zoom);
    const url = source.template.replace('{z}', source.zoom).replace('{x}', x).replace('{y}', y);
    const cached = cache.get(url);
    if (cached && cached.expires > Date.now()) return cached.lookup;

    const entry = {
      expires: Date.now() + 30 * 60_000,
      lookup: fetchTileData(url)
        .then(response => response.arrayBuffer())
        .then(buffer => indexTile(new Uint8Array(buffer)))
        .catch(() => {
          entry.expires = Date.now() + 15_000;
          return noRussianName;
        }),
    };
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(url, entry);
    return entry.lookup;
  };
}

module.exports = { createRussianNameLookup };
