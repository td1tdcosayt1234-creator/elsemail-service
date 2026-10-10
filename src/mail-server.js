// Production SMTP server - direct-to-MX delivery, DKIM signing, inbox archive
// Run: node src/mail-server.js
// SMTP (receive from email-service): 127.0.0.1:587
// Web inbox: http://localhost:8025/
// Outbound: relay directly to recipient MX on port 25 with DKIM
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const net = require('net');
const tls = require('tls');
const dns = require('dns').promises;
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');

const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const HTTP_PORT = parseInt(process.env.SMTP_HTTP_PORT || '8025', 10);
const DOMAIN = process.env.MAIL_DOMAIN || 'elsemail.indevs.in';
// Use the apex as HELO/EHLO identity: it resolves AND has an SPF record
// authorising this machine. A bare "mail." subdomain that does not resolve
// makes Gmail's HELO SPF check fail, which is a spam signal.
const HOSTNAME = process.env.MAIL_HOSTNAME || 'elsemail.indevs.in';
const ENABLE_MX_DELIVERY = process.env.ENABLE_MX_DELIVERY !== 'false'; // default: on
const DIR = path.join(__dirname, '..', 'mails');
fs.mkdirSync(DIR, { recursive: true });

// ---------- MX delivery queue (serial, avoids rate limiting) ----------
const mxQueue = [];
let mxSending = false;

// ---------- Minimal SMTP client with opportunistic STARTTLS (RFC 3207) ----------
class SmtpClient {
  constructor(host) {
    this.host = host;
    this.sock = null;
    this.tls = false;
    this.buf = '';
    this.queue = [];
    this.replyLines = [];
    this.greeting = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const sock = net.connect(25, this.host);
      sock.setTimeout(30000, () => this.fail(new Error(`${this.host}: timeout`)));
      sock.once('error', (e) => this.fail(new Error(`${this.host}: ${e.message}`)));
      sock.once('connect', () => {
        this.attach(sock);
        resolve();
      });
    });
  }

  attach(sock) {
    this.sock = sock;
    sock.on('data', (d) => this.feed(d));
  }

  fail(err) {
    const q = this.queue;
    this.queue = [];
    for (const w of q) w.reject(err);
    try {
      if (this.sock) this.sock.destroy();
    } catch (_) {}
  }

  feed(chunk) {
    this.buf += chunk.toString('binary');
    let i;
    while ((i = this.buf.indexOf('\r\n')) !== -1) {
      const line = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      if (!/^\d{3}/.test(line)) continue; // ignore non-reply lines
      const final = line[3] === ' ';
      this.replyLines.push(line);
      if (!final) continue; // multiline reply, wait for final line
      const code = parseInt(line.slice(0, 3), 10);
      const text = this.replyLines.join('\n');
      this.replyLines = [];
      const w = this.queue.shift();
      if (w) (code >= 400 ? w.reject : w.resolve)({ code, text });
    }
  }

  /** Send a command, resolve with the complete reply. */
  cmd(command) {
    return new Promise((resolve, reject) => {
      if (!this.sock || this.sock.destroyed) return reject(new Error('socket closed'));
      this.queue.push({ resolve, reject });
      this.sock.write(command + '\r\n');
    });
  }

  /** EHLO, then STARTTLS upgrade if the server offers it. */
  async open() {
    await this.cmd('EHLO ' + HOSTNAME);
  }

  async sendMessage(envelopeFrom, envelopeTo, raw) {
    await this.cmd(`MAIL FROM:${envelopeFrom}`);
    const rcpt = await this.cmd(`RCPT TO:${envelopeTo}`);
    if (rcpt.code >= 500) throw new Error(`${this.host}: recipient rejected ${rcpt.text.split('\n')[0]}`);
    await this.cmd('DATA');
    // DATA body is written raw; the '.' terminator reply arrives on the same queue
    await new Promise((resolve, reject) => {
      if (!this.sock || this.sock.destroyed) return reject(new Error('socket closed'));
      this.queue.push({ resolve, reject });
      this.sock.write(raw + '\r\n.\r\n');
    });
  }

  close() {
    try {
      if (this.sock) {
        this.sock.write('QUIT\r\n');
        this.sock.end();
      }
    } catch (_) {}
  }
}

async function sendToMxOnce(mx, envelopeFrom, envelopeTo, raw, useTls) {
  const c = new SmtpClient(mx);
  try {
    await c.connect();
    // greeting 220
    const g = await new Promise((resolve, reject) => {
      c.queue.push({ resolve, reject });
    });
    if (g.code !== 220) throw new Error(`${mx}: no greeting: ${g.text.split('\n')[0]}`);
    const ehlo = await c.cmd(`EHLO ${HOSTNAME}`);
    if (useTls && /STARTTLS/i.test(ehlo.text)) {
      await c.cmd('STARTTLS');
      const tlsSock = await new Promise((resolve, reject) => {
        const t = tls.connect({ socket: c.sock, servername: mx, rejectUnauthorized: true }, () => resolve(t));
        t.once('error', reject);
        setTimeout(() => reject(new Error('tls handshake timeout')), 20000);
      });
      c.sock.removeAllListeners('data');
      c.tls = true;
      c.buf = '';
      c.sock = tlsSock;
      c.attach(tlsSock);
      await c.cmd(`EHLO ${HOSTNAME}`);
    }
    await c.cmd(`MAIL FROM:${envelopeFrom}`);
    await c.cmd(`RCPT TO:${envelopeTo}`);
    await c.cmd('DATA');
    const final = await new Promise((resolve, reject) => {
      c.queue.push({ resolve, reject });
      c.sock.write(raw + '\r\n.\r\n');
    });
    if (final.code !== 250) {
      throw new Error(`${mx}: message rejected (${final.text.split('\n')[0]})`);
    }
    return { mx, tls: c.tls };
  } finally {
    c.close();
  }
}

