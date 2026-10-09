const crypto = require('crypto');

// NOTE: Production-e ei memory store er bodle Redis / DB use koro
// (multiple server instance thakle memory share hoy na).

const otps = new Map();   // email -> { code, expiresAt, attempts }
const tokens = new Map(); // token -> { email, type: 'verify'|'reset', expiresAt }

const OTP_TTL_MS = 5 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function saveOtp(email, code) {
  otps.set(email.toLowerCase(), { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
}
function checkOtp(email, code) {
  const rec = otps.get(email.toLowerCase());
  if (!rec) return { ok: false, reason: 'OTP not found. Abar send koro.' };
  if (Date.now() > rec.expiresAt) { otps.delete(email.toLowerCase()); return { ok: false, reason: 'OTP expired.' }; }
  rec.attempts += 1;
  if (rec.attempts > 5) { otps.delete(email.toLowerCase()); return { ok: false, reason: 'Too many attempts.' }; }
  if (rec.code !== String(code)) return { ok: false, reason: 'OTP milche na.' };
  otps.delete(email.toLowerCase());
  return { ok: true };
}

function issueToken(email, type) {
  const token = crypto.randomBytes(32).toString('hex');
  const ttl = type === 'reset' ? RESET_TTL_MS : VERIFY_TTL_MS;
  tokens.set(token, { email: email.toLowerCase(), type, expiresAt: Date.now() + ttl });
  return token;
}
function consumeToken(token, type) {
  const rec = tokens.get(token);
  if (!rec) return { ok: false, reason: 'Invalid token.' };
  if (rec.type !== type) return { ok: false, reason: 'Token type mismatch.' };
  if (Date.now() > rec.expiresAt) { tokens.delete(token); return { ok: false, reason: 'Token expired.' }; }
  tokens.delete(token);
  return { ok: true, email: rec.email };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otps) if (v.expiresAt < now) otps.delete(k);
  for (const [k, v] of tokens) if (v.expiresAt < now) tokens.delete(k);
}, 60_000).unref();

module.exports = { saveOtp, checkOtp, issueToken, consumeToken };
