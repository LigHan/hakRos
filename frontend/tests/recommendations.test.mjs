import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankRecommendations } from '../lib/recommendations.ts';

test('сортировка использует категории избранного и лайков и сохраняет исходный порядок без истории', () => {
  const places = [{ id:'1',category:'park' },{ id:'2',category:'cafe' },{ id:'3',category:'cafe' },{ id:'4',category:'park' },{ id:'5',category:'' }];
  assert.deepEqual(rankRecommendations(places, [], []).map(p => p.id), ['1','2','3','4','5']);
  assert.deepEqual(rankRecommendations(places, ['3'], []).map(p => p.id), ['2','3','1','4','5']);
  assert.deepEqual(rankRecommendations(places, ['3'], ['1','4','4']).map(p => p.id), ['1','2','3','4','5']);
  assert.deepEqual(places.map(p => p.id), ['1','2','3','4','5']);
});
