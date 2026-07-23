// Event normalizer: converts raw tiktok-live-connector events into the v1 schema.
// Also handles gift streak buffering: a streak only fires the alert when repeatEnd=true
// (or when giftType !== 1, i.e. non-streakable). Dedupe by event id.
const { v4: uuid } = require('uuid');

const SCHEMA_VERSION = 1;
const SEEN_TTL_MS = 5 * 60 * 1000;
const SEEN_GC_INTERVAL_MS = 60 * 1000;
const STREAK_TIMEOUT_MS = 3000;
const MAX_COMMENT_LENGTH = 500;

// -------- Dedupe (rolling window of event ids) --------
const seen = new Map(); // id -> ts
function seenGC() {
  const cutoff = Date.now() - SEEN_TTL_MS;
  for (const [k, ts] of seen) if (ts < cutoff) seen.delete(k);
}
setInterval(seenGC, SEEN_GC_INTERVAL_MS).unref();

function dedupe(ev) {
  if (seen.has(ev.id)) return null;
  seen.set(ev.id, Date.now());
  return ev;
}

// -------- Event factory --------
// Field shapes: tiktok-live-connector v2.4.x emits RAW tiktok-live-proto/v3
// messages (username lives in `user.displayId`, avatars in `user.avatarThumb.
// urlList`, etc.). We read v3 fields first and fall back to the legacy v1/v2
// names so demo mode and older payloads keep working.
function pickImageUrl(img) {
  return (img && Array.isArray(img.urlList) && img.urlList[0]) || '';
}

function makeEvent(type, data, value) {
  const u = (data && data.user) ? data.user : {};
  const avatar =
    pickImageUrl(u.avatarThumb) || pickImageUrl(u.avatarMedium) || pickImageUrl(u.avatarLarge) ||
    (u.profilePicture && (u.profilePicture.url || (Array.isArray(u.profilePicture.urls) && u.profilePicture.urls[0]))) ||
    u.profilePictureUrl || '';
  const username = u.displayId || u.uniqueId || '';
  const id = u.userId != null ? String(u.userId)
    : (u.idStr || (u.id != null && String(u.id) !== '0' ? String(u.id) : '') || username);
  return {
    v: SCHEMA_VERSION,
    id: uuid(),
    type,
    user: {
      id,
      username,
      nickname: u.nickname || username,
      avatarUrl: avatar,
    },
    value: value || {},
    ts: Date.now(),
  };
}

function emitDeduped(ev, emit) {
  const kept = dedupe(ev);
  if (kept) emit(kept);
}

// -------- Gift streak state (per user + gift) --------
const streaks = new Map();

function streakKey(data, gift) {
  const u = (data && data.user) || {};
  const uid = u.userId || u.uniqueId || 'anon';
  const g = (gift && (gift.giftId || gift.id || gift.name)) || 'g';
  return `${uid}:${g}`;
}

function finaliseStreak(key, emit) {
  const s = streaks.get(key);
  if (!s) return;
  streaks.delete(key);
  clearTimeout(s.timer);
  const ev = makeEvent('gift', s.user, {
    giftId: s.giftId,
    giftName: s.giftName,
    repeatCount: s.repeatCount,
    coins: s.coins,
    diamondCount: s.diamondCount,
  });
  emit(ev);
}

// -------- Per-event-type handlers --------
function handleChat(data, emit) {
  // v3: `content`; legacy: `comment`
  emitDeduped(makeEvent('comment', data, {
    comment: (data.content || data.comment || '').toString().slice(0, MAX_COMMENT_LENGTH),
  }), emit);
}

function handleLike(data, emit) {
  // v3: `count` / `total`; legacy: `likeCount` / `totalLikeCount`
  emitDeduped(makeEvent('like', data, {
    likeCount: data.count || data.likeCount || 1,
    totalLikeCount: Number(data.total) || data.totalLikeCount || 0,
  }), emit);
}

