'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildTrack, sampleTrack } = require('../map-assets/route-playback');

test('Симуляция проходит поворот по длинам участков и не пропускает конечную точку', () => {
  const track = buildTrack([[0, 0], [0, 0], [0.01, 0], [0.01, 0.02]]);
  const firstPart = sampleTrack(track, 1 / 6);
  assert.ok(Math.abs(firstPart.position[0] - 0.005) < 1e-6);
  assert.equal(firstPart.position[1], 0);
  assert.equal(firstPart.bearing, 90);

  const secondPart = sampleTrack(track, 2 / 3);
  assert.equal(secondPart.position[0], 0.01);
  assert.ok(Math.abs(secondPart.position[1] - 0.01) < 1e-6);
  assert.equal(secondPart.bearing, 0);
  assert.deepEqual(sampleTrack(track, 1.1).position, [0.01, 0.02]);
});

test('Совпадающие точки дают неподвижный маркер без деления на ноль', () => {
  const track = buildTrack([[37.8, 48], [37.8, 48]]);
  assert.deepEqual(sampleTrack(track, 0.5), { position: [37.8, 48], bearing: 0 });
});
