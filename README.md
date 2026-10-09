# Email Service (Node + Express)

Nijer SMTP **othoba** third-party API key (Resend / SendGrid / Brevo) — provider `.env` diye switch kora jay. Full auth mail kit included: OTP, verify-email, reset-password, welcome.

## 1. Setup

```bash
cd email-service
npm install
copy .env.example .env
# .env edit koro
npm run dev
```

Health: `GET http://localhost:3002/health`

## 1b. Nijer provider (local test) — Docker charai

Ei PC-te test er jonno nijer SMTP inbox included (`src/dev-smtp.js:1`):

```bash
# terminal 1 - nijer SMTP (port 1025 + inbox 8025)
npm run smtp
# terminal 2 - email service
npm run dev
```

`.env`:
```
EMAIL_PROVIDER=smtp
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
```

Inbox dekho: http://localhost:8025/ (mails/ folder-eo save hoy)

## 1c. Nijer provider (VPS prod) — jokhon live jabe

Local dev-smtp sudhu test. Real mail-er jonno VPS-e Postal/Mailcow bosao, tarpor `.env` bodlao:
```
EMAIL_PROVIDER=smtp
SMTP_HOST=mail.elsemail.indevs.in
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=no-reply@elsemail.indevs.in
SMTP_PASS=<vps-password>
```
Cloudflare-e SPF (`v=spf1 ip4:<VPS-IP> ~all`), DKIM (Postal/Mailcow dibe), rDNS/PTR set korte hobe.

## 1d. Pages + Console panel

Home `/`, Console `/console` (login lagbe), Docs `/docs`, Privacy `/privacy`, Terms `/terms`, Login `/login`, Signup `/signup`.

```bash
npm run dev
# http://localhost:3002/  -> home
# http://localhost:3002/console -> signup kore login, mail send/OTP/inbox test
```

Live: https://dash.elsemail.indevs.in/

## 2. Provider choose kora

`.env`-e `EMAIL_PROVIDER=` set koro:

| Value | Kisher jonno | Ki lage |
|---|---|---|
| `console` | Testing, kono mail jabe na, terminal-e log | kichu na |
| `smtp` | **Nijer ta** — VPS/cPanel/Gmail, kono third-party na | `SMTP_HOST/PORT/USER/PASS` |
| `resend` | Third-party (recommended) | `RESEND_API_KEY` + verified domain |
| `sendgrid` | Third-party | `SENDGRID_API_KEY` |
| `brevo` | Third-party | `BREVO_API_KEY` |

`EMAIL_FROM`, `FRONTEND_URL`, `APP_NAME` o set koro.

## 3. API (header: `x-api-key: <SERVICE_API_KEY>`)

Jodi `SERVICE_API_KEY` empty rakho, auth lagbe na (sudhu local dev).

### Generic mail
```http
POST /api/mail/send
{ "to":"user@mail.com", "subject":"Hi", "html":"<b>Hello</b>" }
```

### OTP
```http
POST /api/auth/send-otp        { "email":"..." }
POST /api/auth/verify-otp      { "email":"...", "code":"123456" }
```

### Verify email
```http
POST /api/auth/request-email-verification  { "email":"..." }
GET  /api/auth/verify-email?token=xxx
```

### Reset password
```http
POST /api/auth/request-password-reset  { "email":"..." }
POST /api/auth/reset-password          { "token":"...", "newPassword":"min6char" }
```

### Welcome
```http
POST /api/auth/welcome  { "email":"...", "name":"Rahim" }
```

Response-e `token` + `link` testing-er jonno deya hoy. Prod frontend `/verify-email?token=` ebong `/reset-password?token=` page banabe.

## 4. Tomar main app-er sathe connect

```js
// Node example
await fetch('http://localhost:3002/api/auth/request-password-reset', {
  method: 'POST',
  headers: { 'Content-Type':'application/json', 'x-api-key': process.env.EMAIL_SERVICE_KEY },
  body: JSON.stringify({ email: user.email })
});
```

Flow:
1. `request-password-reset` → user mail-e link pay
2. User link-e click → tomar frontend token ney
3. Frontend `POST /api/auth/reset-password {token, newPassword}` → token valid hole tomar DB-te bcrypt hash save koro

> Ei service token issue/verify + mail pathay. User DB + password hashing tomar main app-e thakbe.

## 5. cURL test

```bash
curl -X POST http://localhost:3002/api/auth/send-otp \
 -H "Content-Type: application/json" -H "x-api-key: change-me-strong-random-key" \
 -d '{"email":"tumi@test.com"}'
```

## 6. Prod notes

- `SERVICE_API_KEY` strong random bosao.
- Memory store (OTP/token) single-instance er jonno. Multi-instance / restart survive korte Redis/DB use koro (`src/store.js` dekho).
- Rate-limit default: send 20/min, OTP 10/min — proyojone bodlao.
- Domain SPF/DKIM/DMARC set koro, na hole spam-e jabe (Resend/SMTP dashboard dekho).
