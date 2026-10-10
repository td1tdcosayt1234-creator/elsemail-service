const config = require('./config');

const LOGO_URL = 'https://elsemail.indevs.in/logo.svg';

function layout(title, bodyInner, preheader = '') {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <span style="display:none;opacity:0;max-height:0;overflow:hidden;">${preheader}</span>
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0f172a;color:#fff;padding:24px 28px;">
      <img src="${LOGO_URL}" alt="ElseMail" width="36" height="36" style="border-radius:8px;vertical-align:middle;">
      <span style="font-size:20px;font-weight:bold;vertical-align:middle;margin-left:10px;">${config.appName}</span>
      <div style="opacity:.65;font-size:13px;margin-top:6px;">${title}</div>
    </div>
    <div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.6;">${bodyInner}</div>
    <div style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;">
      This is an automated message. Please do not reply.<br>&copy; ${new Date().getFullYear()} ${config.appName}. All rights reserved.
    </div>
  </div></body></html>`;
}

function btn(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#0f172a;color:#fff;padding:13px 26px;border-radius:9px;text-decoration:none;font-weight:bold;font-size:15px;">${label}</a>`;
}

function otpTemplate(code) {
  const inner = `<p style="font-size:15px;margin-top:0;">Your verification code:</p>
    <div style="font-size:36px;font-weight:800;letter-spacing:10px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:10px;padding:16px;text-align:center;color:#0f172a;">${code}</div>
    <p style="color:#64748b;font-size:13px;">This code expires in 5 minutes. Never share it with anyone.</p>`;
  return {
    subject: `${config.appName} - Your verification code`,
    html: layout('Email verification', inner, `Your code: ${code}`),
    text: `Your ${config.appName} verification code: ${code} (valid for 5 minutes). Never share it.`,
  };
}

function verifyEmailTemplate(link) {
  const inner = `<p style="margin-top:0;">Please verify your email address by clicking below:</p><p>${btn(link, 'Verify Email')}</p>
    <p style="color:#64748b;font-size:13px;word-break:break-all;">If the button does not work, copy this link:<br>${link}</p>
    <p style="color:#64748b;font-size:13px;">This link is valid for 24 hours.</p>`;
  return { subject: `${config.appName} - Verify your email`, html: layout('Verify your email', inner), text: `Verify your email: ${link}` };
}

function resetPasswordTemplate(link) {
  const inner = `<p style="margin-top:0;">Click below to reset your password:</p><p>${btn(link, 'Reset Password')}</p>
    <p style="color:#64748b;font-size:13px;word-break:break-all;">Link: ${link}</p>
    <p style="color:#64748b;font-size:13px;">If you did not request this, please ignore this email. This link is valid for 60 minutes.</p>`;
  return { subject: `${config.appName} - Reset your password`, html: layout('Reset your password', inner), text: `Reset your password: ${link}` };
}

function welcomeTemplate(name = 'friend') {
  const safe = String(name || 'friend').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).slice(0, 80);
  const inner = `<p style="margin-top:0;">Hi ${safe},</p><p>Welcome to <b>${config.appName}</b>!</p><p>Your account is ready.</p><p>${btn(config.frontendUrl + '/console', 'Open Console')}</p>`;
  return { subject: `Welcome to ${config.appName}!`, html: layout('Welcome!', inner), text: `Welcome to ${config.appName}, ${safe}!` };
}

module.exports = { otpTemplate, verifyEmailTemplate, resetPasswordTemplate, welcomeTemplate };