function handleSocial(data, emit) {
  // v3: intent is in common.displayText.key (e.g. "pm_main_follow_message_viewer_2");
  // legacy: `action`/`displayType` strings. The connector already splits most
  // follow/share socials into their own events, so this is a safety net.
  const key = (data.common && data.common.displayText && data.common.displayText.key) || '';
  const action = (key || data.action || data.displayType || '').toString().toLowerCase();
  if (action.includes('follow'))      emitDeduped(makeEvent('follow', data, {}),          emit);
  else if (action.includes('share'))  emitDeduped(makeEvent('share',  data, {}),          emit);
  else                                emitDeduped(makeEvent('social', data, { action }),  emit);
}

function handleFollow(data, emit)    { emitDeduped(makeEvent('follow', data, {}), emit); }
function handleShare(data, emit)     { emitDeduped(makeEvent('share',  data, {}), emit); }
function handleMember(data, emit)    { emitDeduped(makeEvent('join',   data, {}), emit); }

function handleSubscribe(data, emit) {
  // v3 sends subMonth as a string
  emitDeduped(makeEvent('subscribe', data, { subMonth: Number(data.subMonth) || 1 }), emit);
}

function handleStreamEnd(data, emit) {
  emitDeduped(makeEvent('streamEnd', {}, { reason: data && data.actionId }), emit);
}

function handleConnected(data, emit) {
  emitDeduped(makeEvent('streamStart', {}, { roomId: data && data.roomId }), emit);
}

function handleGift(data, emit) {
  // v3: gift metadata lives in `data.gift` (Gift proto: type/name/diamondCount/combo);
  // legacy: `data.giftDetails` (giftType/giftName/diamondCount).
  const g = data.gift || data.giftDetails || {};
  const giftType = g.type != null ? g.type : (g.giftType != null ? g.giftType : data.giftType);
  // Streakable when giftType===1 (legacy) or the v3 Gift is combo-capable
  const isStreakable = giftType === 1 || g.combo === true;
  // v3 repeatEnd is a number (0/1), legacy is boolean
  const repeatEnd = data.repeatEnd === true || Number(data.repeatEnd) >= 1;
  const repeatCount = data.repeatCount || 1;
  const diamond = g.diamondCount || data.diamondCount || 0;
  const giftName = g.name || g.giftName || data.giftName || 'Gift';
  const giftId = data.giftId || g.id || g.giftId;
  const coins = diamond * repeatCount;

  if (!isStreakable) {
    emitDeduped(makeEvent('gift', data, {
      giftId, giftName, repeatCount, coins, diamondCount: diamond,
    }), emit);
    return;
  }

  // Streakable: buffer until repeatEnd or STREAK_TIMEOUT_MS silence
  const key = streakKey(data, { giftId, name: giftName });
  const prev = streaks.get(key);
  const state = prev || {
    user: data, giftId, giftName,
    repeatCount: 0, coins: 0, diamondCount: diamond,
    timer: null,
  };
  state.repeatCount = repeatCount; // cumulative from TikTok during a streak
  state.coins = coins;
  state.diamondCount = diamond;
  state.user = data;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => finaliseStreak(key, emit), STREAK_TIMEOUT_MS);
  streaks.set(key, state);
  if (repeatEnd) finaliseStreak(key, emit);
}

// -------- Dispatch table (kept tiny; each handler is <20 lines) --------
const HANDLERS = {
  chat:      handleChat,
  like:      handleLike,
  social:    handleSocial,
  follow:    handleFollow,
  share:     handleShare,
  member:    handleMember,
  subscribe: handleSubscribe,
  gift:      handleGift,
  streamEnd: handleStreamEnd,
  connected: handleConnected,
};

// Public entry point. Some events are async (gift streaks) so we accept an emitter.
function handleRaw(rawType, data, emit) {
  const fn = HANDLERS[rawType];
  if (!fn) return; // silently ignore unknown raw types
  try {
    fn(data, emit);
  } catch (e) {
    // Never throw from normaliser
    console.warn('[normaliser] error handling', rawType, e && e.message);
  }
}

module.exports = { handleRaw, makeEvent, dedupe };
