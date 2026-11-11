import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSubscribedPlaces } from '../lib/connections-feed.ts';

const posts = [{ id: '1', userHandle: 'shared' }, { id: '2', userHandle: 'shared' }, { id: '3' }];
const stories = [{ id: 'a', postId: '1' }, { id: 'b', postId: '2' }, { id: 'c', postId: '3' }];

test('selects only the exact subscribed place IDs, not matching names or handles', () => {
  const result = selectSubscribedPlaces(posts, stories, { friends: [], subscriptions: [{ placeId: '2' }] });
  assert.deepEqual(result.posts.map(item => item.id), ['2']);
  assert.deepEqual(result.stories.map(item => item.id), ['b']);
});

test('empty subscriptions produce an empty feed and friends do not add unrelated places', () => {
  const result = selectSubscribedPlaces(posts, stories, { friends: [{ id: '1', name: 'Друг' }], subscriptions: [] });
  assert.deepEqual(result, { posts: [], stories: [] });
});

test('does not change source lists and keeps their order', () => {
  const result = selectSubscribedPlaces(posts, stories, { friends: [], subscriptions: [{ placeId: '3' }, { placeId: '1' }] });
  assert.deepEqual(result.posts.map(item => item.id), ['1', '3']);
  assert.deepEqual(result.stories.map(item => item.id), ['a', 'c']);
  assert.equal(posts.length, 3);
  assert.equal(stories.length, 3);
});
