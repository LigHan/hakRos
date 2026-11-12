import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampMediaWidth, videoFrameHeight } from '../lib/media-layout.ts';

test('video frames remain within screen edges even when a native view measures too wide', () => {
  assert.equal(clampMediaWidth(960, 36, 390), 354);
  assert.equal(clampMediaWidth(248, 36, 320), 248);
  assert.equal(clampMediaWidth(100, 410, 390), 0);
  assert.equal(clampMediaWidth(Number.NaN, 0, 390), 0);
});

test('portrait video height is capped while landscape video keeps its aspect', () => {
  assert.equal(videoFrameHeight(320, 16 / 9, 844), 180);
  assert.equal(videoFrameHeight(320, 9 / 16, 640), 396.8);
  assert.equal(videoFrameHeight(0, 1, 640), 0);
});
