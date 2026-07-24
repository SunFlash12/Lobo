// Event bus: rolling log (last 500), broadcast to Socket.IO rooms and dashboard.
// Also feeds outbound webhook and demo-mode injection.
// Counters are persisted to SQLite (debounced) so they survive restarts.
const EventEmitter = require('events');
const webhook = require('./webhook');
const db = require('./db');

const MAX_LOG = 500;
const DEFAULT_COUNTERS = { followers: 0, sessionLikes: 0, viewers: 0, peakViewers: 0, giftCoins: 0, commentCount: 0 };
const PERSIST_KEY = 'counters';
const PERSIST_DEBOUNCE_MS = 1000;

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.log = [];
    this.io = null;
    // Hydrate persisted counters (viewers is always a live snapshot; not restored)
    const stored = db.getKV(PERSIST_KEY, {}) || {};
    this.counters = { ...DEFAULT_COUNTERS, ...stored, viewers: 0 };
    this._persistTimer = null;
  }

  attachIO(io) { this.io = io; }

  publish(ev) {
    // Update counters
    if (ev.type === 'follow')    this.counters.followers += 1;
    if (ev.type === 'like')      this.counters.sessionLikes += (ev.value.likeCount || 1);
    if (ev.type === 'comment')   this.counters.commentCount += 1;
    if (ev.type === 'gift')      this.counters.giftCoins += (ev.value.coins || 0);
    if (ev.type === 'viewers') {
      this.counters.viewers = ev.value.viewerCount || 0;
      if (this.counters.viewers > (this.counters.peakViewers || 0)) {
        this.counters.peakViewers = this.counters.viewers;
        this._schedulePersist(); // peaks are worth keeping across restarts
      }
    }

    // Push to rolling log
    this.log.push(ev);
    if (this.log.length > MAX_LOG) this.log.shift();

    // Fire local listeners (e.g. tiktok status listeners)
    this.emit('event', ev);

    // Broadcast to overlays
    if (this.io) {
      this.io.to('overlays').emit('event', ev);
      this.io.to('dashboard').emit('event', ev);
      this.io.to('overlays').emit('counters', this.counters);
      this.io.to('dashboard').emit('counters', this.counters);
    }

    // Persist (skip pure viewer updates — they'd write on every heartbeat)
    if (ev.type !== 'viewers') this._schedulePersist();

    // Outbound webhook (fire-and-forget)
    webhook.dispatch(ev).catch(() => {});
  }

  getLog(limit = 100) {
    return this.log.slice(-limit);
  }

  getCounters() { return this.counters; }

  resetCounters() {
    this.counters = { ...DEFAULT_COUNTERS };
    this._persistNow();
    if (this.io) {
      this.io.to('overlays').emit('counters', this.counters);
      this.io.to('dashboard').emit('counters', this.counters);
    }
  }

  _schedulePersist() {
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this._persistNow();
    }, PERSIST_DEBOUNCE_MS);
    // Never hold Node's event loop open just for this
    if (this._persistTimer.unref) this._persistTimer.unref();
  }

  _persistNow() {
    // Persist everything except viewers (live snapshot, not meaningful across restarts)
    const { viewers: _v, ...rest } = this.counters;
    try { db.setKV(PERSIST_KEY, rest); } catch (_e) { /* ignore */ }
  }
}

module.exports = new EventBus();
