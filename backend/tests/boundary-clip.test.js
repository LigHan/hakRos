'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('../map-assets/boundary-clip');
const mask = { type: 'Polygon', coordinates: [[[0,0],[2,0],[2,2],[0,2],[0,0]]] };
const clip = build(mask).clip;

test('сохраняет внешние части длинной границы, пересекающей маску', () => {
  assert.deepEqual(clip({ type:'LineString', coordinates:[[-5,1],[5,1]] }), {
    affected:true, coordinates:[[[-5,1],[0,1]],[[2,1],[5,1]]],
  });
});
test('разделяет региональную границу на повышаемый и исходные участки', () => {
  const result = build(mask).split({type:'LineString',coordinates:[[-1,1],[1,1],[3,1]]});
  assert.equal(result.affected, true);
  assert.deepEqual(result.inside, [[[0,1],[1,1],[2,1]]]);
  assert.deepEqual(result.outside, [[[-1,1],[0,1]],[[2,1],[3,1]]]);
});
test('не удаляет соседние границы, объединённые в одном объекте', () => {
  const result = clip({ type:'MultiLineString', coordinates:[[[-1,1],[3,1]],[[10,10],[20,20]]] });
  assert.equal(result.affected, true);
  assert.ok(result.coordinates.some(line => JSON.stringify(line) === JSON.stringify([[10,10],[20,20]])));
});
test('оставляет внешние объекты поставщику и удаляет внутренние', () => {
  assert.equal(clip({type:'LineString',coordinates:[[5,5],[6,6]]}).affected, false);
  assert.deepEqual(clip({type:'LineString',coordinates:[[0.5,0.5],[1.5,1.5]]}), {affected:true,coordinates:[]});
});
test('учитывает отверстия и несколько полигонов', () => {
  const area={type:'MultiPolygon',coordinates:[[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]]],[[[10,0],[12,0],[12,2],[10,2],[10,0]]]]};
  const result=build(area).clip({type:'LineString',coordinates:[[-1,1.5],[13,1.5]]});
  assert.equal(result.affected,true);
  const near = (a,b) => Math.abs(a-b) < 1e-9;
  assert.ok(result.coordinates.some(line => near(line[0][0],1) && near(line.at(-1)[0],3)));
  assert.ok(result.coordinates.some(line => near(line[0][0],4) && near(line.at(-1)[0],10)));
});
