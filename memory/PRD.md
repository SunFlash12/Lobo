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
- P2: Persist counters across restarts (currently in-memory)
- P2: Multi-user dashboard / role-based access
- P2: Streamlabs / StreamElements import for existing alert configs

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
