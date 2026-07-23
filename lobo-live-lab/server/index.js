// Lobo Live Lab — main server. Express + Socket.IO + tiktok-live-connector wrapper.
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { Server: IOServer } = require('socket.io');

const db = require('./db');
const bus = require('./bus');
const tiktok = require('./tiktok');
const demo = require('./demo');
const auth = require('./auth');
const { uploader, UPLOAD_DIR, classify } = require('./uploads');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: '*' } });
bus.attachIO(io);

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

// ---------- Static assets ----------
app.use('/static', express.static(path.join(PUBLIC_DIR, 'shared'), { maxAge: '1h' }));
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '1d',
  setHeaders(res) { res.setHeader('Access-Control-Allow-Origin', '*'); },
}));

// ---------- Public pages ----------
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/login', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

const loginLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 20, standardHeaders: true });
app.post('/login', loginLimiter, (req, res) => {
  const pw = (req.body && req.body.password) || '';
  if (!auth.checkPassword(pw)) {
    return res.status(401).json({ ok: false, error: 'Wrong password.' });
  }
  auth.issueCookie(res);
  res.json({ ok: true });
});
app.post('/logout', (req, res) => { auth.clearCookie(res); res.json({ ok: true }); });

// ---------- Overlays (public, no auth) ----------
const OVERLAYS = ['alerts', 'chat', 'goal', 'stats', 'ticker'];
for (const o of OVERLAYS) {
  app.get(`/overlay/${o}`, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'overlay', `${o}.html`));
  });
}
// public config read (used by overlays)
app.get('/api/public/config', (req, res) => {
  res.json({ config: db.loadConfig(), counters: bus.getCounters(), status: tiktok.status });
});

// ---------- Dashboard ----------
app.get('/dashboard', auth.requireAuth, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard', 'index.html'));
});
app.use('/dashboard-assets', auth.requireAuth,
  express.static(path.join(PUBLIC_DIR, 'dashboard'), { maxAge: '1h' }));

// ---------- Auth-gated API ----------
const api = express.Router();
api.use(auth.requireAuthApi);

api.get('/status', (req, res) => res.json({
  status: tiktok.status,
  demo: demo.isRunning(),
  counters: bus.getCounters(),
}));

api.get('/config', (req, res) => res.json({ config: db.loadConfig() }));
api.put('/config', (req, res) => {
  const patch = (req.body && req.body.config) || {};
  const merged = deepMerge(db.loadConfig(), patch);
  db.saveConfig(merged);
  io.to('overlays').emit('config', merged);
  io.to('dashboard').emit('config', merged);
  res.json({ ok: true, config: merged });
});

api.post('/connect', async (req, res) => {
  const username = (req.body && req.body.username) || db.loadConfig().connection.username;
  const cfg = db.loadConfig();
  cfg.connection.username = username;
  db.saveConfig(cfg);
  await tiktok.connect(username);
  res.json({ ok: true, status: tiktok.status });
});
api.post('/disconnect', (req, res) => {
  tiktok.stop();
  res.json({ ok: true, status: tiktok.status });
});

api.post('/demo/start', (req, res) => { demo.start(); res.json({ ok: true, running: true }); });
api.post('/demo/stop',  (req, res) => { demo.stop();  res.json({ ok: true, running: false }); });
api.post('/demo/fire',  (req, res) => {
  const type = (req.body && req.body.type) || 'follow';
  const ev = demo.fire(type);
  if (!ev) return res.status(400).json({ error: 'unknown event type' });
  res.json({ ok: true, event: ev });
});

api.get('/log', (req, res) => res.json({ log: bus.getLog(200) }));
api.post('/counters/reset', (req, res) => { bus.resetCounters(); res.json({ ok: true }); });

// ---------- Uploads ----------
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
api.post('/uploads', uploadLimiter, (req, res, next) => {
  uploader.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const kind = classify(req.file.mimetype);
    const record = {
      id: path.parse(req.file.filename).name,
      filename: req.file.filename,
      mime: req.file.mimetype,
      size: req.file.size,
      kind,
    };
    db.registerUpload(record);
    res.json({ ok: true, upload: { ...record, url: `/uploads/${req.file.filename}` } });
  });
});
api.get('/uploads', (req, res) => {
  const list = db.listUploads().map(u => ({ ...u, url: `/uploads/${u.filename}` }));
  res.json({ uploads: list });
});
api.delete('/uploads/:id', (req, res) => {
  const row = db.deleteUpload(req.params.id);
  if (row) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, row.filename)); } catch (_e) { /* ignore */ }
    return res.json({ ok: true });
  }
  res.status(404).json({ error: 'not found' });
});

app.use('/api', api);

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  const q = socket.handshake.query || {};
  const room = q.room === 'dashboard' ? 'dashboard' : 'overlays';
  socket.join(room);
  socket.emit('hello', {
    config: db.loadConfig(),
    counters: bus.getCounters(),
    status: tiktok.status,
  });
});

// ---------- Helpers ----------
function deepMerge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (over && typeof over === 'object') {
      for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
    }
    return out;
  }
  return over === undefined ? base : over;
}

// ---------- Boot ----------
const cfg = db.loadConfig();
if (cfg.connection.demoMode || (process.env.DEMO_MODE || 'false') === 'true') {
  demo.start();
}
// Attempt initial TikTok connection in background (non-blocking, fails soft)
tiktok.connect(cfg.connection.username);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`\n  Lobo Live Lab — listening on http://localhost:${PORT}`);
  console.log(`  Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`  Password : ${process.env.DASHBOARD_PASSWORD ? '(set in .env)' : 'Bladestrex (default — change me!)'}\n`);
});
