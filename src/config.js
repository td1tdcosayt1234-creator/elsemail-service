require('dotenv').config();

function str(name, def = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? def : v;
}

const config = {
  port: parseInt(str('PORT', '3001'), 10),
  provider: str('EMAIL_PROVIDER', 'console').toLowerCase(), // console|smtp|resend|sendgrid|brevo
  from: str('EMAIL_FROM', 'My App <no-reply@localhost>'),
  appName: str('APP_NAME', 'My App'),
  frontendUrl: str('FRONTEND_URL', 'http://localhost:3000').replace(/\/$/, ''),
  serviceApiKey: str('SERVICE_API_KEY', ''),
  tempOpen: str('TEMP_OPEN', 'false') === 'true', // true = login/key temp off (testing only!)

  smtp: {
    host: str('SMTP_HOST', ''),
    port: parseInt(str('SMTP_PORT', '587'), 10),
    secure: str('SMTP_SECURE', 'false') === 'true',
    user: str('SMTP_USER', ''),
    pass: str('SMTP_PASS', ''),
  },
  resendApiKey: str('RESEND_API_KEY', ''),
  sendgridApiKey: str('SENDGRID_API_KEY', ''),
  brevoApiKey: str('BREVO_API_KEY', ''),
};

const SUPPORTED = ['console', 'smtp', 'resend', 'sendgrid', 'brevo'];
if (!SUPPORTED.includes(config.provider)) {
  console.warn(`[config] Unknown EMAIL_PROVIDER="${config.provider}", falling back to "console". Supported: ${SUPPORTED.join(', ')}`);
  config.provider = 'console';
}

module.exports = config;
