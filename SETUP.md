# ElseMail — Full Setup Guide (new PC included)

Self-hosted email microservice (Node + Express): pluggable SMTP / Resend / SendGrid / Brevo,
OTP + verify-email + reset-password kit, DKIM-signed direct-to-MX delivery, React + TypeScript console.

Live reference: `https://elsemail.indevs.in` (pages) + `https://api.elsemail.indevs.in` (API only).

---

## 1. Requirements

| What | Why |
|---|---|
| Windows 10/11 (or any OS with Node 18+) | host |
| Node.js >= 18 (`node --version`) | runtime |
| Outbound port **25** open | direct-to-MX delivery — test: `Test-NetConnection gmail-smtp-in.l.google.com -Port 25` |
| `cloudflared.exe` | public URLs (Cloudflare Tunnel) |
| A Cloudflare account with the domain | DNS + tunnel + Email Routing |

## 2. Install

```bat
git clone https://github.com/<you>/elsemail-service.git
cd elsemail-service
npm install
copy .env.example .env
npm run web:build
```

`setup.bat` does all of the above in one double-click (no secrets inside).

## 3. Configure `.env`

| Key | Example | Notes |
|---|---|---|
| `PORT` | `3000` | tunnel ingress expects **3000** |
| `EMAIL_PROVIDER` | `smtp` | `console` \| `smtp` \| `resend` \| `sendgrid` \| `brevo` |
| `EMAIL_FROM` | `ElseMail <no-reply@elsemail.indevs.in>` | default sender |
| `FRONTEND_URL` | `https://elsemail.indevs.in` | links inside mails (verify/reset pages) |
| `APP_NAME` | `ElseMail` | brand in mails + pages |
| `SERVICE_API_KEY` | 64-hex random | generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — every `/api/*` call needs `x-api-key` header (or a console login session) |
| `TEMP_OPEN` | `false` | `true` = login/key check off (testing only, never in prod) |
| `SMTP_HOST/PORT/USER/PASS` | `127.0.0.1` / `587` | local `mail-server.js` relay (below) |
| `MAIL_DOMAIN` | `elsemail.indevs.in` | DKIM domain + HELO identity |
| `MAIL_HOSTNAME` | `elsemail.indevs.in` | must resolve + be in SPF |
| `RESEND_API_KEY` etc. | — | only the provider you use |

## 4. DKIM (one per domain, copy key to every PC)

- Private key lives at `scripts/dkim-private.pem` — **never commit it** (gitignored).
- Public key is published at DNS `local._domainkey.<domain>` TXT.
- New PC? **Copy both `dkim-private.pem` + `dkim-public.pem`** from the old PC — no DNS change needed.
- Fresh key? Generate + publish:
  ```bat
  node -e "const c=require('crypto'),fs=require('fs');const k=c.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});fs.writeFileSync('scripts/dkim-private.pem',k.privateKey);fs.writeFileSync('scripts/dkim-public.pem',k.publicKey)"
  ```
  then set DNS TXT `local._domainkey` to `v=DKIM1; k=rsa; p=<base64 from dkim-public.pem>`.
- Verify: `node scripts/dkim-verify-test.js`

## 5. SPF (per public IP — re-run on every PC / reconnect)

```bat
set CF_TOKEN=<cloudflare-api-token-with-DNS:edit>
node scripts/spf-sync.js
```
Adds the PC's current IP to `v=spf1 ip4:<THIS-PC> ip4:<VPS> include:_spf.mx.cloudflare.net ~all`.

## 6. Run (two processes)

```bat
start-smtp-pc.bat   :: SMTP relay 127.0.0.1:587 + inbox :8025  AND  API :3000
```
or manually:
```bat
set SMTP_PORT=587 & set SMTP_HTTP_PORT=8025 & set ENABLE_MX_DELIVERY=true & set MAIL_DOMAIN=elsemail.indevs.in & node src\mail-server.js
node src\index.js
```
Health: `http://localhost:3000/health` → `{"ok":true,"provider":"smtp"}` · Inbox: `http://localhost:8025/`

## 7. Public URLs (Cloudflare Tunnel)

```bat
copy start-tunnel.example.bat start-tunnel.bat
setx CF_TUNNEL_TOKEN "eyJhIjoi..."   :: Zero Trust -> Networks -> Tunnels -> token
start-tunnel.bat                      :: auto-restarts itself
```
Tunnel ingress (dashboard or API):
`elsemail.indevs.in`, `dash.*`, `mta-sts.*`, `api.*` → `http://localhost:3000` (+ `codebridge.*` → `:3001` if used).
Host split is enforced in-app: **api host = `/api/*` + `/health` only; main host = pages only.**

## 8. Inbound addresses (hello@, support@, partnership@, report@)

Cloudflare dashboard → Email → Email Routing → destination address (owner Gmail) →
**click the verification link**, then add 4 custom-address rules forwarding to it.

## 9. Auto-start at logon (no admin)

The two `.lnk` shortcuts in
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`
(`ElsemailSMTP`, `ElsemailTunnel`) recreate with:
```powershell
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\ElsemailSMTP.lnk")
$lnk.TargetPath = "<repo>\start-smtp-pc.bat"; $lnk.WorkingDirectory = "<repo>"; $lnk.Save()
```

## 10. API quick reference (full table at `/docs`)

`POST /api/mail/send {to, subject, html/text, from?, attachments?}` (senders allowlist:
`no-reply@, hello@, support@, partnership@, report@`) ·
OTP `send-otp`/`verify-otp` · verify-email · password-reset · welcome ·
`GET /api/mail/status?messageId=` · `GET /api/auth/check` ·
account `register/login/change-password/DELETE` · `GET /api/console/mails`

## 11. Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Gmail accepts but inbox empty | new domain + no PTR → silently filtered. Read mail in `/console` inbox; warm up domain; consider Gmail App-Password relay |
| `550 Unsolicited` | unsigned/no-SPF → check DKIM (`dkim-verify-test.js`) + re-run `spf-sync.js` |
| SMTP `421 Timeout` | MX queue wedged — fixed (timeouts + background delivery); restart `mail-server.js` |
| `Invalid x-api-key` | key rotated — use current `.env` value (or `TEMP_OPEN=true` for tests) |
| OTP "does not match" | each Send issues a new code; codes expire in 5 min; read latest from console inbox |
| Tunnel `down`/530 | restart `start-tunnel.bat` (loop recovers); `--protocol http2` if QUIC is flaky |
| Public DNS fails locally | flaky resolver — retry; server is fine if `:3000/health` is ok |
