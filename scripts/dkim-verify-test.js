/**
 * Verify that nodemailer's built-in DKIM output validates against the
 * DNS-published public key. Run: node scripts/dkim-verify-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { SMTPServer } = require('smtp-server');
const dkim = require('../src/dkim');

const KEY_PATH = path.join(__dirname, 'dkim-private.pem');
const DOMAIN = 'elsemail.indevs.in';
const SELECTOR = 'local';

// capture server
let captured = null;
const capture = new SMTPServer({
  disabledCommands: ['AUTH', 'STARTTLS'],
  logger: false,
  onData(stream, session, cb) {
    let raw = '';
    stream.on('data', (d) => (raw += d));
    stream.on('end', () => {
      captured = raw;
      cb(null);
    });
  },
});

(async () => {
  await new Promise((r) => capture.listen(2525, '127.0.0.1', r));

  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: 2525,
    secure: false,
    ignoreTLS: true,
    dkim: { domainName: DOMAIN, keySelector: SELECTOR, privateKey: fs.readFileSync(KEY_PATH) },
  });

  await transport.sendMail({
    from: 'Elsemail <no-reply@elsemail.indevs.in>',
    to: 'td1tdcosayt1234@gmail.com',
    subject: 'DKIM verification test',
    text: 'Body text for DKIM canonicalisation test.',
    headers: { 'List-Unsubscribe': `<mailto:unsubscribe@${DOMAIN}?subject=unsubscribe>` },
    messageId: `<test-${Date.now()}@${DOMAIN}>`,
  });

  await new Promise((r) => setTimeout(r, 200));

  // fetch the public key exactly as a verifier would — from DNS
  const doh = await fetch('https://dns.google/resolve?name=local._domainkey.elsemail.indevs.in&type=TXT');
  const j = await doh.json();
  const txt = (j.Answer || []).map((a) => a.data).join('');
  const m = txt.match(/p=([^;]+)/);
  if (!m) {
    console.log('FATAL: no p= in DNS record. got:', txt.slice(0, 120));
    process.exit(1);
  }
  const pubB64 = m[1].replace(/\s+/g, '');
  const pem = `-----BEGIN PUBLIC KEY-----\n${pubB64.replace(/(.{64})/g, '$1\n')}\n-----END PUBLIC KEY-----\n`;

  console.log('DKIM-Signature present:', /^DKIM-Signature:/im.test(captured));
  console.log('DNS key length:', pubB64.length);

  const res = dkim.verify(captured, () => pem);
  console.log('VERIFY RESULT:', JSON.stringify(res));
  console.log(res.valid ? '\n✅ DKIM VALID — Gmail will pass it' : '\n❌ DKIM INVALID');

  capture.close();
  process.exit(res.valid ? 0 : 2);
})();
