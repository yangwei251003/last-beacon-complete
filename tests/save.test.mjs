import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProgress, saveProgress, loadSession, saveSession, clearSession, getSettings, setSettings, getStorageStatus } from '../src/save.js';
const data = new Map();
globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
test('progress normalizes malformed fields and writes versioned data', () => {
  assert.equal(saveProgress({ unlocked: 99, completed: [1, 1, -1, '2', 3], best: { 1: 100, 2: -5, 3: Infinity } }), true);
  assert.deepEqual(loadProgress(), { unlocked: 8, completed: [1, 3], best: { 1: 100 } });
  assert.equal(JSON.parse(data.get('last-beacon-complete:progress')).version, 2);
});
test('v1 data migrates without losing valid progression', () => {
  data.set('last-beacon-complete:progress', JSON.stringify({ version: 1, payload: { unlocked: 4, completed: [1, 2, 3], best: {} } }));
  assert.equal(loadProgress().unlocked, 4);
});
test('campaign IDs are zero through seven while unlocked is a count', () => {
  saveProgress({ unlocked: 8, completed: [0, 7, 8, 99], best: { 0: 10, 7: 70, 8: 80 } });
  assert.deepEqual(loadProgress(), { unlocked: 8, completed: [0, 7], best: { 0: 10, 7: 70 } });
});
test('unversioned settings migrate and unsupported session versions are rejected', () => {
  data.set('last-beacon-complete:settings', JSON.stringify({ difficulty: 'easy', volume: 0.25, muted: false }));
  assert.deepEqual(getSettings(), { difficulty: 'easy', volume: 0.25, muted: false });
  data.set('last-beacon-complete:session', JSON.stringify({ version: 99, data: { wave: 2 } }));
  assert.equal(loadSession(), null);
});
test('corrupt and future data fall back safely', () => {
  data.set('last-beacon-complete:session', '{broken');
  assert.equal(loadSession(), null);
  data.set('last-beacon-complete:progress', JSON.stringify({ version: 500, data: { unlocked: 8 } }));
  assert.equal(loadProgress().unlocked, 1);
});
test('session preserves nested numeric game state and clears', () => {
  const snapshot = { level: 2, towers: [{ id: 't1', charge: 45.2 }], paused: true };
  assert.equal(saveSession(snapshot), true);
  assert.deepEqual(loadSession(), snapshot);
  assert.equal(clearSession(), true);
  assert.equal(loadSession(), null);
  assert.equal(saveSession(null), false);
});
test('settings merge, sanitize and retain independent volume/mute', () => {
  setSettings({ difficulty: 'hard', volume: 0.3 });
  setSettings({ muted: true });
  assert.deepEqual(getSettings(), { difficulty: 'hard', volume: 0.3, muted: true });
  setSettings({ volume: 10, difficulty: 'impossible' });
  assert.equal(getSettings().volume, 1);
  assert.equal(getSettings().difficulty, 'normal');
});
test('storage denial and quota failure never interrupt play', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('denied'); } };
  assert.equal(loadSession(), null);
  assert.equal(saveSession({ wave: 1 }), false);
  assert.equal(clearSession(), false);
  assert.equal(getStorageStatus().available, false);
  globalThis.localStorage = original;
});
