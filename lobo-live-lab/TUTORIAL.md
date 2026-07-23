# LOBO LIVE LAB — Full Onboarding Tutorial

Everything you need to go from zero to a live-tested alert setup, written for
someone who has never touched Node.js. Read in order the first time. Once
you're set up, jump straight to §6 every stream.

---

## Contents
1. [What this is](#1-what-this-is)
2. [Install once: Node.js](#2-install-once-nodejs)
3. [Get the code onto your PC](#3-get-the-code-onto-your-pc)
4. [Install & run the app](#4-install--run-the-app)
5. [Configure everything (one afternoon, once)](#5-configure-everything-one-afternoon-once)
   1. [Change the password](#51-change-the-password)
   2. [Connect to your TikTok](#52-connect-to-your-tiktok)
   3. [Upload sounds & images](#53-upload-sounds--images)
   4. [Configure the Alerts](#54-configure-the-alerts)
   5. [Configure Chat, Goal, Stats, Ticker](#55-configure-chat-goal-stats-ticker)
6. [Add the overlays to OBS](#6-add-the-overlays-to-obs)
7. [Test everything in demo mode](#7-test-everything-in-demo-mode)
8. [Going live — the stream-day workflow](#8-going-live--the-stream-day-workflow)
9. [When TikTok blocks unsigned traffic (Euler Stream key)](#9-when-tiktok-blocks-unsigned-traffic-euler-stream-key)
10. [Troubleshooting](#10-troubleshooting)
11. [Advanced — for later](#11-advanced--for-later)

---

## 1. What this is

Lobo Live Lab is a small program that runs on **your streaming PC** and does
three things:

1. Watches your TikTok LIVE for events (followers, gifts, likes, shares, subs,
   comments) in real time.
2. Turns those events into on-screen **alerts**, a **chat box**, a **follower
   goal bar**, **counters**, and an event **ticker** — all as transparent
   webpages you can drop into OBS as Browser Sources.
3. Gives you a private dashboard at `http://localhost:3000/dashboard` where you
   customise everything (sounds, images, text templates, animations).

**It only runs on your PC.** Nothing gets published to the internet, no
subscriptions, no monthly fees. You start it before you stream, you stop it
after. That's it.

---

## 2. Install once: Node.js

Lobo Live Lab needs **Node.js** (a free program that runs JavaScript apps like
this one). You install it once and forget it exists.

1. Open **https://nodejs.org/en/download**
2. Download the **"LTS"** version for your OS. On Windows that's the `.msi`
   installer. If it asks between "Node 20 LTS" and "Node 22 LTS", pick **Node
   22 LTS** — it's newer and avoids a small warning message.
3. Run the installer, accept the defaults, click Next → Next → Finish.
4. **You do NOT need to check** "install additional tools for native modules"
   (the Python + Visual Studio checkbox). This app doesn't need them.

**Verify it worked.** Open Command Prompt (Windows key → type `cmd` → Enter) and run:

```
node --version
```

You should see something like `v22.11.0`. If you get "not recognized", close
Command Prompt, open a new one, and try again — Windows needs a fresh terminal
to see the new install.

---

## 3. Get the code onto your PC

Two paths — pick whichever is easier.

### Path A — via GitHub (recommended, easy to update later)

1. In Emergent's chat interface, click **"Save to GitHub"** in the top-right
   corner. Follow prompts to connect your GitHub account and pick a repo name
   (e.g. `lobo-live-lab`).
2. Once it's on GitHub, on your PC:
   - Install [GitHub Desktop](https://desktop.github.com/) (much easier than
     command-line git for a non-dev).
   - Sign in, click **File → Clone repository**, pick your repo, choose a folder
     (e.g. `C:\Users\anton\Documents\`).
3. Any time I push a fix in Emergent, click **Fetch origin → Pull** in GitHub
   Desktop to get the latest version.

### Path B — plain download (no GitHub)

1. In Emergent, click **"Save to GitHub"** to publish the code, then in your
   GitHub repo click the green **Code** button → **Download ZIP**.
2. Unzip somewhere you'll remember, like `C:\Users\anton\Documents\Lobo`.
3. **Do not** save it in `Downloads/` long-term — files there sometimes get
   auto-cleaned by Windows and read-only permissions can be weird.

Whichever path you took, the folder you want to work in is called
**`lobo-live-lab`** (it's inside whatever the outer folder is).

---

## 4. Install & run the app

Open **Command Prompt** (Windows key → `cmd` → Enter), then navigate into the
project folder. Change `C:\Users\anton\Documents\Lobo\lobo-live-lab` below to
wherever yours actually is:

```
cd C:\Users\anton\Documents\Lobo\lobo-live-lab
```

Then, **once**, install the dependencies:

```
npm install
```

- Takes ~30 seconds.
- You may see yellow **warnings** about `multer` or `uuid`. **Ignore those** —
  they're cosmetic and don't affect anything.
- If you see **red errors** about "Python" or "Visual Studio", stop and paste
  the error back to me — it means you're not on the latest code (see §3 again;
  older versions needed a C++ compiler, current version doesn't).

Then, **every time you want to run it**:

```
npm start
```

You should see:

```
Lobo Live Lab — listening on http://localhost:3000
Dashboard: http://localhost:3000/dashboard
Password : Bladestrex (default — change me!)
Signing  : unsigned (fine for most streams)
Demo mode: off
```

Leave that Command Prompt window open — closing it stops the app. If you want
it always running, minimise it, or (advanced) set up a `.bat` shortcut on
your desktop.

**Open your browser to http://localhost:3000/dashboard.**  
Log in with the password shown in the console (default: `Bladestrex`).

You should now see the biker-metal dashboard with a red claw-slash logo. Welcome
to the pack.

---

## 5. Configure everything (one afternoon, once)

You only do all of this once. After that it's saved to `data/config.json` and
loads automatically every time you launch.

### 5.1 Change the password

Right now anyone on your Wi-Fi who guesses `Bladestrex` can open your dashboard.
Fix that first.

1. In your `lobo-live-lab` folder, copy `.env.example` to `.env`. In Command
   Prompt:
   ```
   copy .env.example .env
   ```
   (Or right-click `.env.example` → Copy → Paste, then rename the copy to
   `.env` — Windows may complain about "no filename", say yes.)
2. Open `.env` in **Notepad** (right-click → Open with → Notepad).
3. Find the line `DASHBOARD_PASSWORD=Bladestrex` and change it to whatever you
   want. Keep it something you'll remember. Don't use quotes.
4. Save.
5. In the Command Prompt window running the app, press **Ctrl+C** to stop the
   server. Say `y` if it asks. Then run `npm start` again.

Reload the dashboard and log in with the new password.

### 5.2 Connect to your TikTok

1. Click the **Connection** tab (left sidebar).
2. In the **Username** field, type your TikTok username **without the `@`**
   (e.g. `lobothemainman`).
3. Click **Connect**.

Watch the **status pill** in the top-right corner. It changes colour based on
what's happening:

| Colour | Meaning |
|---|---|
| ⚪ Grey — "OFFLINE" | Not trying to connect yet |
| 🟡 Yellow — "CONNECTING" | Attempting handshake with TikTok |
| 🟢 Green — "LIVE" | Connected. Events flowing. |
| 🟡 Yellow — "RECONNECTING" | Lost connection, will retry with backoff |
| 🔴 Red — "ERROR" | Something's wrong. Read the message under it. |

**If you're not currently live-streaming, the pill will stay yellow** and say
something like "Couldn't find @lobothemainman's room. They probably aren't
live yet." That's normal — it'll try every few seconds and connect the moment
you actually go live.

**If you ARE live but the pill won't turn green after 60 seconds**, see §9
(Euler Stream key).

### 5.3 Upload sounds & images

Click the **Sounds & Images** tab.

- **Sounds**: mp3, ogg, or wav files. Under 25 MB each. Short is better (1-3s).
  You'll want at minimum:
  - A sound for **new followers** (something ominous or celebratory)
  - A sound for **gifts** (something rewarding)
  - Optional: a bigger "MEGA" sound for expensive gifts, a chime for
    subscribers, a whoosh for shares.
- **Images / GIFs**: png, jpg, gif, webp, or svg. Under 25 MB each. Transparent
  PNGs work best (skulls, chains, claws, logos).
- **Videos**: mp4 or webm clips. Under 25 MB, keep them short (3-8s). They
  auto-play muted and loop while the alert is on screen. A **webm with an
  alpha (transparent) background** looks best — the animated Lobo howl clip
  that ships with the lab (`starter-lobo-howl.webm`) is exactly that, and is
  wired up as the default **New follower** alert.

For each file:
1. Click **Choose File**, pick it, then click **Upload**.
2. It appears in the **Library** below. You can play the sound to preview it
   right there.

**Where to find sounds:**
- [freesound.org](https://freesound.org/) — huge library, free with a login.
- [pixabay.com/sound-effects](https://pixabay.com/sound-effects/) — royalty-free.
- Your own recordings.

**Do NOT use copyrighted music.** TikTok will strike the stream.

### 5.4 Configure the Alerts

This is the fun part. Click the **Alerts** tab.

There are five alert types, each in its own card. For each one:

1. **Toggle switch** (top-right of the card) — turn it on/off.
2. **Text template** — the sentence shown in the alert. Use these variables in
   curly braces and they'll be replaced live:
   - `{username}` — the follower/gifter/liker's TikTok name
   - `{giftName}` — the gift type (e.g. "Rose", "Galaxy") *[gift alerts only]*
   - `{repeatCount}` — number of gifts in the streak *[gift alerts only]*
   - `{coins}` — total coin value *[gift alerts only]*
   - `{likeCount}` — likes hit the milestone *[like alerts only]*
   - Example: `FRESH MEAT — {username}` becomes `FRESH MEAT — no_mercy_lobo`
3. **Duration** — how long the alert stays on screen (in milliseconds; 5000 =
   5 seconds).
4. **Sound** dropdown — pick one of your uploads. Or leave as `(none)`.
5. **Image / GIF / Video** dropdown — pick one of your uploads (videos are
   tagged `[video]`). Or leave as `(none)`.
6. **Volume** slider — 0% to 100%.
7. **Test** button (next to volume) — pushes a fake alert of this type through
   the real system. Watch the preview iframe on the right to see it fire.

**Alert-specific settings:**

- **Gift alerts** have a **MEGA gift coin threshold** field. Any gift totalling
  above this number triggers the upgraded "MEGA" animation (screen shake + gold
  particles + CRT flicker). Default: 500 coins.
- **Like alerts** have a **milestone every N likes** field. Alerts only fire on
  round milestones (e.g. every 100 likes), not every single tap. Default: 100.
- **New follower alerts** have a **TTS toggle** — when on, your browser reads
  the follower's name out loud through your speakers. (Uses your OS's built-in
  voice.)

The preview iframe on the right is a **live copy of what OBS will show**. Any
change you make on the left updates in real-time.

### 5.5 Configure Chat, Goal, Stats, Ticker

These are simpler. Each has its own tab.

**Chat box:**
- **Fade after** — how many ms before old messages fade off screen. `0` = never
  fade.
- **Max messages** — cap on how many messages are visible at once.
- **Max length** — clamps very long messages so they don't fill the screen.
- **Streamer colour** — colour of your own username in chat.
- **Profanity filter** — replaces common swear words with `****`.
- **Show avatars** — turn off for a minimal, text-only look.

**Goal bar:**
- **Label** — e.g. "ROAD TO 25K" or "1000 FOLLOWERS TO GO".
- **Target** — the goal number.
- **Current** — start it at your current follower count.
- **Start** — the bar's starting value (usually 0).
- The bar automatically increments by 1 for every follow event. It pulses red
  each time.

**Counters (Stats):**
- Toggle each of viewers / session likes / new followers on or off. Anything
  off is hidden from the overlay.

**Ticker:**
- **Scroll speed** — seconds per loop across the screen. Higher = slower.
- **Max items** — how many recent events stay in rotation.

---

## 6. Add the overlays to OBS

Click the **OBS setup** tab. You'll see five URLs — one per overlay. There's a
**Copy** button next to each.

### For each overlay you want on screen:

1. In **OBS Studio**, right-click your scene → **Add → Browser**.
2. Give it a name matching the overlay (e.g. "Lobo — Alerts").
3. **Uncheck** "Local file" if it's checked.
4. In the **URL** field, paste the URL you copied from the dashboard.
5. **Width** and **Height**:
   - Full-screen overlays (Alerts): match your canvas — `1080` × `1920` for
     portrait, `1920` × `1080` for landscape.
   - Chat box: `720` × `1080` (or whatever height fits your layout).
   - Goal bar: `1920` × `200`.
   - Counters: `480` × `720`.
   - Ticker: `1920` × `80`.
6. Click **OK**.

### OBS settings that matter (right-click the source → Properties):

- ✅ **Refresh browser when scene becomes active** — turn ON so alerts don't
     miss when you switch scenes.
- ❌ **Shutdown source when not visible** — turn OFF so it stays connected.
- ✅ **Control audio via OBS** — turn ON if you want alert sounds routed
     through your stream's audio mixer instead of your desktop speakers.

### The overlays are transparent

Just drag them over the top of your gameplay source. Nothing else needed.

### Multi-scene setup

You can copy the Browser source into every scene (right-click → Copy → paste in
new scene), or use **OBS's "Scene" → "Filters"** to keep a single Alerts scene
always on top. Both work; the copy-per-scene approach is simpler for beginners.

---

## 7. Test everything in demo mode

Before your first real stream, prove every overlay works.

1. Open the **Test & Demo** tab in the dashboard.
2. Click **Start demo**. Fake events (random followers, gifts, likes,
   comments…) will fire every 3-8 seconds.
3. Switch to OBS and check that:
   - Alerts appear over your gameplay.
   - Chat messages roll in on the chat overlay.
   - The follower goal bar ticks up.
   - The counters (viewers / likes / followers) update.
   - The ticker scrolls with recent events.
4. Open the **Alerts** tab and hit the individual **Test** buttons to trigger
   specific event types (a follower, a gift, a MEGA gift…). Watch OBS.
5. When you're satisfied, click **Stop demo**.

**If an overlay doesn't show up in OBS at all**, right-click the source →
**Refresh cache of current page**. Still nothing? See §10.

---

## 8. Going live — the stream-day workflow

Every stream, from cold:

1. **Boot Lobo Live Lab.** Double-click your `.bat` shortcut, or open Command
   Prompt in the `lobo-live-lab` folder and run `npm start`. Leave it running.
2. **Open the dashboard** at `http://localhost:3000/dashboard`. Log in.
3. **Connection tab → Connect.** The status pill should stay yellow until you
   go live, then flip green within seconds.
4. (Optional) **Reset session counters** to zero out the "session likes" /
   "new followers" numbers from your last stream.
5. **Start your TikTok LIVE.** Once you're on-air, the pill turns green and
   events start flowing to OBS automatically.
6. Stream.
7. When you're done streaming, close Command Prompt or press Ctrl+C. All your
   config is saved.

**During a stream** you can keep the dashboard open on a second monitor to:
- Watch the **event log** roll by (tab: Event Log).
- Fire test alerts manually (tab: Test & Demo).
- Adjust volumes or turn alerts on/off on the fly.
- See who just followed / gifted in the top-right counters.

Any change you make in the dashboard applies **instantly** to OBS. No restart
needed.

---

## 9. When TikTok blocks unsigned traffic (Euler Stream key)

The `tiktok-live-connector` library the app uses is community-maintained. It
sometimes gets blocked by TikTok's anti-bot systems, especially during peak
hours. When that happens, the status pill stays yellow/red with a message like:

> Couldn't find @lobothemainman's room. Either they aren't live yet, or
> TikTok blocked our request. If it keeps failing while you know you're live,
> set SIGN_API_KEY (Euler Stream) in .env.

The fix is a **free signing key** from Euler Stream.

### Get the key (5 minutes)

1. Open **https://www.eulerstream.com/** → **Sign Up** (no credit card
   needed).
2. Once signed in, go to the **Dashboard** → **API Keys**.
3. Click **Create API Key**, give it any name (e.g. "Lobo Live Lab"), and
   **copy** the long random string it gives you.

### Wire it in

1. Open your `.env` file in Notepad.
2. Find `SIGN_API_KEY=` and paste the key after the `=`:
   ```
   SIGN_API_KEY=your-long-random-string-here
   ```
   No spaces, no quotes.
3. Save the file.
4. In the Command Prompt running the app, press **Ctrl+C** to stop, then
   `npm start` again.
5. The boot output should now show:
   ```
   Signing  : SIGN_API_KEY set (Euler Stream)
   ```

The Euler Stream free tier is generous for a single streamer. If you outgrow
it (rare) their paid plans start at a few dollars a month.

---

## 10. Troubleshooting

### "npm is not recognized as an internal or external command"
- Node.js isn't installed, or your Command Prompt is stale. Close the window,
  open a new Command Prompt, and try again. If it still doesn't work, install
  Node.js from §2.

### "Cannot find module 'dotenv'" (or any module) on `npm start`
- Your `npm install` failed or didn't complete. Delete `node_modules/` and
  `package-lock.json`, then run `npm install` again. Paste any red errors here
  and I'll debug.

### "Error: listen EADDRINUSE: address already in use :::3000"
- Something else is using port 3000. Either close that other app, or in `.env`
  set `PORT=3001` (or any other number) and restart. Then use
  `http://localhost:3001/dashboard`.

### Dashboard loads but the status pill stays yellow forever
- If you're **not currently live-streaming on TikTok**: expected. It'll connect
  the moment you actually go live.
- If you **are live** and it still won't turn green: see §9 (signing key).

### Alerts overlay is blank in OBS
- Right-click the Browser source in OBS → **Refresh cache of current page**.
- Check the URL matches exactly one from the dashboard's **OBS setup** tab.
- Confirm Lobo Live Lab is still running (check the Command Prompt window).
- Make sure the URL uses `http://localhost:3000` — **not** `https://` and
  **not** `127.0.0.1:3000` (that also works but different sockets).

### Alert fires but no sound
- OBS Browser sources are muted by default. Right-click the source → Properties
  → check **Control audio via OBS**, or in Audio Mixer, unmute the source.
- Or check the sound uploaded correctly (Sounds & Images tab, click ▶).
- Or check the volume slider on the Alerts tab isn't at 0.

### Alerts fire in the OBS Browser Source preview but not on stream
- Almost always an OBS scene-collection issue. The source might be in a
  different scene than the one you're broadcasting. In OBS, switch to the
  scene you actually stream and add the browser source there.

### Windows says "python was not found" during `npm install`
- You're on the **old version** of the code that used `better-sqlite3`. Pull
  the latest from GitHub (§3, path A: `Fetch origin → Pull`). The current
  version does not need Python or any C++ compiler.

### "engines: unsupported node version"
- You're on Node 18 or older. Uninstall it, install Node 22 LTS from §2.

### Anything else
- **Check the Command Prompt window** where `npm start` is running. Errors
  print there. Copy the last 20 lines and share them.
- **Check the browser console** on the dashboard (F12 → Console tab). Any red
  lines are clues.
- Then paste those clues back to me.

---

## 11. Advanced — for later

### Outbound webhook (relay events to Discord, another bot, etc.)

In `.env`:
```
WEBHOOK_URL=https://your-service.example.com/lobo
WEBHOOK_SECRET=any-long-random-string-you-invent
```

Every event now POSTs as JSON to that URL, with an `X-Signature: sha256=<hex>`
header. On the receiving end, verify by re-computing HMAC-SHA256 of the raw
body with the same secret.

The event schema is documented in the main [README.md](./README.md).

### Environment variables

Full list of `.env` variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port the app listens on |
| `TIKTOK_USERNAME` | `lobothemainman` | Initial username shown in the dashboard |
| `DASHBOARD_PASSWORD` | `Bladestrex` | Password for `/dashboard` |
| `SESSION_SECRET` | (auto) | Signs the login cookie. Change it to invalidate all logged-in sessions. |
| `DEMO_MODE` | `false` | Auto-start demo mode on boot |
| `SIGN_API_KEY` | (empty) | Optional Euler Stream signing key |
| `WEBHOOK_URL` | (empty) | Optional outbound webhook target |
| `WEBHOOK_SECRET` | (empty) | HMAC secret for the above |

### Where your data lives

```
lobo-live-lab/data/
├── config.json      ← dashboard settings (label, colours, alert templates…)
├── counters.json    ← persisted session counters
├── uploads.json     ← registry of your uploaded sounds/images
└── uploads/         ← the actual sound/image files
```

**Back this up occasionally.** If you re-install Windows or move to a new PC,
copying this folder means you don't have to reconfigure everything.

### Multiple TikTok accounts

Change `TIKTOK_USERNAME` in `.env` or on the Connection tab. The app can only
connect to one at a time.

### Running it as a service (auto-start with Windows)

Advanced. If you're comfortable with the Task Scheduler, create a task that
runs `npm start` in the `lobo-live-lab` folder at logon, with the working
directory set to that folder. Or use [pm2](https://pm2.keymetrics.io/) —
`npm install -g pm2` then `pm2 start server/index.js --name lobo`.

---

**Questions or something misbehaving?** Copy the exact error or a screenshot
and drop it in the Emergent chat. I'll help.

Now go pack some feeds. 🩸
