// RFC 6376 compliant DKIM signer + verifier (relaxed/relaxed)
// Usage:
//   const { sign, verify } = require('./dkim');
//   const dkimHeader = sign(privKeyPem, 'mail', 'example.com', rawMessage);
//   const out = { valid, why } = verify(pubKeyResolverOrPem, rawMessageWithDkimHeader);
'use strict';
const crypto = require('crypto');

const WSP = /[ \t]+/g;

/** RFC 6376 3.4.4 - relaxed body canonicalization */
function canonicalizeBodyRelaxed(body) {
  let b = String(body || '').replace(/\r\n/g, '\n');
  b = b.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n');
  b = b.replace(/\n+$/, ''); // strip trailing empty lines
  // canonical body must be terminated with a single CRLF (empty body -> "\r\n")
  return b.length ? b + '\r\n' : '\r\n';
}

/** RFC 6376 3.4.2 - relaxed header canonicalization */
function canonicalizeHeaderRelaxed(name, value) {
  let v = String(value).replace(/\r\n/g, '\n');
  v = v.replace(/\n[ \t]+/g, ' '); // unfold: CRLF+WSP -> single space
  v = v.replace(WSP, ' '); // collapse WSP runs
  v = v.trim(); // delete trailing WSP + trim around value
  return `${name}:${v}`;
}

function parseMessage(raw) {
  const text = String(raw).replace(/\r\n/g, '\n');
  const m = text.match(/^([\s\S]*?)\r?\n\r?\n([\s\S]*)$/);
  if (!m) return { headerLines: [], headers: [], body: '' };
  const headerLines = m[1].split('\n');
  const headers = [];
  for (const line of headerLines) {
    if (/^\s/.test(line) && headers.length) {
      headers[headers.length - 1].value += ' ' + line.trim();
    } else {
      const i = line.indexOf(':');
      if (i > 0) headers.push({ name: line.slice(0, i).trim().toLowerCase(), value: line.slice(i + 1).trim() });
    }
  }
  // split returns the body with trailing newline normalization applied by parse
  const body = m[2] || '';
  return { headerLines, headers, body };
}

/** Build the relaxed-canonical string that gets signed (no trailing CRLF —
    matches nodemailer/RFC 6376 as verified by Gmail-accepted mail) */
function buildSignedData(headers, signedNames, dkimHeaderValue) {
  const parts = [];
  const map = new Map(headers.map((h) => [h.name, h.value]));
  for (const name of signedNames) {
    // last occurrence wins for duplicate headers (RFC 6376 3.7 note)
    const value = map.get(name);
    if (value === undefined) throw new Error(`DKIM: header "${name}" not found for signing`);
    parts.push(canonicalizeHeaderRelaxed(name, value));
  }
  if (dkimHeaderValue !== undefined) {
    parts.push(canonicalizeHeaderRelaxed('dkim-signature', dkimHeaderValue));
  }
  return parts.join('\r\n');
}

function bodyHashRelaxed(body) {
  return crypto.createHash('sha256').update(Buffer.from(canonicalizeBodyRelaxed(body), 'utf8')).digest('base64');
}

/**
 * Sign a message. Returns the DKIM-Signature header VALUE (without the field name).
 * @param {string} privPem - PKCS#8 private key PEM
 * @param {string} selector - e.g. 'mail'
 * @param {string} domain - signing domain, e.g. 'example.com'
 * @param {string} raw - full raw message (header + body)
 */
function sign(privPem, selector, domain, raw) {
  const { headers, body } = parseMessage(raw);
  const preferred = ['from', 'to', 'subject', 'date', 'message-id', 'reply-to', 'mime-version', 'content-type'];
  const available = new Set(headers.map((h) => h.name));
  const signed = preferred.filter((n) => available.has(n));
  if (!signed.includes('from')) throw new Error('DKIM: missing From header');
  if (!signed.includes('subject') && available.has('subject')) signed.push('subject');

  const bh = bodyHashRelaxed(body);
  const now = Math.floor(Date.now() / 1000);

  // step 1: DKIM-Signature value with b= EMPTY
  const tag = (k, v) => `${k}=${v}`;
  let partial =
    `${tag('v', '1')}; ${tag('a', 'rsa-sha256')}; ${tag('c', 'relaxed/relaxed')}; ` +
    `${tag('d', domain)}; ${tag('s', selector)}; ${tag('t', String(now))}; ` +
    `${tag('h', signed.join(':'))}; ${tag('bh', bh)}; ${tag('b', '')}`;

  // step 2: sign canonical headers + DKIM-Signature(with b= empty, canonicalized)
  const data = buildSignedData(headers, signed, partial);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  const b = signer.sign(privPem, 'base64');

  // step 3: final header with real b=
  partial = partial.replace(/; b=$/, `; b=${b}`);
  return partial;
}

/**
 * Verify a DKIM-Signature in a raw message.
 * @param {(selector:string, domain:string)=>string|Buffer} pubResolver - returns SPKI PEM
 */
function verify(raw, pubResolver) {
  try {
    const { headers, body } = parseMessage(raw);
    const dkimHeader = [...headers].reverse().find((h) => h.name === 'dkim-signature');
    if (!dkimHeader) return { valid: false, why: 'no DKIM-Signature header' };

    const tags = {};
    for (const part of dkimHeader.value.split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      let v = part.slice(i + 1).trim();
      if (k === 'h' || k === 'b' || k === 'bh') v = v.replace(WSP, '');
      tags[k] = v;
    }

    if (tags.a !== 'rsa-sha256') return { valid: false, why: `unsupported alg ${tags.a}` };
    if (!tags.b || !tags.bh) return { valid: false, why: 'missing b= or bh=' };
    const signedNames = (tags.h || '').split(':').filter(Boolean);

    // verify body hash
    const bhExpected = bodyHashRelaxed(body);
    if (bhExpected !== tags.bh) return { valid: false, why: 'body hash mismatch (bh)' };

    // Rebuild the DKIM-Signature value with b= emptied, preserving tag order
    // AND the exact surrounding whitespace of every other tag.
    // (Regex replace breaks because base64 sigs contain '+' which is a regex quantifier.)
    const rebuilt = dkimHeader.value
      .split(';')
      .map((seg) => {
        const eq = seg.indexOf('=');
        const key = (eq >= 0 ? seg.slice(0, eq) : seg).trim().toLowerCase();
        // keep ' b=' including its leading whitespace, only blank the value
        return key === 'b' ? seg.slice(0, eq + 1) : seg;
      })
      .join(';');

    const data = buildSignedData(headers, signedNames, rebuilt);

    const pubPem = pubResolver(tags.s, tags.d);
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(data);
    const ok = verifier.verify(pubPem, Buffer.from(tags.b, 'base64'));
    return { valid: ok, why: ok ? 'signature valid' : 'signature mismatch', domain: tags.d, selector: tags.s };
  } catch (e) {
    return { valid: false, why: e.message };
  }
}

module.exports = {
  sign,
  verify,
  canonicalizeBodyRelaxed,
  canonicalizeHeaderRelaxed,
  // internals (testing/debug)
  _parseMessage: parseMessage,
  _buildSignedData: buildSignedData,
  _bodyHashRelaxed: bodyHashRelaxed,
};
