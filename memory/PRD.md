# Lobo Live Lab — PRD

## Original problem statement
Build "Lobo Live Lab" — a self-hosted TikTok LIVE overlay & alerts system for the
streamer **LoboTheMainMan** (The Isle, other games). It listens to his TikTok
LIVE events (follows, gifts, likes, comments, shares, subs) and drives animated
transparent OBS-browser-source pages: alerts layer, chat box, follower goal bar,
counter stats, and event ticker — all configurable from a password-protected
dashboard. Deliverable is a runnable Node.js repo (`npm install && npm start`,
Node 20+), no bundler, no paid services required.

## Stack (as requested by user)
- Node.js 20+, Express 4, Socket.IO 4
- `tiktok-live-connector` v2.4.3 (unofficial community lib; wrapped so failures
  degrade gracefully). Optional Euler Stream signing via `SIGN_API_KEY`.
- `better-sqlite3` for widget config + upload registry
- Plain HTML/CSS/JS for the frontend (no React, no bundler)
- `multer` for uploads, `express-rate-limit` for abuse control,
  `cookie-parser` + signed-cookie auth

## User personas
- **Primary**: LoboTheMainMan — the streamer. Non-technical. Needs to run the
  app, add each overlay URL to OBS, upload a couple of sounds/images, and go
  live. The README is written for him.
- **Secondary**: any downstream service (Discord relay, mod bot, analytics)
  subscribing to the outbound webhook.

## Core requirements (frozen)
1. Auth-gated dashboard at `/dashboard` behind `DASHBOARD_PASSWORD`
2. Five transparent overlay pages: `/overlay/alerts|chat|goal|stats|ticker`
3. Live TikTok LIVE ingestion via `tiktok-live-connector`, exponential-backoff
   reconnects, plain-language status surface
4. Normalised v1 event schema; gift-streak buffering (fire on `repeatEnd`);
   dedupe by UUID
5. Socket.IO fan-out to overlays + dashboard rooms; rolling 500-event log
6. Optional signed outbound webhook (HMAC-SHA256 `X-Signature`)
7. Uploads (5 MB, audio+image MIME only, rate-limited)
8. Dashboard config for every widget with live iframe previews
9. Test buttons per event type + global demo mode (server + client)
10. Biker-metal "gritty album cover" theme with signature claw-slash motif
    (original SVG, no DC Lobo IP)

