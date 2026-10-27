// Local-only persistence. Gameplay snapshots are validated by the simulation on restore.
const VERSION = 2;
const PREFIX = 'last-beacon-complete:';
let status = { available: true, error: null };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const freshProgress = () => ({ unlocked: 1, completed: [], best: {} });
const freshSettings = () => ({ difficulty: 'normal', volume: 0.55, muted: false });
function fail(error) { status = { available: false, error: String(error?.message || error) }; }
function store() { if (!globalThis.localStorage) throw new Error('本地存储不可用'); return globalThis.localStorage; }
function read(key) {
  try {
    const raw = store().getItem(PREFIX + key);
    if (raw === null) return null;
    if (raw.length > 4000000) throw new Error('存档过大');
    const parsed = JSON.parse(raw);
    if (!plain(parsed)) throw new Error('存档格式损坏');
    if (parsed.version === VERSION || parsed.version === 1) return parsed.data ?? parsed.payload ?? null;
    if (parsed.version === undefined && key !== 'session') return parsed;
    throw new Error('存档版本不兼容');
  } catch (error) { fail(error); return null; }
}
function write(key, data) {
  try {
    const raw = JSON.stringify({ version: VERSION, savedAt: Date.now(), data });
    if (raw.length > 4000000) throw new Error('存档过大');
    store().setItem(PREFIX + key, raw);
    status = { available: true, error: null };
    return true;
  } catch (error) { fail(error); return false; }
}
function progress(value) {
  if (!plain(value)) return freshProgress();
  const completed = [...new Set((Array.isArray(value.completed) ? value.completed : []).filter(n => Number.isInteger(n) && n >= 0 && n <= 7))];
  const best = {};
  if (plain(value.best)) for (const [key, score] of Object.entries(value.best)) {
    if (/^[0-7]$/.test(key) && Number.isFinite(score) && score >= 0) best[key] = score;
  }
  const unlocked = Number.isInteger(value.unlocked) ? Math.max(1, Math.min(8, value.unlocked)) : 1;
  return { unlocked, completed, best };
}
function settings(value) {
  const defaults = freshSettings();
  if (!plain(value)) return defaults;
  return {
    difficulty: ['easy', 'normal', 'hard'].includes(value.difficulty) ? value.difficulty : defaults.difficulty,
    volume: Number.isFinite(value.volume) ? Math.max(0, Math.min(1, value.volume)) : defaults.volume,
    muted: typeof value.muted === 'boolean' ? value.muted : defaults.muted,
  };
}
export function loadProgress() { return progress(read('progress')); }
export function saveProgress(value) { return write('progress', progress(value)); }
export function getSettings() { return settings(read('settings')); }
export function setSettings(value) { return write('settings', settings({ ...getSettings(), ...value })); }
export function loadSession() { const value = read('session'); return plain(value) ? value : null; }
export function saveSession(snapshot) {
  if (!plain(snapshot)) { fail('无效游戏快照'); return false; }
  return write('session', snapshot);
}
export function clearSession() {
  try { store().removeItem(PREFIX + 'session'); return true; }
  catch (error) { fail(error); return false; }
}
export function getStorageStatus() { return { ...status }; }
