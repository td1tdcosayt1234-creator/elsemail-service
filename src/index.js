const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const { sendMail, getActiveProvider } = require('./providers');
const { otpTemplate, verifyEmailTemplate, resetPasswordTemplate, welcomeTemplate } = require('./templates');
const { saveOtp, checkOtp, issueToken, consumeToken } = require('./store');
const auth = require('./auth');

const app = express();
app.set('trust proxy', 1); // Cloudflare Tunnel-এর পেছনে, rate-limit সঠিক IP দেখবে
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '12mb' })); // attachments (base64) allow kore
app.use(auth.sessionAttach);

// ---- Service API-key guard (console login thakleo cholbe) ----
function apiKeyAuth(req, res, next) {
  if (config.tempOpen) return next(); // TEMP: login off
  if (req.session) return next();
  if (!config.serviceApiKey) return next(); // dev mode: open
  const got = req.header('x-api-key');
  if (got !== config.serviceApiKey) return res.status(401).json({ error: 'Invalid x-api-key' });
  next();
}

// ---- Rate limits (abuse rodh, JSON errors) ----
const limitHandler = (_req, res) => res.status(429).json({ ok: false, error: 'Too many requests. Please try again in a minute.' });
const sendLimiter = rateLimit({ windowMs: 60_000, max: 20, handler: limitHandler, standardHeaders: true });
const otpLimiter = rateLimit({ windowMs: 60_000, max: 10, handler: limitHandler, standardHeaders: true });
const verifyLimiter = rateLimit({ windowMs: 60_000, max: 30, handler: limitHandler, standardHeaders: true });

// ---- Request log (method host path status ms) ----
const startedAt = Date.now();
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    if (req.path === '/health') return; // health noise off
    console.log(`[api] ${req.method} ${req.hostname}${req.path} -> ${res.statusCode} ${Date.now() - t}ms`);
  });
  next();
});

function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
const em = (v) => String(v || '').trim();

// ---- Host split: api.* = API only, main site = pages/console ----
app.use((req, res, next) => {
  const host = String(req.hostname || '').toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (isLocal) return next(); // dev: everything open locally
  const isApi = host === 'api.elsemail.indevs.in' || host.startsWith('api.');
  const p = req.path || '/';
  const apiPath = p.startsWith('/api/') || p === '/health' || p.startsWith('/.well-known/');
  if (isApi && !apiPath) {
    return res.status(404).json({ ok: false, error: 'API host. Pages live at https://elsemail.indevs.in' });
  }
  if (!isApi && p.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'API moved to https://api.elsemail.indevs.in' });
  }
  next();
});

// ---------- Public ----------
app.get('/health', (req, res) => {
  res.json({ ok: true, provider: getActiveProvider(), app: config.appName, uptimeSec: Math.floor((Date.now() - startedAt) / 1000), time: new Date().toISOString() });
});

// ---------- Auth probe (integrators: key/session status check) ----------
app.get('/api/auth/check', (req, res) => {
  if (config.tempOpen) return res.json({ ok: true, mode: 'open', note: 'TEMP_OPEN: auth disabled for testing.' });
  if (req.session) return res.json({ ok: true, mode: 'session', email: req.session.email });
  if (!config.serviceApiKey) return res.json({ ok: true, mode: 'open', note: 'No SERVICE_API_KEY set.' });
  if (req.header('x-api-key') === config.serviceApiKey) return res.json({ ok: true, mode: 'key' });
  res.status(401).json({ ok: false, mode: 'none', error: 'Invalid or missing x-api-key.' });
});