## Implemented (2026-02)
- ✅ Full backend service pipeline (server/*)
- ✅ Signed-cookie password auth + `express-rate-limit` on login
- ✅ better-sqlite3 config store with deep-merge defaults
- ✅ tiktok-live-connector v2 wrapper with retry + status surface + human error
     mapping (not live / rate-limit / sign-blocked)
- ✅ Normalizer with gift-streak buffering (`giftType===1` + `repeatEnd` +
     3s silence fallback) and 5-minute UUID dedupe
- ✅ Rolling 500-event log with counters (viewers, session likes, followers,
     coins, comments)
- ✅ Optional HMAC-signed outbound webhook
- ✅ Demo mode: server-side timer 3–8s + single-event test buttons
- ✅ Multer uploads (5 MB, audio + image MIME whitelist, 10/minute rate limit)
- ✅ Alerts overlay: queue, claw-slash entrance, glitch/mega variants, particles
     + screen-shake + CRT flicker on MEGA gifts, TTS toggle for follows
- ✅ Chat overlay: role-coloured names, avatars, fade-out, profanity filter,
     length clamp, XSS-safe
- ✅ Goal overlay: animated fill with pulse-on-increment
- ✅ Stats overlay: viewers / session likes / new followers (huge Anton numerals)
- ✅ Ticker overlay: marquee-style recent events with type-coloured tags
- ✅ Dashboard: connection panel with live status pill, per-widget config forms
     with live iframe previews, test-event buttons for all 8 types, demo toggle,
     upload manager with previews, copy-URL OBS setup, event log viewer
- ✅ `?demo=1` client-side demo shim on every overlay
- ✅ `prefers-reduced-motion` respected
- ✅ Palette + fonts + claw motif per problem statement
- ✅ README written for a non-technical streamer
- ✅ End-to-end verified: all overlays return 200, login flow works, all 8
     event types propagate through the pipeline into the rolling log

## Not implemented / deferred backlog
- P2: TypeScript rewrite (kept plain JS per user request)
- P2: Docker / systemd service files
- P2: WebSocket auth (currently overlays are unauth so they load in OBS with
      zero config; dashboard socket is behind cookie auth on the HTTP handshake
      only, not on the WS itself — acceptable for a localhost tool)
- P2: Multi-user dashboard / role-based access
- P2: Streamlabs / StreamElements import for existing alert configs

## Iteration 2 (2026-02) — additions
- ✅ Session counters persist to SQLite (`kv[counters]`) with 1s debounce, load
     on boot, cleared by the "Reset session counters" button, flushed on SIGINT/
     SIGTERM. Viewer count stays live-only (not persisted).
- ✅ Fixed `WebcastEvent.SUBSCRIBE` (does not exist in v2) → `SUB_NOTIFY`.
- ✅ Better status-pill diagnostics: distinguishes "user not live", "sign
     blocked", "rate-limited", and the generic "Room ID not found" case with a
     nudge toward `SIGN_API_KEY` when unsigned.
- ✅ Boot log prints DASHBOARD_PASSWORD source, SIGN_API_KEY presence, and
     DEMO_MODE state so the streamer can see at a glance what's wired.
- ✅ Verified end-to-end: fired 5 follows + 3 gifts + 4 likes → restart →
     counters exactly preserved. Then reset → restart → still zero.

## Iteration 3 (2026-02) — Windows-friendly persistence
- ✅ Swapped `better-sqlite3` (needs Python + C++ build tools on Windows) for a
     plain-JSON file store — the problem statement explicitly allowed this
     fallback. Same public API in `server/db.js`, so no other files needed to
     change.
- ✅ Atomic writes (write-to-tmp + rename) so a Ctrl+C mid-write can never
     corrupt the JSON files.
- ✅ Files: `data/config.json`, `data/counters.json`, `data/uploads.json`.
- ✅ Removed `better-sqlite3` from `package.json`; `npm install` now works on
     stock Windows 10/11 with just Node.js — no Python, no build tools.
- ✅ Verified end-to-end: all endpoints, all 8 event types, counter persistence
     across restart, 19/19 normalizer unit tests.

## Iteration 4 (2026-02) — starter art + video alerts
- ✅ Chromakeyed the 3 user-uploaded character PNGs (green removed) and shipped
     them in `assets/starter-images/`; `server/starters.js` auto-imports them
     into the upload library on boot (idempotent).
- ✅ User's Hailuo MP4 (green-screen Lobo howl animation) converted one-time via
     ffmpeg chromakey → **VP9 webm with real alpha channel**
     (`starter-lobo-howl.webm`). No green box in OBS.
- ✅ Full video support in alerts: uploads now accept mp4/webm (25 MB cap, up
     from 5 MB), `classify()` returns kind `video`, alerts overlay renders
     `<video autoplay muted loop playsinline>` for video media, dashboard
     media dropdown lists videos with a `[video]` tag, library grid shows
     looping video thumbnails.
- ✅ Default **follow** alert now uses the animated `starter-lobo-howl.webm`.
- ✅ Verified end-to-end: boot auto-import (kind=video), demo follow fired →
     video element mounted, playing (not paused), transparent over the alert
     card; dashboard select shows it selected.

## Real-live-session test
Requires @lobothemainman to actually be broadcasting on TikTok. From the sandbox
we can only verify the "not live" reconnect loop, which is working and now
shows a plain-language reason in the status pill. When Lobo does test live:
1. Open dashboard, watch the top-right status pill turn green ("LIVE") within
   a few seconds of hitting Connect.
2. If it stays yellow/red with a "sign blocked" or "Room ID not found" message
   for over a minute while he's clearly on air, set `SIGN_API_KEY` in `.env`
   (get one from https://www.eulerstream.com/) and restart.

## File map
```
/app/lobo-live-lab/
├── package.json, yarn.lock, .env.example, .gitignore, README.md
├── server/            Express + Socket.IO app (9 files)
├── public/
│   ├── login.html
│   ├── dashboard/     3 files (html, css, js)
│   ├── overlay/       5 transparent OBS pages
│   └── shared/        overlay-base.js + css + claw/chain svg
└── data/              runtime: config.db + uploads/
```

## How to run
```
cd /app/lobo-live-lab
npm install   # or: yarn install --ignore-engines
npm start     # dashboard on http://localhost:3000/dashboard (pw: Bladestrex)
DEMO_MODE=true npm start   # instant demo mode for OBS setup
```
