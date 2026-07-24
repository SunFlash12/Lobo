// Wraps tiktok-live-connector v2 with exponential-backoff reconnects and a plain-language
// status surface for the dashboard. Fails gracefully (unofficial lib can and will break).
const { handleRaw } = require('./normalizer');
const bus = require('./bus');

let TikTokLiveConnection = null;
let WebcastEvent = null;
let ControlEvent = null;
try {
  const lib = require('tiktok-live-connector');
  TikTokLiveConnection = lib.TikTokLiveConnection;
  WebcastEvent = lib.WebcastEvent;
  ControlEvent = lib.ControlEvent;
} catch (e) {
  console.warn('[tiktok] tiktok-live-connector not available:', e && e.message);
}

class TikTokManager {
  constructor() {
    this.conn = null;
    this.username = null;
    this.status = { state: 'idle', message: 'Not connected.', since: Date.now(), username: null, roomId: null };
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.stopped = true;
    // Signal check: raw events received from TikTok this session (per type)
    this.eventCounts = {};
    this.lastEventAt = null;
    this._signalTimer = null;
  }

  _countEvent(tag) {
    this.eventCounts[tag] = (this.eventCounts[tag] || 0) + 1;
    this.lastEventAt = Date.now();
    // Throttled push so the dashboard "Signal check" stays live without spam
    if (this._signalTimer) return;
    this._signalTimer = setTimeout(() => {
      this._signalTimer = null;
      if (bus.io) bus.io.to('dashboard').emit('signal', this.getSignal());
    }, 2000);
    if (this._signalTimer.unref) this._signalTimer.unref();
  }

  getSignal() {
    return { events: this.eventCounts, lastEventAt: this.lastEventAt };
  }

  setStatus(state, message, extra = {}) {
    this.status = { state, message, since: Date.now(), username: this.username, ...extra };
    bus.emit('status', this.status);
    if (bus.io) {
      bus.io.to('dashboard').emit('status', this.status);
      bus.io.to('overlays').emit('status', this.status);
    }
  }

  async connect(username) {
    if (!TikTokLiveConnection) {
      this.setStatus('error', 'tiktok-live-connector not available. Run npm install.');
      return;
    }
    this.stop(); // clear existing
    this.stopped = false;
    this.eventCounts = {};
    this.lastEventAt = null;
    this.username = (username || '').replace(/^@/, '').trim();
    if (!this.username) {
      this.setStatus('error', 'No TikTok username set. Enter one in the dashboard.');
      return;
    }
    this._attempt();
  }

