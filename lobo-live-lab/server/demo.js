// Demo mode: fires randomised fake events every 3-8s through the real pipeline
// so overlays can be built and tested without a live TikTok stream.
const { v4: uuid } = require('uuid');
const bus = require('./bus');

const FAKE_USERS = [
  { username: 'ferox_fan42',   nickname: 'FeroxFan',         avatarUrl: '' },
  { username: 'raptor_queen',  nickname: 'RaptorQueen',      avatarUrl: '' },
  { username: 'chunkystego',   nickname: 'Chunky Stego',     avatarUrl: '' },
  { username: 'thepack_beta',  nickname: 'β of the Pack',    avatarUrl: '' },
  { username: 'no_mercy_lobo', nickname: 'no mercy',         avatarUrl: '' },
  { username: 'saddle_up',     nickname: 'saddle up cowboy', avatarUrl: '' },
  { username: 'crawlerbait',   nickname: 'crawler bait',     avatarUrl: '' },
];
const GIFTS = [
  { giftId: 5655, giftName: 'Rose',        diamond: 1   },
  { giftId: 5827, giftName: 'TikTok',      diamond: 5   },
  { giftId: 5487, giftName: 'Finger Heart',diamond: 5   },
  { giftId: 6221, giftName: 'Galaxy',      diamond: 1000 },
  { giftId: 5269, giftName: 'Rocket',      diamond: 500  },
  { giftId: 6242, giftName: 'Sports Car',  diamond: 7000 },
];
const COMMENTS = [
  'LFG lobo', 'you got this', 'watch the utah on your left',
  'BLOOD FOR THE PACK', 'ferox W', 'that stego is HUGE',
  'first', 'stream sniper alert', 'gg', 'raptor speedrun any%',
  'chain that carno', 'nooo not the herd', 'RIP', 'lobo the goat',
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function makeUser(u) {
  return { id: 'demo-' + u.username, username: u.username, nickname: u.nickname, avatarUrl: u.avatarUrl };
}
function baseEv(type, user, value) {
  return { v: 1, id: uuid(), type, user, value: value || {}, ts: Date.now() };
}

const generators = {
  follow: () => baseEv('follow', makeUser(rand(FAKE_USERS)), {}),
  gift:   () => {
    const g = rand(GIFTS);
    const rc = 1 + Math.floor(Math.random() * (g.diamond >= 500 ? 3 : 15));
    return baseEv('gift', makeUser(rand(FAKE_USERS)), {
      giftId: g.giftId, giftName: g.giftName, repeatCount: rc,
      coins: g.diamond * rc, diamondCount: g.diamond,
    });
  },
  like:   () => baseEv('like', makeUser(rand(FAKE_USERS)), { likeCount: 5 + Math.floor(Math.random()*40), totalLikeCount: 10000 + Math.floor(Math.random()*90000) }),
  share:  () => baseEv('share', makeUser(rand(FAKE_USERS)), {}),
  subscribe: () => baseEv('subscribe', makeUser(rand(FAKE_USERS)), { subMonth: 1 }),
  comment: () => baseEv('comment', makeUser(rand(FAKE_USERS)), { comment: rand(COMMENTS) }),
  join:    () => baseEv('join', makeUser(rand(FAKE_USERS)), {}),
  viewers: () => baseEv('viewers', { id:'', username:'', nickname:'', avatarUrl:'' }, { viewerCount: 100 + Math.floor(Math.random()*4000) }),
};

let timer = null;
let running = false;

function tick() {
  if (!running) return;
  // Weighted pick: comments most common, gifts and follows less
  const roll = Math.random();
  let type;
  if      (roll < 0.35) type = 'comment';
  else if (roll < 0.55) type = 'like';
  else if (roll < 0.70) type = 'follow';
  else if (roll < 0.82) type = 'gift';
  else if (roll < 0.88) type = 'share';
  else if (roll < 0.92) type = 'subscribe';
  else if (roll < 0.98) type = 'join';
  else                  type = 'viewers';

  const ev = generators[type]();
  bus.publish(ev);

  const nextMs = 3000 + Math.floor(Math.random() * 5000);
  timer = setTimeout(tick, nextMs);
}

function start() {
  if (running) return;
  running = true;
  // fire an initial burst
  bus.publish(generators.viewers());
  tick();
}
function stop() {
  running = false;
  clearTimeout(timer);
  timer = null;
}
function isRunning() { return running; }

// Fire a single fake event of a chosen type (used by dashboard test buttons)
function fire(type) {
  const fn = generators[type];
  if (!fn) return null;
  const ev = fn();
  bus.publish(ev);
  return ev;
}

module.exports = { start, stop, isRunning, fire };
