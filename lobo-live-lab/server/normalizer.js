// Event normalizer: converts raw tiktok-live-connector events into the v1 schema.
// Also handles gift streak buffering: a streak only fires the alert when repeatEnd=true
// (or when giftType !== 1, i.e. non-streakable). Dedupe by event id.
const { v4: uuid } = require('uuid');

const SCHEMA_VERSION = 1;
const seen = new Map(); // id -> ts
const SEEN_TTL = 5 * 60 * 1000;
function seenGC() {
  const cutoff = Date.now() - SEEN_TTL;
  for (const [k, ts] of seen) if (ts < cutoff) seen.delete(k);
}
setInterval(seenGC, 60_000).unref();

function makeEvent(type, data, value) {
  const u = (data && data.user) ? data.user : {};
  const avatar =
    (u.profilePicture && (u.profilePicture.url || (Array.isArray(u.profilePicture.urls) && u.profilePicture.urls[0]))) ||
    u.profilePictureUrl || '';
  return {
    v: SCHEMA_VERSION,
    id: uuid(),
    type,
    user: {
      id: (u.userId != null ? String(u.userId) : (u.uniqueId || '')),
      username: u.uniqueId || '',
      nickname: u.nickname || u.uniqueId || '',
      avatarUrl: avatar,
    },
    value: value || {},
    ts: Date.now(),
  };
}

function dedupe(ev) {
  if (seen.has(ev.id)) return null;
  seen.set(ev.id, Date.now());
  return ev;
}

// Gift streak state per (userId + giftId)
const streaks = new Map(); // key -> { user, gift, repeatCount, coins, lastTs, timer }
const STREAK_TIMEOUT_MS = 3000;

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

// Public: normalise raw event; some events are async (gift streaks) so we accept an emitter.
function handleRaw(rawType, data, emit) {
  try {
    switch (rawType) {
      case 'chat': {
        const ev = dedupe(makeEvent('comment', data, {
          comment: (data.comment || '').toString().slice(0, 500),
        }));
        if (ev) emit(ev);
        break;
      }
      case 'like': {
        const ev = dedupe(makeEvent('like', data, {
          likeCount: data.likeCount || 1,
          totalLikeCount: data.totalLikeCount || 0,
        }));
        if (ev) emit(ev);
        break;
      }
      case 'social': {
        // v2 exposes an `action` string that hints at follow/share
        const action = (data.action || data.displayType || '').toString().toLowerCase();
        if (action.includes('follow')) {
          const ev = dedupe(makeEvent('follow', data, {}));
          if (ev) emit(ev);
        } else if (action.includes('share')) {
          const ev = dedupe(makeEvent('share', data, {}));
          if (ev) emit(ev);
        } else {
          const ev = dedupe(makeEvent('social', data, { action }));
          if (ev) emit(ev);
        }
        break;
      }
      case 'follow': {
        const ev = dedupe(makeEvent('follow', data, {}));
        if (ev) emit(ev);
        break;
      }
      case 'share': {
        const ev = dedupe(makeEvent('share', data, {}));
        if (ev) emit(ev);
        break;
      }
      case 'subscribe': {
        const ev = dedupe(makeEvent('subscribe', data, {
          subMonth: data.subMonth || 1,
        }));
        if (ev) emit(ev);
        break;
      }
      case 'member': {
        const ev = dedupe(makeEvent('join', data, {}));
        if (ev) emit(ev);
        break;
      }
      case 'gift': {
        const details = data.giftDetails || {};
        const giftType = details.giftType != null ? details.giftType : data.giftType;
        // v2 field naming: repeatEnd is boolean, repeatCount is cumulative during streak
        const isStreakable = giftType === 1;
        const repeatEnd = data.repeatEnd === true || data.repeatEnd === 1;
        const repeatCount = data.repeatCount || 1;
        const diamond = details.diamondCount || data.diamondCount || 0;
        const giftName = details.giftName || data.giftName || 'Gift';
        const giftId = data.giftId || details.giftId;
        const coins = diamond * repeatCount;

        if (!isStreakable) {
          const ev = dedupe(makeEvent('gift', data, {
            giftId, giftName, repeatCount, coins, diamondCount: diamond,
          }));
          if (ev) emit(ev);
          break;
        }

        // Streakable: buffer until repeatEnd or timeout
        const key = streakKey(data, { giftId, name: giftName });
        const prev = streaks.get(key);
        const totalCoins = diamond * repeatCount;
        const state = prev || {
          user: data, giftId, giftName,
          repeatCount: 0, coins: 0, diamondCount: diamond,
          timer: null,
        };
        state.repeatCount = repeatCount; // repeatCount is cumulative from TikTok
        state.coins = totalCoins;
        state.diamondCount = diamond;
        state.user = data;
        if (state.timer) clearTimeout(state.timer);
        state.timer = setTimeout(() => finaliseStreak(key, emit), STREAK_TIMEOUT_MS);
        streaks.set(key, state);
        if (repeatEnd) finaliseStreak(key, emit);
        break;
      }
      case 'streamEnd': {
        const ev = dedupe(makeEvent('streamEnd', {}, { reason: data && data.actionId }));
        if (ev) emit(ev);
        break;
      }
      case 'connected': {
        const ev = dedupe(makeEvent('streamStart', {}, {
          roomId: data && data.roomId,
        }));
        if (ev) emit(ev);
        break;
      }
      default: {
        // ignore unknown raw types silently
      }
    }
  } catch (e) {
    // Never throw from normaliser
    // eslint-disable-next-line no-console
    console.warn('[normaliser] error handling', rawType, e && e.message);
  }
}

module.exports = { handleRaw, makeEvent, dedupe };
