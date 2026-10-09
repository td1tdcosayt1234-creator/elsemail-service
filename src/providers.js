const nodemailer = require('nodemailer');
const config = require('./config');

let smtpTransporter = null;
function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(config.smtp.host);
  smtpTransporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    ignoreTLS: isLocal, // local dev-smtp plain, cert issue nai
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return smtpTransporter;
}

async function sendViaConsole({ to, subject, html, text }) {
  console.log('\n===== [console-mail] =====');
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log('Text:', (text || '').slice(0, 500));
  console.log('==========================\n');
  return { id: `console-${Date.now()}`, provider: 'console' };
}

async function sendViaSmtp({ to, subject, html, text, from }) {
  if (!config.smtp.host) throw new Error('SMTP_HOST missing. .env check koro.');
  const info = await getSmtpTransporter().sendMail({
    from: from || config.from,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
  });
  return { id: info.messageId, provider: 'smtp' };
}

async function sendViaResend({ to, subject, html, text, from }) {
  if (!config.resendApiKey) throw new Error('RESEND_API_KEY missing.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: from || config.from, to: Array.isArray(to) ? to : [to], subject, html, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${JSON.stringify(data)}`);
  return { id: data.id, provider: 'resend' };
}

async function sendViaSendgrid({ to, subject, html, text, from }) {
  if (!config.sendgridApiKey) throw new Error('SENDGRID_API_KEY missing.');
  // SendGrid "from" strictly email chaay, "Name <mail>" parse kore ber kori
  const fromEmail = (from || config.from).match(/<(.+)>/)?.[1] || from || config.from;
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.sendgridApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: (Array.isArray(to) ? to : [to]).map((e) => ({ email: e })) }],
      from: { email: fromEmail },
      subject,
      content: [
        ...(text ? [{ type: 'text/plain', value: text }] : []),
        ...(html ? [{ type: 'text/html', value: html }] : []),
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`SendGrid error ${res.status}: ${t}`);
  }
  return { id: `sg-${Date.now()}`, provider: 'sendgrid' };
}

async function sendViaBrevo({ to, subject, html, text, from }) {
  if (!config.brevoApiKey) throw new Error('BREVO_API_KEY missing.');
  const senderMatch = (from || config.from).match(/^(.*)<(.+)>$/);
  const sender = senderMatch
    ? { name: senderMatch[1].trim().replace(/"/g, ''), email: senderMatch[2].trim() }
    : { email: from || config.from };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.brevoApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender,
      to: (Array.isArray(to) ? to : [to]).map((e) => ({ email: e })),
      subject,
      htmlContent: html || undefined,
      textContent: text || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo error ${res.status}: ${JSON.stringify(data)}`);
  return { id: data.messageId || `brevo-${Date.now()}`, provider: 'brevo' };
}

/**
 * Unified send — provider switch ekhanei.
 * @returns {{id, provider}}
 */
async function sendMail({ to, subject, html, text, from }) {
  if (!to || !subject || (!html && !text)) {
    throw new Error('to, subject ebong html/text er ontoto ekta lagbe.');
  }
  switch (config.provider) {
    case 'smtp': return sendViaSmtp({ to, subject, html, text, from });
    case 'resend': return sendViaResend({ to, subject, html, text, from });
    case 'sendgrid': return sendViaSendgrid({ to, subject, html, text, from });
    case 'brevo': return sendViaBrevo({ to, subject, html, text, from });
    default: return sendViaConsole({ to, subject, html, text });
  }
}

module.exports = { sendMail, getActiveProvider: () => config.provider };
