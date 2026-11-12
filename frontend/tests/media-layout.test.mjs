import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampMediaWidth, imageFrameHeight, videoFrameHeight } from '../lib/media-layout.ts';

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

test('post photos use the card width and limit oversized portrait images', () => {
  assert.equal(imageFrameHeight(368, 3 / 4, 330), 330);
  assert.equal(imageFrameHeight(320, 16 / 9, 330), 180);
  assert.equal(imageFrameHeight(320, 4 / 5, 460), 400);
  assert.equal(imageFrameHeight(320, 0, 330), 0);
});
