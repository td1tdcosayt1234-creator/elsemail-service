import React from 'react';
import { Nav } from '../components/Layout';

const ROWS: [string, string, string][] = [
  ['GET', '/health', '-'],
  ['POST', '/api/mail/send', '{to, subject, html/text, from?, attachments?}'],
  ['POST', '/api/auth/send-otp', '{email}'],
  ['POST', '/api/auth/verify-otp', '{email, code}'],
  ['POST', '/api/auth/request-email-verification', '{email}'],
  ['GET', '/api/auth/verify-email?token=', '-'],
  ['POST', '/api/auth/request-password-reset', '{email}'],
  ['POST', '/api/auth/reset-password', '{token, newPassword}'],
  ['POST', '/api/auth/welcome', '{email, name}'],
  ['GET', '/api/auth/check', 'auth mode probe'],
  ['POST', '/api/account/register', '{email, password}'],
  ['POST', '/api/account/login', '{email, password}'],
  ['POST', '/api/account/change-password', '{currentPassword, newPassword} (login)'],
  ['DELETE', '/api/account', 'delete own account (login)'],
  ['GET', '/api/mail/status?messageId=', 'delivery tracking'],
  ['GET', '/api/console/mails', 'inbox (login)'],
];

export default function Docs() {
  return (
    <>
      <Nav title="Docs" />
      <div className="wrap"><div className="card">
        <h2>API Docs</h2>
        <p className="mut">API host: <code>https://api.elsemail.indevs.in</code> — pages stay on <code>https://elsemail.indevs.in</code>. With a console login, browsers work without a key. From outside, send this header: <code>x-api-key: &lt;SERVICE_API_KEY&gt;</code></p>
        <table><tbody>
          <tr><th>Method</th><th>Endpoint</th><th>Body</th></tr>
          {ROWS.map(([m, e, b]) => <tr key={e}><td>{m}</td><td>{e}</td><td>{b}</td></tr>)}
        </tbody></table>
        <h3>Example</h3>
        <pre>{`curl -X POST https://api.elsemail.indevs.in/api/auth/send-otp \\
 -H "Content-Type: application/json" -H "x-api-key: KEY" \\
 -d '{"email":"you@test.com"}'`}</pre>
      </div></div>
      <footer><a href="/privacy">Privacy</a> | <a href="/terms">Terms</a></footer>
    </>
  );
}
