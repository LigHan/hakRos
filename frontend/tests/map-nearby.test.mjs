import assert from 'node:assert/strict';
import { test } from 'node:test';

import { highlightNearbySubscriptions } from '../lib/map-nearby.ts';

const position = { latitude: 0, longitude: 0 };
const nearby = { id: 'nearby', name: 'Рядом', latitude: 0, longitude: 0.00269, isSubscribed: true };
const ordinary = { ...nearby, id: 'ordinary', isSubscribed: false };
const distant = { ...nearby, id: 'distant', longitude: 0.00270 };
const places = [nearby, ordinary, distant];

test('highlights only subscribed places within 300 metres', () => {
  const result = highlightNearbySubscriptions(places, position);
  assert.deepEqual(result, [{ ...nearby, nearbySubscription: true }, ordinary, distant]);
  assert.equal(Object.hasOwn(nearby, 'nearbySubscription'), false);
});

test('removes highlighting when moving away, losing the position, or unsubscribing', () => {
  assert.deepEqual(highlightNearbySubscriptions([nearby], { ...position, longitude: -0.003 }), [nearby]);
  assert.deepEqual(highlightNearbySubscriptions(places, null), places);
  assert.deepEqual(highlightNearbySubscriptions([{ ...nearby, isSubscribed: false }], position),
    [{ ...nearby, isSubscribed: false }]);
});
