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
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(auth.sessionAttach);

// ---- Service API-key guard (console login thakleo cholbe) ----
function apiKeyAuth(req, res, next) {
  if (req.session) return next();
  if (!config.serviceApiKey) return next(); // dev mode: open
  const got = req.header('x-api-key');
  if (got !== config.serviceApiKey) return res.status(401).json({ error: 'Invalid x-api-key' });
  next();
}

// ---- Rate limits (abuse rodh) ----
const sendLimiter = rateLimit({ windowMs: 60_000, max: 20 });
const otpLimiter = rateLimit({ windowMs: 60_000, max: 10 });

function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// ---------- Public ----------
app.get('/health', (req, res) => {
  res.json({ ok: true, provider: getActiveProvider(), app: config.appName, time: new Date().toISOString() });
});

// ---------- Generic send ----------
app.post('/api/mail/send', apiKeyAuth, sendLimiter, async (req, res) => {
  try {
    const { to, subject, html, text } = req.body || {};
    if (!isEmail(to)) return res.status(400).json({ error: 'Valid "to" email lagbe.' });
    if (!subject || (!html && !text)) return res.status(400).json({ error: 'subject + html/text lagbe.' });
    const r = await sendMail({ to, subject, html, text });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ---------- Full auth mail kit ----------
app.post('/api/auth/send-otp', apiKeyAuth, otpLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ error: 'Valid email lagbe.' });
    const code = String(crypto.randomInt(100000, 999999));
    saveOtp(email, code);
    const t = otpTemplate(code);
    const r = await sendMail({ to: email, ...t });
    res.json({ ok: true, ...r, note: 'OTP 5 min valid (dev-e terminal-eo dekhabe).' });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.post('/api/auth/verify-otp', apiKeyAuth, otpLimiter, (req, res) => {
  const { email, code } = req.body || {};
  if (!isEmail(email) || !code) return res.status(400).json({ error: 'email + code lagbe.' });
  const r = checkOtp(email, code);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.reason });
  res.json({ ok: true, email });
});

app.post('/api/auth/request-email-verification', apiKeyAuth, sendLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ error: 'Valid email lagbe.' });
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

app.get('/api/auth/verify-email', async (req, res) => {
  const { token } = req.query || {};
  if (!token) return res.status(400).json({ error: 'token lagbe.' });
  const r = consumeToken(String(token), 'verify');
  if (!r.ok) return res.status(400).json({ ok: false, error: r.reason });
  // ekhane DB-te user.verified=true koro
  res.json({ ok: true, email: r.email });
});

app.post('/api/auth/request-password-reset', apiKeyAuth, sendLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ error: 'Valid email lagbe.' });
    const token = issueToken(email, 'reset');
    const link = `${config.frontendUrl}/reset-password?token=${token}`;
    const t = resetPasswordTemplate(link);
    const r = await sendMail({ to: email, ...t });
    res.json({ ok: true, ...r, token, link, note: 'Security: user exist kore kina bojha jabe na (ekhane sobsomoy ok).' });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.post('/api/auth/reset-password', apiKeyAuth, async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'token + min 6 char newPassword lagbe.' });
  }
  const r = consumeToken(String(token), 'reset');
  if (!r.ok) return res.status(400).json({ ok: false, error: r.reason });
  // ekhane DB-te password hash kore save koro (bcrypt). Ei service sudhu mail+token dey.
  res.json({ ok: true, email: r.email, note: 'Token valid. Ekhon tomar main app-e password update koro.' });
});

app.post('/api/auth/welcome', apiKeyAuth, sendLimiter, async (req, res) => {
  try {
    const { email, name } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ error: 'Valid email lagbe.' });
    const t = welcomeTemplate(name);
    const r = await sendMail({ to: email, ...t });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ---------- Account (login/signup) ----------
const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
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
app.get('/api/account/me', (req, res) => {
  if (!req.session) return res.status(401).json({ error: 'Login lagbe.' });
  res.json({ ok: true, email: req.session.email });
});

// ---------- Console inbox (local mails/ folder) ----------
app.get('/api/console/mails', apiKeyAuth, (req, res) => {
  try {
    const dir = path.join(__dirname, '..', 'mails');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).slice(-50).reverse();
    res.json(files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Pages ----------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'login.html')));
app.get('/signup', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'signup.html')));
app.get('/docs', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'docs.html')));
app.get('/privacy', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'privacy.html')));
app.get('/terms', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'terms.html')));
app.get('/console', auth.requireSession, (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'console.html')));

// ---------- MTA-STS policy (RFC 8461) ----------
// Declared at _mta-sts.<domain> TXT; policy served at https://mta-sts.<domain>/.well-known/mta-sts.txt
// Lets senders to our domain enforce TLS and report failures via TLSRPT.
app.get('/.well-known/mta-sts.txt', (_req, res) => {
  const stsId = process.env.MTA_STS_ID || '2026101001';
  const policy = [
    'version: STSv1',
    'mode: enforce',
    'mx: elsemail.indevs.in',
    'mx: alt.elsemail.indevs.in',
    'max_age: 604800',
  ].join('\n');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'max-age=86400');
  res.send(policy + '\n');
});

app.listen(config.port, () => {
  console.log(`[email-service] http://localhost:${config.port} provider=${getActiveProvider()}`);
  if (!config.serviceApiKey) console.log('[warn] SERVICE_API_KEY empty - API open (dev only). Prod-e key bosao.');
});
