// Local account auth (login/signup) - console panel-er jonno.
// Prod-e DB (Postgres/Redis) use koro. File store sudhu single-instance dev.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESS_FILE = path.join(DATA_DIR, 'sessions.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(SESS_FILE)) fs.writeFileSync(SESS_FILE, '{}');

const SESS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 din
function loadSessions() {
  try {
    const d = JSON.parse(fs.readFileSync(SESS_FILE, 'utf8'));
    if (typeof d !== 'object' || d === null) return {};
    const now = Date.now();
    let dirty = false;
    for (const k of Object.keys(d)) {
      if (!d[k] || !d[k].email || (d[k].createdAt || 0) + SESS_TTL_MS < now) { delete d[k]; dirty = true; }
    }
    if (dirty) fs.writeFileSync(SESS_FILE, JSON.stringify(d));
    return d;
  } catch { return {}; }
}
function saveSessions(s) { fs.writeFileSync(SESS_FILE, JSON.stringify(s)); }

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
  if (!isEmail(email)) throw new Error('A valid email address is required.');
  if (typeof password !== 'string' || password.length < 6) throw new Error('Password must be at least 6 characters.');
  const users = loadUsers();
  if (users.find((u) => u.email === email)) throw new Error('An account with this email already exists. Please log in.');
  users.push({ email, pass: hashPass(password), createdAt: new Date().toISOString() });
  saveUsers(users);
  return { email };
}

function login(email, password) {
  email = String(email).toLowerCase().trim();
  const u = loadUsers().find((x) => x.email === email);
  if (!u || !checkPass(password, u.pass)) throw new Error('Email and password do not match.');
  const sid = crypto.randomBytes(32).toString('hex');
  const sessions = loadSessions();
  sessions[sid] = { email, createdAt: Date.now() };
  saveSessions(sessions);
  return sid;
}

function getSession(sid) { if (!sid) return null; return loadSessions()[sid] || null; }

function changePassword(email, currentPassword, newPassword) {
  email = String(email).toLowerCase().trim();
  const users = loadUsers();
  const u = users.find((x) => x.email === email);
  if (!u || !checkPass(String(currentPassword), u.pass)) throw new Error('Current password is incorrect.');
  u.pass = hashPass(newPassword);
  saveUsers(users);
  // logout everywhere: drop all sessions for this email
  const s = loadSessions();
  for (const k of Object.keys(s)) if (s[k] && s[k].email === email) delete s[k];
  saveSessions(s);
  return { email };
}

function deleteAccount(email) {
  email = String(email).toLowerCase().trim();
  saveUsers(loadUsers().filter((x) => x.email !== email));
  const s = loadSessions();
  for (const k of Object.keys(s)) if (s[k] && s[k].email === email) delete s[k];
  saveSessions(s);
  return { email };
}
function logout(sid) { if (!sid) return; const s = loadSessions(); delete s[sid]; saveSessions(s); }

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
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Login required.' });
  res.redirect('/login');
}

const SESS_COOKIE = 'es_sess=SID; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000';

module.exports = { register, login, logout, getSession, changePassword, deleteAccount, sessionAttach, requireSession, SESS_COOKIE };
