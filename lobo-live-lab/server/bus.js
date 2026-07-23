// Event bus: rolling log (last 500), broadcast to Socket.IO rooms and dashboard.
// Also feeds outbound webhook and demo-mode injection.
const EventEmitter = require('events');
const webhook = require('./webhook');

const MAX_LOG = 500;

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.log = [];
    this.io = null;
    this.counters = {
      followers: 0,       // cumulative follow events observed this session
      sessionLikes: 0,    // sum of like counts this session
      viewers: 0,         // latest viewer count from tiktok
      giftCoins: 0,       // total coins this session
      commentCount: 0,
    };
  }

  attachIO(io) { this.io = io; }

  publish(ev) {
    // Update counters
    if (ev.type === 'follow')    this.counters.followers += 1;
    if (ev.type === 'like')      this.counters.sessionLikes += (ev.value.likeCount || 1);
    if (ev.type === 'comment')   this.counters.commentCount += 1;
    if (ev.type === 'gift')      this.counters.giftCoins += (ev.value.coins || 0);
    if (ev.type === 'viewers')   this.counters.viewers = ev.value.viewerCount || 0;

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

    // Outbound webhook (fire-and-forget)
    webhook.dispatch(ev).catch(() => {});
  }

  getLog(limit = 100) {
    return this.log.slice(-limit);
  }

  getCounters() { return this.counters; }

  resetCounters() {
    this.counters = { followers: 0, sessionLikes: 0, viewers: 0, giftCoins: 0, commentCount: 0 };
    if (this.io) {
      this.io.to('overlays').emit('counters', this.counters);
      this.io.to('dashboard').emit('counters', this.counters);
    }
  }
}

module.exports = new EventBus();
