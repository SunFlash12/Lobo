const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'config.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS uploads (
    id        TEXT PRIMARY KEY,
    filename  TEXT NOT NULL,
    mime      TEXT NOT NULL,
    size      INTEGER NOT NULL,
    kind      TEXT NOT NULL,
    created   INTEGER NOT NULL
  );
`);

const getStmt = db.prepare('SELECT value FROM kv WHERE key = ?');
const setStmt = db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

function getKV(key, fallback = null) {
  const row = getStmt.get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}
function setKV(key, value) {
  setStmt.run(key, JSON.stringify(value));
}

// ---------- Config defaults ----------
const DEFAULT_CONFIG = {
  connection: {
    username: process.env.TIKTOK_USERNAME || 'lobothemainman',
    demoMode: (process.env.DEMO_MODE || 'false') === 'true',
  },
  alerts: {
    follow:     { enabled: true,  sound: '', image: '', duration: 5000, volume: 0.8, template: 'FRESH MEAT — {username}', tts: true  },
    gift:       { enabled: true,  sound: '', image: '', duration: 6000, volume: 0.9, template: '{username} sent {giftName} x{repeatCount} ({coins} coins)', megaThreshold: 500 },
    like:       { enabled: true,  sound: '', image: '', duration: 3500, volume: 0.6, template: '{username} smashed {likeCount} likes', milestoneEvery: 100 },
    share:      { enabled: true,  sound: '', image: '', duration: 4000, volume: 0.7, template: '{username} SHARED THE STREAM' },
    subscribe:  { enabled: true,  sound: '', image: '', duration: 6500, volume: 0.9, template: '{username} JOINED THE PACK' },
  },
  chat: {
    fadeAfter: 12000,
    maxMessages: 40,
    maxLength: 180,
    profanityFilter: true,
    showAvatars: true,
    roleColors: { streamer: '#C8102E', mod: '#3E5F3A', gifter: '#EDBE1A', default: '#EDEDEA' },
  },
  goal: {
    label: 'ROAD TO 10K',
    start: 0,
    target: 10000,
    current: 0,
  },
  stats: {
    showViewers: true,
    showLikes: true,
    showFollowers: true,
  },
  ticker: {
    speed: 60,
    maxItems: 20,
  },
};

function loadConfig() {
  const stored = getKV('config', {});
  return deepMerge(DEFAULT_CONFIG, stored);
}
function saveConfig(next) {
  setKV('config', next);
}
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

// ---------- Uploads registry ----------
const insertUpload = db.prepare('INSERT INTO uploads (id, filename, mime, size, kind, created) VALUES (?, ?, ?, ?, ?, ?)');
const listUploadsStmt = db.prepare('SELECT * FROM uploads ORDER BY created DESC');
const deleteUploadStmt = db.prepare('DELETE FROM uploads WHERE id = ?');
const getUploadStmt = db.prepare('SELECT * FROM uploads WHERE id = ?');

module.exports = {
  db,
  loadConfig,
  saveConfig,
  getKV,
  setKV,
  registerUpload(u) { insertUpload.run(u.id, u.filename, u.mime, u.size, u.kind, Date.now()); },
  listUploads()    { return listUploadsStmt.all(); },
  deleteUpload(id) {
    const row = getUploadStmt.get(id);
    if (row) deleteUploadStmt.run(id);
    return row;
  },
};
