// Local account auth (login/signup) - console panel-er jonno.
// Prod-e DB (Postgres/Redis) use koro. File store sudhu single-instance dev.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

const sessions = new Map(); // sid -> { email, createdAt }

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return []; }
}
function saveUsers(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }

function hashPass(pass, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(pass, salt, 64).toString('hex');
  return `${salt}:${h}`;
}
function checkPass(pass, stored) {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  const h2 = crypto.scryptSync(pass, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), h2);
}
function isEmail(s) { return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

function register(email, password) {
  email = String(email).toLowerCase().trim();
  if (!isEmail(email)) throw new Error('Valid email lagbe.');
  if (typeof password !== 'string' || password.length < 6) throw new Error('Password min 6 char.');
  const users = loadUsers();
  if (users.find((u) => u.email === email)) throw new Error('Ei email diye account ache. Login koro.');
  users.push({ email, pass: hashPass(password), createdAt: new Date().toISOString() });
  saveUsers(users);
  return { email };
}

function login(email, password) {
  email = String(email).toLowerCase().trim();
  const u = loadUsers().find((x) => x.email === email);
  if (!u || !checkPass(password, u.pass)) throw new Error('Email/password milche na.');
  const sid = crypto.randomBytes(32).toString('hex');
  sessions.set(sid, { email, createdAt: Date.now() });
  return sid;
}

function getSession(sid) { return sid ? sessions.get(sid) || null : null; }
function logout(sid) { if (sid) sessions.delete(sid); }

// cookie parse (dep charai)
function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie || '';
  h.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function sessionAttach(req, _res, next) {
  const sid = parseCookies(req).es_sess;
  req.session = getSession(sid);
  req.sid = sid;
  next();
}

function requireSession(req, res, next) {
  if (req.session) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Login lagbe.' });
  res.redirect('/login');
}

const SESS_COOKIE = 'es_sess=SID; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000';

module.exports = { register, login, logout, getSession, sessionAttach, requireSession, SESS_COOKIE };
