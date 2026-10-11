// Smoke tests: config + templates + dkim + store + auth (no network).
// Run: npm test
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('config loads with supported provider', () => {
  const config = require('../src/config');
  assert.ok(['console', 'smtp', 'resend', 'sendgrid', 'brevo'].includes(config.provider));
  assert.ok(Number.isInteger(config.port) && config.port > 0);
});

test('templates render OTP with code', () => {
  const { otpTemplate } = require('../src/templates');
  const t = otpTemplate('123456');
  assert.ok(t.subject.length > 0);
  assert.ok(t.text.includes('123456'));
  assert.ok(t.html.includes('123456'));
});

test('dkim sign/verify round-trip + tamper rejection', () => {
  const crypto = require('crypto');
  const dkim = require('../src/dkim');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const raw = [
    'From: ElseMail <no-reply@elsemail.indevs.in>',
    'To: a@b.com',
    'Subject: hi',
    'Message-ID: <x@elsemail.indevs.in>',
    'Date: ' + new Date().toUTCString(),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'hello body',
  ].join('\r\n');
  const sig = dkim.sign(privateKey, 'local', 'elsemail.indevs.in', raw);
  assert.ok(sig.includes('bh=') && sig.includes('b='));
  const signed = raw.replace('\r\n\r\n', '\r\nDKIM-Signature: ' + sig + '\r\n\r\n');
  assert.equal(dkim.verify(signed, () => publicKey).valid, true);
  assert.equal(dkim.verify(signed + 'tampered', () => publicKey).valid, false);
});

test('store OTP + token lifecycle (self-cleaning)', () => {
  const store = require('../src/store');
  const email = 'smoketest-' + Date.now() + '@elsemail.indevs.in';
  store.saveOtp(email, '111111');
  assert.equal(store.checkOtp(email, '000000').ok, false); // wrong
  assert.equal(store.checkOtp(email, '111111').ok, true); // consumes
  assert.equal(store.checkOtp(email, '111111').ok, false); // gone
  const tok = store.issueToken(email, 'verify');
  assert.equal(store.consumeToken(tok, 'reset').ok, false); // type mismatch, kept
  const r = store.consumeToken(tok, 'verify');
  assert.equal(r.ok, true);
  assert.equal(r.email, email);
  assert.equal(store.consumeToken(tok, 'verify').ok, false); // single-use
});

test('auth register/login/change/delete (self-cleaning)', () => {
  const auth = require('../src/auth');
  const email = 'smoketest-' + Date.now() + '@elsemail.indevs.in';
  auth.register(email, 'secret12');
  assert.throws(() => auth.register(email, 'secret12'), /already exists/);
  const sid = auth.login(email, 'secret12');
  assert.ok(typeof sid === 'string' && sid.length >= 32);
  assert.equal(auth.getSession(sid).email, email);
  assert.throws(() => auth.login(email, 'wrongpass'), /do not match/);
  assert.throws(() => auth.changePassword(email, 'wrongpass', 'newpass12'), /incorrect/);
  auth.changePassword(email, 'secret12', 'newpass12');
  assert.throws(() => auth.login(email, 'secret12'), /do not match/); // old gone
  auth.login(email, 'newpass12'); // new works
  auth.logout(sid);
  assert.equal(auth.getSession(sid), null);
  auth.deleteAccount(email);
  assert.throws(() => auth.login(email, 'newpass12'), /do not match/);
});
