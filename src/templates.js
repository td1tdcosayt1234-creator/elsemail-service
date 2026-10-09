const config = require('./config');

function layout(title, bodyInner, preheader = '') {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <span style="display:none;opacity:0;">${preheader}</span>
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <div style="background:#111827;color:#fff;padding:20px 24px;">
      <div style="font-size:18px;font-weight:bold;">${config.appName}</div>
      <div style="opacity:.7;font-size:13px;">${title}</div>
    </div>
    <div style="padding:24px;">${bodyInner}</div>
    <div style="padding:16px 24px;background:#f9fafb;color:#71717a;font-size:12px;">
      Ei mail auto-generated. Reply koro na.
    </div>
  </div></body></html>`;
}

function btn(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#111827;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">${label}</a>`;
}

function otpTemplate(code) {
  const inner = `<p style="font-size:15px;">Tomar verification code:</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f4f4f5;border-radius:8px;padding:14px;text-align:center;">${code}</div>
    <p style="color:#52525b;font-size:13px;">Code-ti 5 minute por expire hobe. Kauke share koro na.</p>`;
  return {
    subject: `${config.appName} - Tomar OTP code`,
    html: layout('Email verification OTP', inner, `OTP: ${code}`),
    text: `Tomar OTP code: ${code} (5 min valid)`,
  };
}

function verifyEmailTemplate(link) {
  const inner = `<p>Account verify korte niche click koro:</p><p>${btn(link, 'Verify Email')}</p>
    <p style="color:#52525b;font-size:13px;word-break:break-all;">Link kaj na korle copy koro:<br>${link}</p>
    <p style="color:#52525b;font-size:13px;">Link 24 ghonta valid.</p>`;
  return { subject: `${config.appName} - Email verify koro`, html: layout('Verify your email', inner), text: `Verify: ${link}` };
}

function resetPasswordTemplate(link) {
  const inner = `<p>Password reset korte niche click koro:</p><p>${btn(link, 'Reset Password')}</p>
    <p style="color:#52525b;font-size:13px;word-break:break-all;">Link: ${link}</p>
    <p style="color:#52525b;font-size:13px;">Tumi request na korle ei mail ignore koro. Link 60 minute valid.</p>`;
  return { subject: `${config.appName} - Password reset`, html: layout('Reset password', inner), text: `Reset link: ${link}` };
}

function welcomeTemplate(name = 'bondhu') {
  const inner = `<p>Hi ${name},</p><p><b>${config.appName}</b>-e welcome!</p><p>Tomar account ready.</p>`;
  return { subject: `Welcome to ${config.appName}!`, html: layout('Welcome!', inner), text: `Welcome to ${config.appName}, ${name}!` };
}

module.exports = { otpTemplate, verifyEmailTemplate, resetPasswordTemplate, welcomeTemplate };
