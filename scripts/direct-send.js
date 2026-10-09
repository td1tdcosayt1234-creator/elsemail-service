// Direct-to-MX sender (kono third-party chara, local thekei Gmail-e).
// v2: STARTTLS + DKIM + List-Unsubscribe
// Usage: node scripts/direct-send.js "to@mail.com" "Subject" "body text"
const net = require('net');
const tls = require('tls');
const dns = require('dns').promises;
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FROM = 'no-reply@elsemail.indevs.in';
const DKIM_DOMAIN = 'elsemail.indevs.in';
const DKIM_SELECTOR = 'local';

function relaxedHeader(name, value) {
  return name.toLowerCase() + ':' + String(value).replace(/\r\n\s+/g, ' ').replace(/\s+/g, ' ').trim();
}

function dkimSign(headers, body) {
  const keyPath = path.join(__dirname, 'dkim-private.pem');
  if (!fs.existsSync(keyPath)) return null;
  const privateKey = fs.readFileSync(keyPath, 'utf8');
  const canonBody = body.length === 0 ? '\r\n' : body.replace(/\r\n$/, '') + '\r\n';
  const bh = crypto.createHash('sha256').update(canonBody, 'utf8').digest('base64');
  const t = Math.floor(Date.now() / 1000);
  const hNames = headers.map(([n]) => n.toLowerCase());
  const dkimValue =
    `v=1; a=rsa-sha256; c=relaxed/simple; d=${DKIM_DOMAIN}; s=${DKIM_SELECTOR}; t=${t};` +
    ` bh=${bh}; h=${hNames.join(':')}; b=`;
  const signing = headers.map(([n, v]) => relaxedHeader(n, v)).join('\r\n') +
    '\r\n' + relaxedHeader('DKIM-Signature', dkimValue);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signing, 'utf8'), privateKey).toString('base64');
  return `DKIM-Signature: ${dkimValue}${sig.replace(/.{75}/g, '$&\r\n ')}`;
}

function openPlain(host) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port: 25, timeout: 20000 });
    s.once('connect', () => resolve(s));
    s.once('error', reject);
  });
}

// multiline SMTP reply poro (shesh line: "250 " space diye)
function makeReader() {
  let buf = '';
  let waiter = null;
  return {
    feed(chunk) {
      buf += chunk.toString('binary');
      this.pump();
    },
    pump() {
      if (!waiter) return;
      const lines = buf.split('\r\n');
      if (buf.endsWith('\r\n')) buf = '';
      else buf = lines.pop();
      const out = [];
      for (const ln of lines) {
        if (ln === '') continue; // khali line reply-er ongsho na
        out.push(ln);
        const m = ln.match(/^(\d{3})([ -])/);
        if (m && m[2] === ' ') {
          const full = out.join('\r\n');
          out.length = 0;
          const w = waiter; waiter = null;
          w(full);
        }
      }
      if (out.length) buf = out.join('\r\n') + '\r\n' + buf;
    },
    read() {
      return new Promise((resolve, reject) => {
        const to = setTimeout(() => { waiter = null; reject(new Error('read timeout')); }, 25000);
        waiter = (resp) => { clearTimeout(to); resolve(resp); };
        this.pump();
      });
    },
    attach(sock) {
      sock.on('data', (d) => this.feed(d));
    },
  };
}

