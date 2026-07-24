// Persistence layer — plain JSON files. No native modules, no compilation needed
// on any platform. The problem statement explicitly allowed a JSON-file fallback
// for the config store; the app is small enough that we don't need SQLite.
//
// Layout on disk:
//   data/config.json    — widget configuration (deep-merged over DEFAULT_CONFIG)
//   data/uploads.json   — [{id, filename, mime, size, kind, created}, ...]
//   data/counters.json  — session counters (persisted between restarts)
//
// Writes are atomic (write to .tmp, then rename), so a Ctrl+C mid-write can
// never leave a half-truncated JSON file behind.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- Atomic file store ----------
function filePath(name) { return path.join(DATA_DIR, name); }

function readJson(name, fallback) {
  const p = filePath(name);
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[db] could not read ${name}, using fallback:`, e && e.message);
    return fallback;
  }
}

function writeJson(name, value) {
  const p = filePath(name);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

// ---------- KV (used by bus.js for counters, and internally for config) ----------
function getKV(key, fallback = null) {
  if (key === 'config')   return readJson('config.json', fallback);
  if (key === 'counters') return readJson('counters.json', fallback);
  return readJson(`kv-${key}.json`, fallback);
}
function setKV(key, value) {
  if (key === 'config')   return writeJson('config.json', value);
  if (key === 'counters') return writeJson('counters.json', value);
  return writeJson(`kv-${key}.json`, value);
}

// ---------- Config defaults ----------
const DEFAULT_CONFIG = {
  connection: {
    username: process.env.TIKTOK_USERNAME || 'zxpsychojokerxz1',
    demoMode: (process.env.DEMO_MODE || 'false') === 'true',
  },
  alerts: {
    follow:     { enabled: true,  sound: '', image: '/uploads/starter-lobo-howl.webm', duration: 6000, volume: 0.8, template: 'FRESH MEAT — {username}', tts: true  },
    gift:       { enabled: true,  sound: '', image: '/uploads/starter-choked.png',  duration: 6000, volume: 0.9, template: '{username} sent {giftName} x{repeatCount} ({coins} coins)', megaThreshold: 500 },
    like:       { enabled: true,  sound: '', image: '', duration: 3500, volume: 0.6, template: '{username} smashed {likeCount} likes', milestoneEvery: 100 },
    share:      { enabled: true,  sound: '', image: '', duration: 4000, volume: 0.7, template: '{username} SHARED THE STREAM' },
    subscribe:  { enabled: true,  sound: '', image: '/uploads/starter-lobo-pose.png', duration: 6500, volume: 0.9, template: '{username} JOINED THE PACK' },
    join:       { enabled: true,  sound: '', image: '', duration: 3000, volume: 0.6, template: '{username} ENTERED THE PIT', oncePerSession: true },
  },
  chat: {
    fadeAfter: 12000,
    maxMessages: 40,
    maxLength: 180,
    profanityFilter: true,
    showAvatars: true,
    ttsComments: false,
    roleColors: { streamer: '#C8102E', mod: '#3E5F3A', gifter: '#EDBE1A', default: '#EDEDEA' },
  },
  goal: { label: 'ROAD TO 10K', start: 0, target: 10000, current: 0 },
  stats: { showViewers: true, showLikes: true, showFollowers: true },
  ticker: { speed: 60, maxItems: 20 },
};

function deepMerge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = {};
    for (const k of Object.keys(base)) out[k] = deepMerge(base[k], over ? over[k] : undefined);
    if (over && typeof over === 'object') for (const k of Object.keys(over)) if (!(k in out)) out[k] = over[k];
    return out;
  }
  return over === undefined ? base : over;
}

function loadConfig() {
  const stored = readJson('config.json', {}) || {};
  return deepMerge(DEFAULT_CONFIG, stored);
}
function saveConfig(next) {
  writeJson('config.json', next);
}

// ---------- Uploads registry ----------
function readUploads() { return readJson('uploads.json', []); }
function writeUploads(list) { writeJson('uploads.json', list); }

function registerUpload(u) {
  const list = readUploads();
  list.unshift({
    id: u.id, filename: u.filename, mime: u.mime, size: u.size, kind: u.kind,
    created: Date.now(),
  });
  writeUploads(list);
}
function listUploads() {
  return readUploads().slice().sort((a, b) => (b.created || 0) - (a.created || 0));
}
function deleteUpload(id) {
  const list = readUploads();
  const idx = list.findIndex(u => u.id === id);
  if (idx < 0) return null;
  const [removed] = list.splice(idx, 1);
  writeUploads(list);
  return removed;
}

module.exports = {
  loadConfig, saveConfig,
  getKV, setKV,
  registerUpload, listUploads, deleteUpload,
};
