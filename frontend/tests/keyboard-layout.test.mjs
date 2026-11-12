import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyboardBottomInset, keyboardScrollDelta } from '../lib/keyboard-layout.ts';

test('overlay ends above the keyboard and returns to its original position on hide', () => {
  assert.equal(keyboardBottomInset(844, 510, 334), 334);
  assert.equal(keyboardBottomInset(844, 844, 0), 0);
  assert.equal(keyboardBottomInset(844, 0, 320), 320);
  assert.equal(keyboardBottomInset(844, Number.NaN, 320), 0);
});

test('only hidden input moves, accounting for both viewport and keyboard boundaries', () => {
  assert.equal(keyboardScrollDelta(700, 800, 500), 212);
  assert.equal(keyboardScrollDelta(470, 490, 500), 0);
  assert.equal(keyboardScrollDelta(490, 470, 500), 32);
  assert.equal(keyboardScrollDelta(Number.NaN, 470, 500), 0);
});
