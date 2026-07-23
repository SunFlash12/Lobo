// Direct unit tests for server/normalizer.js — the file that was refactored.
// Exercises every handler in the dispatch table with realistic v2 payloads.
// Run: node tests/normalizer.test.js
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { handleRaw, makeEvent, dedupe } = require('../server/normalizer');

// Helper: collect emitted events into an array
function collector() {
  const out = [];
  return { emit: (ev) => out.push(ev), out };
}

// Typical v2 user payload shape
function fakeUser(overrides = {}) {
  return {
    userId: '12345',
    uniqueId: 'raptor_queen',
    nickname: 'Raptor Queen',
    profilePicture: { url: 'https://example.com/a.jpg' },
    ...overrides,
  };
}

test('chat event → comment with clamped text and user mapped', () => {
  const c = collector();
  handleRaw('chat', { user: fakeUser(), comment: 'hello there' }, c.emit);
  assert.equal(c.out.length, 1);
  const ev = c.out[0];
  assert.equal(ev.type, 'comment');
  assert.equal(ev.v, 1);
  assert.equal(ev.user.username, 'raptor_queen');
  assert.equal(ev.user.nickname, 'Raptor Queen');
  assert.equal(ev.user.avatarUrl, 'https://example.com/a.jpg');
  assert.equal(ev.value.comment, 'hello there');
  assert.ok(ev.id);
});

test('chat comment is clamped to MAX_COMMENT_LENGTH (500)', () => {
  const c = collector();
  handleRaw('chat', { user: fakeUser(), comment: 'x'.repeat(1000) }, c.emit);
  assert.equal(c.out[0].value.comment.length, 500);
});

test('like event carries counts', () => {
  const c = collector();
  handleRaw('like', { user: fakeUser(), likeCount: 12, totalLikeCount: 3456 }, c.emit);
  assert.equal(c.out[0].type, 'like');
  assert.equal(c.out[0].value.likeCount, 12);
  assert.equal(c.out[0].value.totalLikeCount, 3456);
});

test('social with action=follow → follow event', () => {
  const c = collector();
  handleRaw('social', { user: fakeUser(), action: 'live_room_follow_event' }, c.emit);
  assert.equal(c.out[0].type, 'follow');
});

test('social with action=share → share event', () => {
  const c = collector();
  handleRaw('social', { user: fakeUser(), action: 'live_room_share_event' }, c.emit);
  assert.equal(c.out[0].type, 'share');
});

test('social with unknown action → social event with action passthrough', () => {
  const c = collector();
  handleRaw('social', { user: fakeUser(), action: 'live_room_something' }, c.emit);
  assert.equal(c.out[0].type, 'social');
  assert.equal(c.out[0].value.action, 'live_room_something');
});

test('follow event (direct)', () => {
  const c = collector();
  handleRaw('follow', { user: fakeUser() }, c.emit);
  assert.equal(c.out[0].type, 'follow');
});

test('share event (direct)', () => {
  const c = collector();
  handleRaw('share', { user: fakeUser() }, c.emit);
  assert.equal(c.out[0].type, 'share');
});

test('member event → join', () => {
  const c = collector();
  handleRaw('member', { user: fakeUser() }, c.emit);
  assert.equal(c.out[0].type, 'join');
});

test('subscribe carries subMonth', () => {
  const c = collector();
  handleRaw('subscribe', { user: fakeUser(), subMonth: 3 }, c.emit);
  assert.equal(c.out[0].type, 'subscribe');
  assert.equal(c.out[0].value.subMonth, 3);
});

test('non-streakable gift (giftType != 1) fires immediately', () => {
  const c = collector();
  handleRaw('gift', {
    user: fakeUser(),
    giftId: 42,
    repeatCount: 1,
    repeatEnd: true,
    giftDetails: { giftType: 2, giftName: 'Galaxy', diamondCount: 1000 },
  }, c.emit);
  assert.equal(c.out.length, 1);
  assert.equal(c.out[0].type, 'gift');
  assert.equal(c.out[0].value.giftName, 'Galaxy');
  assert.equal(c.out[0].value.coins, 1000);
});

test('streakable gift (giftType=1) buffers until repeatEnd, single fire', () => {
  const c = collector();
  const base = {
    user: fakeUser({ userId: '999' }),
    giftId: 7,
    giftDetails: { giftType: 1, giftName: 'Rose', diamondCount: 1 },
  };
  handleRaw('gift', { ...base, repeatCount: 1, repeatEnd: false }, c.emit);
  handleRaw('gift', { ...base, repeatCount: 2, repeatEnd: false }, c.emit);
  handleRaw('gift', { ...base, repeatCount: 5, repeatEnd: false }, c.emit);
  assert.equal(c.out.length, 0, 'no emission during streak');
  handleRaw('gift', { ...base, repeatCount: 5, repeatEnd: true }, c.emit);
  assert.equal(c.out.length, 1, 'one emission on repeatEnd');
  assert.equal(c.out[0].value.repeatCount, 5);
  assert.equal(c.out[0].value.coins, 5);
  assert.equal(c.out[0].value.giftName, 'Rose');
});

