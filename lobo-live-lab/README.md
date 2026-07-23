# LOBO LIVE LAB

TikTok LIVE overlay & alerts system for **@LoboTheMainMan**.

It listens to your TikTok LIVE (new followers, gifts, likes, comments, shares, subs),
turns those into on-screen alerts / a chat box / a follower-goal bar / counters / a
ticker, and serves those overlays as transparent browser-source pages you can add
straight to OBS or TikTok LIVE Studio. Everything is configurable from a private
dashboard at `/dashboard`.

**Zero paid services required. Runs with `npm install && npm start`.**

> 🩸 **New user? Start with [TUTORIAL.md](./TUTORIAL.md) — a full step-by-step**
> **onboarding guide written for a non-technical streamer.**

---

## Table of contents
1. [Run it](#1-run-it)
2. [Add each overlay to OBS](#2-add-each-overlay-to-obs)
3. [Upload sounds and images](#3-upload-sounds-and-images)
4. [Go live](#4-go-live)
5. [Optional stuff (webhook, signing key)](#5-optional-stuff-webhook-signing-key)
6. [How it's built (for devs)](#6-how-its-built-for-devs)

---

## 1. Run it

You need **Node.js 20 or newer** installed. From this folder:

```bash
npm install       # or:  yarn install --ignore-engines
npm start
```

Open **http://localhost:3000/dashboard** in a browser. The password is
`Bladestrex` (change it in `.env`, see below).

> Note: `npm install` may print an engine warning because one indirect dependency
> asks for Node 22. It runs fine on Node 20+. If you want to silence the warning,
> use `npm install --engine-strict=false` or `yarn install --ignore-engines`.

### Change the password (do this before going public)
Copy `.env.example` to `.env` and edit `DASHBOARD_PASSWORD`.

```bash
cp .env.example .env
# now open .env in a text editor and change DASHBOARD_PASSWORD
```

Restart with `npm start` after editing `.env`.

---

## 2. Add each overlay to OBS

In **OBS** (or TikTok LIVE Studio):
`+` → **Browser** → paste one of the URLs below.

| Overlay | URL | Recommended size |
|---|---|---|
| Alerts     | `http://localhost:3000/overlay/alerts` | 1080 × 1920 (portrait) or 1920 × 1080 |
| Chat box   | `http://localhost:3000/overlay/chat`   | 720 × 1080 |
| Goal bar   | `http://localhost:3000/overlay/goal`   | 1920 × 200 |
| Stats      | `http://localhost:3000/overlay/stats`  | 480 × 720 |
| Ticker     | `http://localhost:3000/overlay/ticker` | 1920 × 80 |

All overlays are **transparent**. Just drop them over your gameplay.

**OBS tips**
- Uncheck "Shutdown source when not visible" so alerts don't miss.
- Check "Refresh browser when scene becomes active" if you want a clean state
  every time you switch to a scene.
- Add `?demo=1` to any URL to run that overlay in browser-only demo mode
  (useful for previewing without the server firing events).

The dashboard's **OBS setup** tab has a one-click **Copy URL** button for each.

---

## 3. Upload sounds and images

In the dashboard's **Sounds & Images** tab:

1. Click **Upload**, pick an `.mp3`, `.ogg`, `.wav`, `.png`, `.jpg`, `.gif`,
   `.webp`, or `.svg` file (5 MB max).
2. Open the **Alerts** tab.
3. For each alert type, pick your sound + image from the dropdown.
4. Adjust volume and duration. Hit the per-alert **Test** button to preview.

Uploaded files live in `data/uploads/`. Delete them from the dashboard any time.

---

## 4. Go live

1. Open **Connection** in the dashboard.
2. Type your TikTok username (no `@`), hit **Connect**.
3. The status pill in the top-right turns green when you're on air.

The connector will keep trying with exponential backoff if you're not live yet.
Once TikTok picks you up, alerts and counters start flowing in real time.

**No TikTok stream yet? Use demo mode.**
`Test & demo` → **Start demo**. Randomised fake events fire every 3–8 seconds
so every overlay looks and sounds like the real thing while you set up OBS.

You can also fire single events (a follower, a big gift, a share…) from the
**Fake events** panel — those go through the exact same pipeline, so anything
that works in demo works when you're live.

---

## 5. Optional stuff (webhook, signing key)

Both are optional. Everything works without them.

### Euler Stream signing key (reliability)
TikTok cycles anti-bot challenges. `tiktok-live-connector` can use a signing
service to stay connected under heavy load. If you have a key:

```
SIGN_API_KEY=your-key-here
```

Get one at https://www.eulerstream.com/. **Not required.**

### Outbound webhook
Want another server to receive every normalised event (for logging, mods,
Discord relays, whatever)? Set:

```
WEBHOOK_URL=https://your-service.example.com/lobo
WEBHOOK_SECRET=any-long-random-string
```

Each event is POSTed as JSON with an `X-Signature: sha256=<hex-hmac>` header.
Verify it on your side by re-computing HMAC-SHA256 over the raw body with the
same secret.

**Event schema (v1):**
```json
{
  "v": 1,
  "id": "uuid",
  "type": "follow | gift | like | comment | share | subscribe | join | streamStart | streamEnd | viewers",
  "user": { "id": "", "username": "", "nickname": "", "avatarUrl": "" },
  "value": { "...": "type-specific" },
  "ts": 1700000000000
}
```

---

## 6. How it's built (for devs)

```
server/
├── index.js       Express + Socket.IO server
├── db.js          better-sqlite3 config + upload registry
├── tiktok.js      tiktok-live-connector v2 wrapper (exponential-backoff)
├── normalizer.js  Raw TikTok events → v1 schema; gift-streak buffering
├── bus.js         Rolling event log + Socket.IO broadcast
├── webhook.js     Optional outbound HMAC webhook
├── demo.js        Demo-mode fake event generator
├── auth.js        Dashboard password + signed cookie
└── uploads.js     Multer 5 MB + audio/image MIME filter

public/
├── login.html
├── dashboard/
│   ├── index.html
│   ├── dashboard.css
│   └── dashboard.js
├── overlay/
│   ├── alerts.html
│   ├── chat.html
│   ├── goal.html
│   ├── stats.html
│   └── ticker.html
└── shared/
    ├── overlay-base.js  ← Socket.IO client + demo shim + templating helpers
    ├── overlay-base.css
    ├── claw.svg
    └── chain.svg

data/
├── config.db      ← sqlite; auto-created
└── uploads/       ← auto-created; served at /uploads/*
```

### Design notes
- Palette: near-black `#0A0A0B`, bone `#EDEDEA`, blood `#C8102E`, steel `#8A8F98`,
  swamp `#3E5F3A`, gold `#EDBE1A`.
- Type: **Anton** (Google Fonts) for headings/alert text, **Inter** for UI.
- Signature motif: three-slash claw mark drawn as SVG. Reused on the login card,
  in the dashboard divider, and (via a CSS `clip-path` sweep) as the alert
  entrance animation.
- Motion is fast (150–320ms). MEGA gifts add screen-shake + particles + CRT
  flicker; everything else is calm.
- All motion respects `prefers-reduced-motion`.
- No DC Comics Lobo artwork or logo is used. Skulls, chains, claw slashes are
  generic biker-metal motifs.

### Reliability
- The TikTok connector is unofficial. This app wraps it so any failure
  (rate-limit, sign-service block, "user not live", CAPTCHA) surfaces as a
  plain-language message in the status pill without crashing the server.
- Reconnects are exponential-backoff, capped at 60s. Every reconnect resets the
  gift-streak buffer.
- Gift streaks are only fired once, on `repeatEnd` or a 3-second silence — you
  never get x1, x2, x3 spam for a single streak.
- Every event has a UUID and is dropped if it repeats within 5 minutes.
- Uploads are rate-limited (10/minute), 5 MB, audio + image MIME only.
- All rendered strings are HTML-escaped in overlays and dashboard.

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `TIKTOK_USERNAME` | `lobothemainman` | Initial username on boot |
| `DASHBOARD_PASSWORD` | `Bladestrex` | Password for `/dashboard` |
| `SESSION_SECRET` | (fallback) | Cookie signing secret |
| `DEMO_MODE` | `false` | Auto-start demo on boot |
| `SIGN_API_KEY` | (empty) | Optional Euler Stream key |
| `WEBHOOK_URL` | (empty) | Optional outbound POST target |
| `WEBHOOK_SECRET` | (empty) | HMAC secret for the above |

---

## Licence & disclaimer
`tiktok-live-connector` is community-maintained and not affiliated with TikTok.
This project is not affiliated with DC Comics or its Lobo character; the name
"LoboTheMainMan" refers to a TikTok streamer handle and all iconography here
(skulls, chains, claw slashes, colour palette) is generic and original.
