// Dashboard auth: simple password + signed cookie. Overlay pages are public
// (they need to load in OBS with no login).
const crypto = require('crypto');

const COOKIE_NAME = 'lobo_lab_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  return process.env.SESSION_SECRET || 'lobo-lab-fallback-secret-change-me';
}

function sign(value) {
  const mac = crypto.createHmac('sha256', secret()).update(value).digest('hex');
  return `${value}.${mac}`;
}
function verify(signed) {
  if (!signed || typeof signed !== 'string') return null;
  const idx = signed.lastIndexOf('.');
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expect = crypto.createHmac('sha256', secret()).update(value).digest('hex');
  const a = Buffer.from(mac, 'hex');
  const b = Buffer.from(expect, 'hex');
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? value : null;
}

function issueCookie(res) {
  const token = sign(`ok:${Date.now()}`);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
  });
}
function clearCookie(res) {
  res.clearCookie(COOKIE_NAME);
}
function isAuthed(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const value = verify(token);
  if (!value) return false;
  const [flag, tsStr] = value.split(':');
  if (flag !== 'ok') return false;
  const ts = parseInt(tsStr, 10);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < MAX_AGE_MS;
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  if (req.accepts('html')) return res.redirect('/login');
  return res.status(401).json({ error: 'unauthorized' });
}
function requireAuthApi(req, res, next) {
  if (isAuthed(req)) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

function checkPassword(pw) {
  const expected = process.env.DASHBOARD_PASSWORD || 'Bladestrex';
  if (!pw || typeof pw !== 'string') return false;
  const a = Buffer.from(pw);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { issueCookie, clearCookie, isAuthed, requireAuth, requireAuthApi, checkPassword, COOKIE_NAME };