  async _attempt() {
    if (this.stopped) return;
    this._loggedErrorThisAttempt = false;
    this.setStatus('connecting', `Connecting to @${this.username}…`);
    const opts = { fetchRoomInfoOnConnect: true, processInitialData: false };
    if (process.env.SIGN_API_KEY) opts.signApiKey = process.env.SIGN_API_KEY;

    try {
      this.conn = new TikTokLiveConnection(this.username, opts);
    } catch (e) {
      return this._scheduleReconnect(`Failed to init connector: ${e && e.message}`);
    }

    // Wire message events -> normaliser -> bus
    const seenTypes = new Set(); // diagnostic: log first event of each type per attempt
    const wire = (evName, tag) => {
      try {
        this.conn.on(evName, (data) => {
          if (!seenTypes.has(tag)) {
            seenTypes.add(tag);
            console.log(`[tiktok] receiving '${tag}' events from @${this.username}`);
          }
          this._countEvent(tag);
          handleRaw(tag, data, (ev) => bus.publish(ev));
        });
      } catch (_e) { /* ignore */ }
    };
    wire(WebcastEvent ? WebcastEvent.CHAT      : 'chat',      'chat');
    wire(WebcastEvent ? WebcastEvent.LIKE      : 'like',      'like');
    wire(WebcastEvent ? WebcastEvent.SOCIAL    : 'social',    'social');
    wire(WebcastEvent ? WebcastEvent.FOLLOW    : 'follow',    'follow');
    wire(WebcastEvent ? WebcastEvent.SHARE     : 'share',     'share');
    wire(WebcastEvent ? WebcastEvent.MEMBER    : 'member',    'member');
    wire(WebcastEvent ? WebcastEvent.GIFT      : 'gift',      'gift');
    wire(WebcastEvent ? WebcastEvent.STREAM_END: 'streamEnd', 'streamEnd');
    try { this.conn.on(WebcastEvent ? WebcastEvent.SUB_NOTIFY : 'subNotify', (d) => { this._countEvent('subscribe'); handleRaw('subscribe', d, (ev) => bus.publish(ev)); }); } catch (_e) { /* ignore */ }
    try {
      this.conn.on(WebcastEvent ? WebcastEvent.ROOM_USER : 'roomUser', (data) => {
        this._countEvent('viewers');
        // v3 proto renamed viewerCount -> total (string); keep legacy fallbacks
        const viewers = Number(data && (data.total != null ? data.total : (data.viewerCount != null ? data.viewerCount : data.totalUser))) || 0;
        bus.publish({
          v: 1, id: 'rv-' + Date.now(), type: 'viewers',
          user: { id: '', username: '', nickname: '', avatarUrl: '' },
          value: { viewerCount: viewers },
          ts: Date.now(),
        });
      });
    } catch (_e) { /* ignore */ }

    // Control events
    try {
      this.conn.on(ControlEvent ? ControlEvent.DISCONNECTED : 'disconnected', () => {
        if (this.stopped) return;
        this._scheduleReconnect('Disconnected from TikTok LIVE.');
      });
    } catch (_e) { /* ignore */ }
    try {
      this.conn.on(ControlEvent ? ControlEvent.ERROR : 'error', (payload) => {
        // Errors are already surfaced via _scheduleReconnect() and the status pill.
        // Only log the first one per attempt to avoid spamming the console.
        if (this._loggedErrorThisAttempt) return;
        this._loggedErrorThisAttempt = true;
        const msg = (payload && payload.exception && payload.exception.message) || (payload && payload.info) || 'unknown';
        console.warn('[tiktok] error:', msg);
      });
    } catch (_e) { /* ignore */ }

    try {
      const state = await this.conn.connect();
      this.reconnectAttempts = 0;
      this.setStatus('live', `Connected to @${this.username}.`, { roomId: state && state.roomId });
      // Emit synthetic streamStart
      bus.publish({
        v: 1, id: 'ss-' + Date.now(), type: 'streamStart',
        user: { id: '', username: '', nickname: '', avatarUrl: '' },
        value: { roomId: state && state.roomId }, ts: Date.now(),
      });
    } catch (err) {
      const msg = (err && err.message) || String(err);
      const name = (err && err.name) || '';
      const blob = `${name} ${msg}`;
      let human = msg;
      if (/UserOffline|user.*offline|not.*live|LIVE has ended/i.test(blob)) {
        human = `@${this.username} is not live right now. Will keep checking.`;
      } else if (/Room ID|fetch-room-id|retrieve Room ID/i.test(blob)) {
        // Most common cause: user isn't live; second most common: TikTok temporarily
        // blocked our unsigned request. Tell the streamer both possibilities.
        human = process.env.SIGN_API_KEY
          ? `Couldn't find @${this.username}'s room. They probably aren't live yet.`
          : `Couldn't find @${this.username}'s room. Either they aren't live yet, or TikTok blocked our request. If it keeps failing while you know you're live, set SIGN_API_KEY (Euler Stream) in .env.`;
      } else if (/RATE_LIMIT|rate.?limit|429/i.test(blob)) {
        human = 'TikTok is rate-limiting us. Retrying with backoff.';
      } else if (/SignAPI|sign|challenge|captcha|SIGN_NOT_200/i.test(blob)) {
        human = 'TikTok signing failed. Set SIGN_API_KEY (from eulerstream.com) in .env for a stable connection.';
      }
      this._scheduleReconnect(human);
    }
  }

  _scheduleReconnect(reason) {
    this.reconnectAttempts += 1;
    const delay = Math.min(60_000, 2000 * Math.pow(1.6, Math.min(this.reconnectAttempts, 10)));
    this.setStatus('reconnecting', `${reason} Retrying in ${Math.round(delay/1000)}s.`);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this._attempt(), delay);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.conn) {
      try { this.conn.disconnect(); } catch (_e) { /* ignore */ }
      this.conn = null;
    }
    this.setStatus('idle', 'Disconnected.');
  }
}

module.exports = new TikTokManager();