test('streamEnd → streamEnd event', () => {
  const c = collector();
  handleRaw('streamEnd', { actionId: 3 }, c.emit);
  assert.equal(c.out[0].type, 'streamEnd');
  assert.equal(c.out[0].value.reason, 3);
});

test('connected → streamStart with roomId', () => {
  const c = collector();
  handleRaw('connected', { roomId: 'r-abc' }, c.emit);
  assert.equal(c.out[0].type, 'streamStart');
  assert.equal(c.out[0].value.roomId, 'r-abc');
});

test('unknown raw type is silently ignored', () => {
  const c = collector();
  handleRaw('totally-not-real', { user: fakeUser() }, c.emit);
  assert.equal(c.out.length, 0);
});

test('handler that throws does not crash handleRaw', () => {
  const c = collector();
  // Trigger the try/catch by passing a getter that throws
  const nasty = { user: fakeUser() };
  Object.defineProperty(nasty, 'likeCount', { get() { throw new Error('boom'); } });
  // Silence expected console.warn during this test
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    assert.doesNotThrow(() => handleRaw('like', nasty, c.emit));
  } finally {
    console.warn = origWarn;
  }
});

test('makeEvent tolerates missing user & missing avatar', () => {
  const ev = makeEvent('follow', {}, {});
  assert.equal(ev.type, 'follow');
  assert.equal(ev.user.username, '');
  assert.equal(ev.user.avatarUrl, '');
});

test('makeEvent picks profilePicture.urls[0] when url absent', () => {
  const ev = makeEvent('follow', {
    user: { uniqueId: 'x', profilePicture: { urls: ['first.jpg', 'second.jpg'] } },
  }, {});
  assert.equal(ev.user.avatarUrl, 'first.jpg');
});

test('dedupe drops repeated ids', () => {
  const ev = { id: 'dupe-1', type: 'follow', ts: Date.now() };
  assert.ok(dedupe(ev), 'first pass keeps event');
  assert.equal(dedupe(ev), null, 'second pass drops it');
});

// ---------------------------------------------------------------------------
// RAW v3 proto shapes — what tiktok-live-connector 2.4.x actually emits.
// (username in displayId, chat text in content, gift meta in data.gift, etc.)
// ---------------------------------------------------------------------------
function v3User(overrides = {}) {
  return {
    id: '99887',
    displayId: 'zx_fan_01',
    nickname: 'ZX Fan',
    avatarThumb: { urlList: ['https://cdn.example.com/thumb.webp'] },
    ...overrides,
  };
}

test('v3 chat: content + displayId + avatarThumb.urlList', () => {
  const c = collector();
  handleRaw('chat', { user: v3User(), content: 'W stream' }, c.emit);
  const ev = c.out[0];
  assert.equal(ev.type, 'comment');
  assert.equal(ev.value.comment, 'W stream');
  assert.equal(ev.user.username, 'zx_fan_01');
  assert.equal(ev.user.nickname, 'ZX Fan');
  assert.equal(ev.user.avatarUrl, 'https://cdn.example.com/thumb.webp');
  assert.equal(ev.user.id, '99887');
});

test('v3 like: count + total (string)', () => {
  const c = collector();
  handleRaw('like', { user: v3User(), count: 15, total: '80211' }, c.emit);
  assert.equal(c.out[0].value.likeCount, 15);
  assert.equal(c.out[0].value.totalLikeCount, 80211);
});

test('v3 social: common.displayText.key containing follow → follow event', () => {
  const c = collector();
  handleRaw('social', {
    user: v3User(),
    common: { displayText: { key: 'pm_main_follow_message_viewer_2' } },
  }, c.emit);
  assert.equal(c.out[0].type, 'follow');
});

test('v3 gift non-combo fires immediately with gift.name/diamondCount', () => {
  const c = collector();
  handleRaw('gift', {
    user: v3User(),
    giftId: '6221',
    repeatCount: 1,
    repeatEnd: 0,
    gift: { id: '6221', name: 'Galaxy', diamondCount: 1000, combo: false, type: 2 },
  }, c.emit);
  assert.equal(c.out.length, 1);
  assert.equal(c.out[0].value.giftName, 'Galaxy');
  assert.equal(c.out[0].value.coins, 1000);
});

test('v3 combo gift buffers until repeatEnd=1 (number)', () => {
  const c = collector();
  const base = {
    user: v3User({ id: '424242' }),
    giftId: '5655',
    gift: { id: '5655', name: 'Rose', diamondCount: 1, combo: true, type: 1 },
  };
  handleRaw('gift', { ...base, repeatCount: 2, repeatEnd: 0 }, c.emit);
  handleRaw('gift', { ...base, repeatCount: 7, repeatEnd: 0 }, c.emit);
  assert.equal(c.out.length, 0, 'no emission during combo streak');
  handleRaw('gift', { ...base, repeatCount: 7, repeatEnd: 1 }, c.emit);
  assert.equal(c.out.length, 1);
  assert.equal(c.out[0].value.repeatCount, 7);
  assert.equal(c.out[0].value.coins, 7);
});

test('v3 subscribe: subMonth arrives as string', () => {
  const c = collector();
  handleRaw('subscribe', { user: v3User(), subMonth: '3' }, c.emit);
  assert.equal(c.out[0].value.subMonth, 3);
});
