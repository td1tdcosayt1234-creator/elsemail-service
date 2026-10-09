// Nijer SMTP provider (local test) - Docker/admin charai chole.
// SMTP : 127.0.0.1:1025  (email-service ekhane pathabe)
// Viewer API : http://localhost:8025/api/mails  +  http://localhost:8025/
// Mail file : ./mails/*.json
//
// Run:  npm run smtp   (alada terminal-e)
//
const fs = require('fs');
const path = require('path');
const http = require('http');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');

const SMTP_PORT = parseInt(process.env.DEV_SMTP_PORT || '1025', 10);
const HTTP_PORT = parseInt(process.env.DEV_SMTP_HTTP || '8025', 10);
const DIR = path.join(__dirname, '..', 'mails');
fs.mkdirSync(DIR, { recursive: true });

const mails = [];

const server = new SMTPServer({
  disabledCommands: ['AUTH'],
  hideSTARTTLS: true, // local dev cert expired issue avoid - plain SMTP
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
        };
        mails.unshift(rec);
        if (mails.length > 200) mails.pop();
        fs.writeFileSync(path.join(DIR, `${rec.id}.json`), JSON.stringify(rec, null, 2));
        console.log(`[dev-smtp] To:${rec.to} Subj:${rec.subject}`);
        cb(null);
      } catch (e) {
        console.error('[dev-smtp] parse error:', e.message);
        cb(e);
      }
    });
  },
});

server.listen(SMTP_PORT, '127.0.0.1', () => {
  console.log(`[dev-smtp] SMTP listening on 127.0.0.1:${SMTP_PORT} (nijer provider)`);
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
          <b>${esc(m.subject)}</b><br><small>${esc(m.time)} | To: ${esc(m.to)} | From: ${esc(m.from)}</small>
          <pre style="white-space:pre-wrap;background:#f6f6f6;padding:8px;">${esc(m.text.slice(0, 800))}</pre></div>`
      )
      .join('') || '<p style="padding:20px;">Ekhono kono mail aseni. email-service theke send koro.</p>';
    res.end(`<html><body style="font-family:Arial;max-width:800px;margin:auto;">
      <h2>Nijer SMTP inbox (dev)</h2><p><a href="/api/mails">JSON API</a></p>${rows}</body></html>`);
  })
  .listen(HTTP_PORT, () => console.log(`[dev-smtp] Inbox: http://localhost:${HTTP_PORT}/`));

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
