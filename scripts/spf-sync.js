/**
 * SPF Sync - keeps elsemail.indevs.in SPF in sync with this PC's current public IP.
 * Residential IP changes on reconnect, so Gmail would start rejecting mail if SPF goes stale.
 *
 * Usage:  node scripts/spf-sync.js
 * Env:    CF_TOKEN   (Cloudflare API token with DNS:edit on elsemail.indevs.in)
 *         CF_ZONE_ID (defaults to the known zone)
 *         SPF_DNS_ID (defaults to the known TXT record id)
 *
 * Also updates the "root SPF" that mail providers read, so both local + VPS stay authorised.
 */
'use strict';

const ZONE_ID = process.env.CF_ZONE_ID || 'cf67d0e4cd717af49fde53d6bbadd44d';
const SPF_DNS_ID = process.env.SPF_DNS_ID || '5a1c5131df0a546ebb406e7662d99cbc';
const EXTRA_IPS = ['52.230.165.16']; // Oracle VPS (was the original mail server)

async function getPublicIp() {
  for (const url of ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com']) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const ip = (await r.text()).trim();
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
    } catch (_) {
      /* try next */
    }
  }
  throw new Error('public IP fetch failed');
}

async function readCurrentSpf(token) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${SPF_DNS_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  return j?.result?.content || '';
}

function buildSpf(ip) {
  const ips = [ip, ...EXTRA_IPS.filter((x) => x !== ip)];
  return `v=spf1 ${ips.map((x) => `ip4:${x}`).join(' ')} include:_spf.mx.cloudflare.net ~all`;
}

async function main() {
  const token = process.env.CF_TOKEN;
  if (!token) {
    console.error('[spf-sync] CF_TOKEN env lagbe');
    process.exit(1);
  }
  const ip = await getPublicIp();
  const current = await readCurrentSpf(token);
  const desired = buildSpf(ip);

  if (current === desired) {
    console.log(`[spf-sync] already current: ${ip}`);
    return;
  }
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${SPF_DNS_ID}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'TXT', name: 'elsemail.indevs.in', content: desired, ttl: 1 }),
  });
  const j = await r.json();
  if (!j?.success) {
    console.error('[spf-sync] update failed:', JSON.stringify(j?.errors || j));
    process.exit(1);
  }
  console.log(`[spf-sync] SPF -> ${j.result.content}`);
}

main();
