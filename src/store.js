'use strict';
// Persistent OTP + token store (file-backed, restart survive kore).
// Single-instance PC server-er jonno. Multi-instance hole Redis/DB use koro.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OTP_FILE = path.join(DATA_DIR, 'otp.json');
const TOKEN_FILE = path.join(DATA_DIR, 'tokens.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const OTP_TTL_MS = 5 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function load(file) {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof d === 'object' && d !== null ? d : {};
  } catch {
    return {};
  }
}
function save(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}
function prune(obj) {
  const now = Date.now();
  let dirty = false;
  for (const k of Object.keys(obj)) {
    if (!obj[k] || obj[k].expiresAt < now) { delete obj[k]; dirty = true; }
  }
  return dirty;
}

function normEmail(email) { return String(email || '').trim().toLowerCase(); }

function saveOtp(email, code) {
  const otps = load(OTP_FILE);
  otps[normEmail(email)] = { code: String(code).trim(), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 };
  if (prune(otps)) { /* cleaned */ }
  save(OTP_FILE, otps);
}
function checkOtp(email, code) {
  const otps = load(OTP_FILE);
  const key = normEmail(email);
  const rec = otps[key];
  if (!rec) return { ok: false, reason: 'OTP not found. Please request a new one.' };
  if (Date.now() > rec.expiresAt) { delete otps[key]; save(OTP_FILE, otps); return { ok: false, reason: 'OTP expired (5 min). Please request a new one.' }; }
  rec.attempts = (rec.attempts || 0) + 1;
  if (rec.attempts > 5) { delete otps[key]; save(OTP_FILE, otps); return { ok: false, reason: 'Too many attempts. Please request a new OTP.' }; }
  if (rec.code !== String(code).trim()) { save(OTP_FILE, otps); return { ok: false, reason: `OTP does not match (${Math.min(rec.attempts, 5)}/5).` }; }
  delete otps[key];
  save(OTP_FILE, otps);
  return { ok: true };
}

function issueToken(email, type) {
  const tokens = load(TOKEN_FILE);
  const token = crypto.randomBytes(32).toString('hex');
  const ttl = type === 'reset' ? RESET_TTL_MS : VERIFY_TTL_MS;
  tokens[token] = { email: normEmail(email), type, expiresAt: Date.now() + ttl };
  if (prune(tokens)) { /* cleaned */ }
  save(TOKEN_FILE, tokens);
  return token;
}
function consumeToken(token, type) {
  const tokens = load(TOKEN_FILE);
  const rec = tokens[token];
  if (!rec) return { ok: false, reason: 'Invalid token.' };
  if (rec.type !== type) return { ok: false, reason: 'Token type mismatch.' };
  if (Date.now() > rec.expiresAt) { delete tokens[token]; save(TOKEN_FILE, tokens); return { ok: false, reason: 'Token expired.' }; }
  delete tokens[token];
  save(TOKEN_FILE, tokens);
  return { ok: true, email: rec.email };
}

setInterval(() => {
  const otps = load(OTP_FILE);
  if (prune(otps)) save(OTP_FILE, otps);
  const tokens = load(TOKEN_FILE);
  if (prune(tokens)) save(TOKEN_FILE, tokens);
}, 60_000).unref();

module.exports = { saveOtp, checkOtp, issueToken, consumeToken };
