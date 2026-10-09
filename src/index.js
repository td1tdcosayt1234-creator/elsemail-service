const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const config = require('./config');
const { sendMail, getActiveProvider } = require('./providers');
const { otpTemplate, verifyEmailTemplate, resetPasswordTemplate, welcomeTemplate } = require('./templates');
const { saveOtp, checkOtp, issueToken, consumeToken } = require('./store');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

// ---- Service API-key guard ----
function apiKeyAuth(req, res, next) {
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

app.listen(config.port, () => {
  console.log(`[email-service] http://localhost:${config.port} provider=${getActiveProvider()}`);
  if (!config.serviceApiKey) console.log('[warn] SERVICE_API_KEY empty - API open (dev only). Prod-e key bosao.');
});