// ---------- Generic send ----------
const MAIL_DOMAIN = process.env.MAIL_DOMAIN || 'elsemail.indevs.in';
// Owner-er official addresses - shudhu egulo theke pathano jabe (spoof rodh)
const FROM_LOCALS = ['no-reply', 'hello', 'support', 'partnership', 'report'];
function parseFrom(v) {
  if (v === undefined || v === null || v === '') return undefined; // default EMAIL_FROM
  const s = String(v).trim();
  const m = s.match(/^(?:.*<)?([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+)>?$/);
  if (!m || m[2].toLowerCase() !== MAIL_DOMAIN.toLowerCase()) {
    return { error: `Only these senders are allowed: ${FROM_LOCALS.map((l) => l + '@' + MAIL_DOMAIN).join(', ')}` };
  }
  const local = m[1].toLowerCase();
  if (!FROM_LOCALS.includes(local)) {
    return { error: `Only these senders are allowed: ${FROM_LOCALS.map((l) => l + '@' + MAIL_DOMAIN).join(', ')}` };
  }
  return { from: `${local === 'no-reply' ? 'ElseMail' : local[0].toUpperCase() + local.slice(1)} <${local}@${MAIL_DOMAIN}>` };
}
// ---- Attachments: [{filename, content (base64), contentType?}] max 5 files, 5MB each ----
function parseAttachments(v) {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new Error('"attachments" must be an array.');
  if (v.length > 5) throw new Error('Max 5 attachments per mail.');
  return v.map((a, i) => {
    const name = String((a && a.filename) || '').split(/[\\/]/).pop().trim();
    if (!name || name.length > 120) throw new Error(`Attachment #${i + 1}: valid filename required.`);
    const b64 = String((a && a.content) || '').replace(/\s+/g, '');
    if (!b64 || b64.length > 7 * 1024 * 1024) throw new Error(`Attachment "${name}": empty or over 5MB.`);
    if (!/^[A-Za-z0-9+/=]+$/.test(b64)) throw new Error(`Attachment "${name}": content must be base64.`);
    const size = Math.floor(b64.length * 3 / 4);
    if (size > 5 * 1024 * 1024) throw new Error(`Attachment "${name}": over 5MB.`);
    return { filename: name, contentBase64: b64, contentType: String((a && a.contentType) || 'application/octet-stream').slice(0, 120) };
  });
}
app.post('/api/mail/send', apiKeyAuth, sendLimiter, async (req, res) => {
  try {
    const { subject, html, text } = req.body || {};
    const to = em(req.body && req.body.to);
    if (!isEmail(to)) return res.status(400).json({ error: 'A valid "to" email address is required.' });
    if (!subject || (!html && !text)) return res.status(400).json({ error: '"subject" and "html" or "text" are required.' });
    if (String(subject).length > 500) return res.status(400).json({ error: '"subject" must be under 500 characters.' });
    if ((html && String(html).length > 2000000) || (text && String(text).length > 2000000)) {
      return res.status(400).json({ error: '"html"/"text" must be under 2MB.' });
    }
    const f = parseFrom(req.body && req.body.from);
    if (f && f.error) return res.status(400).json({ error: f.error });
    let atts;
    try { atts = parseAttachments(req.body && req.body.attachments); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const r = await sendMail({ to, subject, html, text, from: f && f.from, attachments: atts });
    res.json({ ok: true, ...r, from: (f && f.from) || undefined });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ---------- Full auth mail kit ----------
app.post('/api/auth/send-otp', apiKeyAuth, otpLimiter, async (req, res) => {
  try {
    const email = em(req.body && req.body.email);
    if (!isEmail(email)) return res.status(400).json({ error: 'A valid email address is required.' });
    const code = String(crypto.randomInt(100000, 999999));
    saveOtp(email, code);
    const t = otpTemplate(code);
    const r = await sendMail({ to: email, ...t });
    res.json({ ok: true, ...r, note: 'OTP 5 min valid.' });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.post('/api/auth/verify-otp', apiKeyAuth, otpLimiter, (req, res) => {
  const email = em(req.body && req.body.email);
  const code = em(req.body && req.body.code);
  if (!isEmail(email) || !code) return res.status(400).json({ error: '"email" and "code" are required.' });
  const r = checkOtp(email, code);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.reason });
  res.json({ ok: true, email });
});

app.post('/api/auth/request-email-verification', apiKeyAuth, sendLimiter, async (req, res) => {
  try {
    const email = em(req.body && req.body.email);
    if (!isEmail(email)) return res.status(400).json({ error: 'A valid email address is required.' });
    const token = issueToken(email, 'verify');
    const link = `${config.frontendUrl}/verify-email?token=${token}`;
    const t = verifyEmailTemplate(link);
    const r = await sendMail({ to: email, ...t });
    // token frontend-er maddhome verify hobe; testing-er jonno response-e pathiye dilam
    res.json({ ok: true, ...r, token, link });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.get('/api/auth/verify-email', verifyLimiter, async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.status(400).json({ error: 'A "token" is required.' });
  const r = consumeToken(String(token), 'verify');
  if (!r.ok) return res.status(400).json({ ok: false, error: r.reason });
  // ekhane DB-te user.verified=true koro
  res.json({ ok: true, email: r.email });
});

app.post('/api/auth/request-password-reset', apiKeyAuth, sendLimiter, async (req, res) => {
  try {
    const email = em(req.body && req.body.email);
    if (!isEmail(email)) return res.status(400).json({ error: 'A valid email address is required.' });
    const token = issueToken(email, 'reset');
    const link = `${config.frontendUrl}/reset-password?token=${token}`;
    const t = resetPasswordTemplate(link);
    const r = await sendMail({ to: email, ...t });
    res.json({ ok: true, ...r, token, link, note: 'Security: whether the user exists is never revealed (always ok).' });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.post('/api/auth/reset-password', apiKeyAuth, verifyLimiter, async (req, res) => {
  const token = String((req.body || {}).token || '').trim();
  const { newPassword } = req.body || {};
  if (!token || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'A "token" and "newPassword" (min 6 characters) are required.' });
  }
  const r = consumeToken(String(token), 'reset');
  if (!r.ok) return res.status(400).json({ ok: false, error: r.reason });
  // ekhane DB-te password hash kore save koro (bcrypt). Ei service sudhu mail+token dey.
  res.json({ ok: true, email: r.email, note: 'Token is valid. Now update the password in your main app.' });
});

app.post('/api/auth/welcome', apiKeyAuth, sendLimiter, async (req, res) => {
  try {
    const { name } = req.body || {};
    const email = em(req.body && req.body.email);
    if (!isEmail(email)) return res.status(400).json({ error: 'A valid email address is required.' });
    const t = welcomeTemplate(name);
    const r = await sendMail({ to: email, ...t });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ---------- Account (login/signup) ----------
const authLimiter = rateLimit({ windowMs: 60_000, max: 20, handler: limitHandler, standardHeaders: true });
app.post('/api/account/register', authLimiter, (req, res) => {
  try {
    const { email, password } = req.body || {};
    const u = auth.register(email, password);
    const sid = auth.login(email, password);
    res.setHeader('Set-Cookie', auth.SESS_COOKIE.replace('SID', sid));
    res.json({ ok: true, email: u.email });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.post('/api/account/login', authLimiter, (req, res) => {
  try {
    const { email, password } = req.body || {};
    const sid = auth.login(email, password);
    res.setHeader('Set-Cookie', auth.SESS_COOKIE.replace('SID', sid));
    res.json({ ok: true });
  } catch (e) { res.status(401).json({ ok: false, error: e.message }); }
});
app.post('/api/account/logout', (req, res) => {
  auth.logout(req.sid);
  res.setHeader('Set-Cookie', 'es_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});
app.post('/api/account/change-password', authLimiter, (req, res) => {
  try {
    if (!req.session) return res.status(401).json({ ok: false, error: 'Login required.' });
    const { currentPassword, newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    auth.changePassword(req.session.email, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.delete('/api/account', authLimiter, (req, res) => {
  try {
    if (!req.session) return res.status(401).json({ ok: false, error: 'Login required.' });
    auth.deleteAccount(req.session.email);
    auth.logout(req.sid);
    res.setHeader('Set-Cookie', 'es_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.get('/api/account/me', (req, res) => {
  if (!req.session) return res.status(401).json({ error: 'Login required.' });
  res.json({ ok: true, email: req.session.email });
});

// ---------- Mail delivery status (by Message-ID from send response) ----------
app.get('/api/mail/status', apiKeyAuth, (req, res) => {
  try {
    const id = String(req.query.messageId || '').trim();
    if (!id) return res.status(400).json({ error: '"messageId" query param is required.' });
    const dir = path.join(__dirname, '..', 'mails');
    if (!fs.existsSync(dir)) return res.json({ ok: true, found: false });
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    files.sort().reverse();
    for (const f of files.slice(0, 200)) {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (m.messageId === id || m.id === id) {
          return res.json({ ok: true, found: true, to: m.to, subject: m.subject, status: m.status, time: m.time });
        }
      } catch (_) { /* skip bad file */ }
    }
    res.json({ ok: true, found: false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Console inbox (local mails/ folder) ----------
app.get('/api/console/mails', apiKeyAuth, (req, res) => {
  try {
    const dir = path.join(__dirname, '..', 'mails');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).slice(-50).reverse();
    const out = [];
    for (const f of files) {
      try { out.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); }
      catch (_) { /* skip corrupt file */ }
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Pages (React TSX app) ----------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/app', express.static(path.join(__dirname, '..', 'public', 'app')));
const APP_HTML = path.join(__dirname, '..', 'public', 'app', 'index.html');
const maybeLogin = (req, res, next) => (config.tempOpen ? next() : auth.requireSession(req, res, next));
for (const route of ['/', '/login', '/signup', '/docs', '/privacy', '/terms', '/console', '/verify-email', '/reset-password']) {
  app.get(route, (req, res, next) => {
    if (route === '/console') return maybeLogin(req, res, () => res.sendFile(APP_HTML));
    res.sendFile(APP_HTML);
  });
}

// ---------- MTA-STS policy (RFC 8461) ----------
// Declared at _mta-sts.<domain> TXT; policy served at https://mta-sts.<domain>/.well-known/mta-sts.txt
// Lets senders to our domain enforce TLS and report failures via TLSRPT.
app.get('/.well-known/mta-sts.txt', (_req, res) => {
  const policy = [
    'version: STSv1',
    'mode: enforce',
    'mx: elsemail.indevs.in',
    'max_age: 604800',
  ].join('\n');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'max-age=86400');
  res.send(policy + '\n');
});

// JSON error handler (bad JSON-e HTML stack na, clean JSON)
app.use((err, _req, res, _next) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body.' });
  }
  res.status(500).json({ ok: false, error: (err && err.message) || 'Server error' });
});

app.listen(config.port, () => {
  console.log(`[email-service] http://localhost:${config.port} provider=${getActiveProvider()}`);
  if (!config.serviceApiKey) console.log('[warn] SERVICE_API_KEY empty - API open (dev only). Prod-e key bosao.');
});