async function dialog(host, to, data) {
  const log = [];
  async function run(useTls) {
    const sock = await openPlain(host);
    const R = makeReader();
    R.attach(sock);
    const read = () => R.read();
    async function cmd(s, expect) {
      log.push('C: ' + (s.length > 120 ? s.slice(0, 120) + '...' : s));
      sock.write(s + '\r\n');
      const r = await read();
      log.push('S: ' + r.split('\r\n').join(' / ').slice(0, 400));
      const code = parseInt(r.slice(0, 3), 10);
      const ok = Array.isArray(expect) ? expect.includes(code) : code === expect;
      if (!ok) throw new Error(`want ${expect}, got: ${r.slice(0, 200)}`);
      return r;
    }
    try {
      const greet = await read();
      log.push('S: ' + greet.split('\r\n').join(' / ').slice(0, 200));
      if (!greet.startsWith('220')) throw new Error('no greeting: ' + greet.slice(0, 100));
      let ehlo = await cmd('EHLO elsemail.indevs.in', 250);
      if (useTls && /STARTTLS/i.test(ehlo)) {
        await cmd('STARTTLS', 220);
        const sec = await new Promise((resolve, reject) => {
          const t = tls.connect({ socket: sock, servername: host, rejectUnauthorized: false }, () => resolve(t));
          t.once('error', reject);
          setTimeout(() => reject(new Error('tls timeout')), 20000);
        });
        log.push(`TLS: ON (${sec.getProtocol()})`);
        sock.removeAllListeners('data'); // TLS ekhon socket-er malik, destroy koro NA
        const R2 = makeReader();
        R2.attach(sec);
        await (async () => {
          const read2 = () => R2.read();
          async function cmd2(s, expect) {
            log.push('C: ' + (s.length > 120 ? s.slice(0, 120) + '...' : s));
            sec.write(s + '\r\n');
            const r = await read2();
            log.push('S: ' + r.split('\r\n').join(' / ').slice(0, 400));
            const code = parseInt(r.slice(0, 3), 10);
            const ok = Array.isArray(expect) ? expect.includes(code) : code === expect;
            if (!ok) throw new Error(`want ${expect}, got: ${r.slice(0, 200)}`);
            return r;
          }
          await cmd2('EHLO elsemail.indevs.in', 250);
          await cmd2(`MAIL FROM:<${FROM}>`, 250);
          await cmd2(`RCPT TO:<${to}>`, [250, 251]);
          await cmd2('DATA', 354);
          sec.write(data + '\r\n.\r\n');
          log.push('C: [message data]');
          const fin = await read2();
          log.push('S: ' + fin.split('\r\n').join(' / '));
          const fc = parseInt(fin.slice(0, 3), 10);
          if (fc !== 250) throw new Error('DATA reject: ' + fin);
          try { await cmd2('QUIT', 221); } catch (_) {}
          sec.end();
        })();
        return log;
      }
      await cmd(`MAIL FROM:<${FROM}>`, 250);
      await cmd(`RCPT TO:<${to}>`, [250, 251]);
      await cmd('DATA', 354);
      sock.write(data + '\r\n.\r\n');
      log.push('C: [message data]');
      const fin = await read();
      log.push('S: ' + fin.split('\r\n').join(' / '));
      if (parseInt(fin.slice(0, 3), 10) !== 250) throw new Error('DATA reject: ' + fin.slice(0, 300));
      try { await cmd('QUIT', 221); } catch (_) {}
      sock.end();
      return log;
    } catch (e) {
      try { sock.destroy(); } catch (_) {}
      throw e;
    }
  }
  try {
    return { tls: true, log: await run(true) };
  } catch (e) {
    log.push('TLS-path fail: ' + e.message + ' -> plain retry');
    const log2 = await run(false);
    return { tls: false, log: log.concat(log2) };
  }
}

(async () => {
  const to = process.argv[2] || 'talhamoyelolo52@gmail.com';
  const subject = process.argv[3] || 'Elsemail test mail';
  const body = process.argv[4] || 'Hello! Eta elsemail.indevs.in theke local PC diye direct pathano test mail (kono third-party chara).';
  const date = new Date().toUTCString();
  const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@elsemail.indevs.in>`;
  const headers = [
    ['From', `Elsemail <${FROM}>`], ['To', to], ['Subject', subject],
    ['Date', date], ['Message-ID', msgId], ['MIME-Version', '1.0'],
    ['Content-Type', 'text/plain; charset=utf-8'],
    ['List-Unsubscribe', `<mailto:unsubscribe@${DKIM_DOMAIN}?subject=unsub>`],
  ];
  const dkim = dkimSign(headers, body);
  console.log(dkim ? 'DKIM: signed (s=local)' : 'DKIM: unsigned');
  const data = [...headers.map(([n, v]) => `${n}: ${v}`), ...(dkim ? [dkim] : []), '', body].join('\r\n');
  const mxs = (await dns.resolveMx(to.split('@')[1])).sort((a, b) => a.priority - b.priority);
  let lastErr = null;
  for (const mx of mxs.slice(0, 3)) {
    try {
      console.log('Trying', mx.exchange);
      const r = await Promise.race([
        dialog(mx.exchange, to, data),
        new Promise((_, rej) => setTimeout(() => rej(new Error('overall timeout')), 90000)),
      ]);
      console.log(`DELIVERED via ${mx.exchange} (tls=${r.tls})`);
      console.log(r.log.join('\n'));
      return;
    } catch (e) { console.log('FAIL', mx.exchange, '-', e.message); lastErr = e; }
  }
  console.error('ALL-FAILED:', lastErr && lastErr.message);
  process.exit(1);
})();