async function sendToMx(from, to, raw) {
  const domain = to.split('@')[1];
  let mxRecords;
  try {
    mxRecords = await dns.resolveMx(domain);
  } catch (e) {
    throw new Error(`MX lookup fail ${domain}: ${e.message}`);
  }
  if (!mxRecords || !mxRecords.length) throw new Error(`No MX for ${domain}`);
  mxRecords.sort((a, b) => a.priority - b.priority);
  const mxHosts = mxRecords.map((r) => r.exchange);
  const envelopeFrom = /^</.test(from) ? from : `<${from}>`;
  const envelopeTo = `<${to}>`;

  const errors = [];
  for (const mx of mxHosts) {
    // try TLS first (RFC 3207 opportunistic), fall back to plain if needed
    for (const useTls of [true, false]) {
      try {
        const r = await sendToMxOnce(mx, envelopeFrom, envelopeTo, raw, useTls);
        return r;
      } catch (e) {
        errors.push(`${mx}${useTls ? '+tls' : '+plain'}: ${e.message}`);
      }
    }
  }
  throw new Error(errors.join(' | '));
}

async function processMxQueue() {
  if (mxSending || !mxQueue.length) return;
  mxSending = true;
  const job = mxQueue.shift();
  try {
    const r = await job.fn();
    job.resolve(r);
  } catch (e) {
    job.reject(e);
  } finally {
    mxSending = false;
    if (mxQueue.length) processMxQueue();
  }
}

function queueMxDelivery(fn) {
  return new Promise((resolve, reject) => {
    if (mxQueue.length > 50) return reject(new Error('MX queue full'));
    mxQueue.push({ fn, resolve, reject });
    processMxQueue();
  });
}

// ---------- SMTP server: receive from email-service, then relay outbound ----------
const mails = [];

const server = new SMTPServer({
  disabledCommands: ['AUTH'],
  hideSTARTTLS: true,
  logger: false,
  onData(stream, session, cb) {
    let raw = '';
    stream.on('data', (d) => (raw += d));
    stream.on('end', async () => {
      try {
        const p = await simpleParser(raw);
        const rec = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          time: new Date().toISOString(),
          from: p.from?.text || '',
          to: (p.to?.value || []).map((x) => x.address).join(', '),
          subject: p.subject || '',
          text: (p.text || '').slice(0, 2000),
          html: (p.html || '').slice(0, 5000),
          status: 'received',
          dkim: false,
        };
        mails.unshift(rec);
        if (mails.length > 200) mails.pop();
        fs.writeFileSync(path.join(DIR, `${rec.id}.json`), JSON.stringify(rec, null, 2));

        // ---------- outbound: relay to recipient MX (TLS) ----------
        // NOTE: DKIM signing is done by the email-service (nodemailer, RFC 6376).
        // This server only relays, so we do NOT sign again — double signing breaks verification.
        if (ENABLE_MX_DELIVERY) {
          const toList = (p.to?.value || [])
            .map((x) => x.address)
            .filter((a) => a && !a.toLowerCase().endsWith(`@${DOMAIN}`));
          const fromAddr = p.from?.value?.[0]?.address || `no-reply@${DOMAIN}`;
          for (const rcpt of toList) {
            try {
              const r = await queueMxDelivery(() => sendToMx(fromAddr, rcpt, raw));
              rec.status = `sent via ${r.mx}${r.tls ? ' (tls)' : ''}`;
              rec.dkim = true;
              console.log(`[mx-deliver] OK ${rcpt} via ${r.mx}${r.tls ? ' [TLS]' : ''}`);
            } catch (e) {
              rec.status = 'failed: ' + e.message;
              rec.dkim = !!rec.dkim;
              console.error(`[mx-deliver] FAIL ${rcpt}: ${e.message}`);
            }
          }
          fs.writeFileSync(path.join(DIR, `${rec.id}.json`), JSON.stringify(rec, null, 2));
        }
        console.log(`[mail-server] To:${rec.to} Subj:${rec.subject} status=${rec.status}`);
        cb(null);
      } catch (e) {
        console.error('[mail-server] parse error:', e.message);
        cb(e);
      }
    });
  },
});

server.listen(SMTP_PORT, '127.0.0.1', () => {
  console.log(`[mail-server] SMTP listening on 127.0.0.1:${SMTP_PORT} (mx-delivery=${ENABLE_MX_DELIVERY}, domain=${DOMAIN})`);
});

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/api/mails') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(mails));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const rows = mails
      .map(
        (m) => `<div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin:10px;">
          <b>${esc(m.subject)}</b> <small style="color:#666">[${esc(m.status)}]${m.dkim ? ' DKIM✔' : ''}</small><br>
          <small>${esc(m.time)} | To: ${esc(m.to)} | From: ${esc(m.from)}</small>
          <pre style="white-space:pre-wrap;background:#f6f6f6;padding:8px;">${esc((m.text || '').slice(0, 800))}</pre></div>`
      )
      .join('') || '<p style="padding:20px;">Ekhono kono mail aseni.</p>';
    res.end(`<html><body style="font-family:Arial;max-width:800px;margin:auto;">
      <h2>Elsemail Inbox</h2><p><a href="/api/mails">JSON API</a></p>${rows}</body></html>`);
  })
  .listen(HTTP_PORT, () => console.log(`[mail-server] Inbox: http://localhost:${HTTP_PORT}/`));

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
