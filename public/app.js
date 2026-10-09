async function api(p, opt={}) {
  const r = await fetch(p, { credentials: 'include', ...opt });
  if (r.status === 401) { location.href = '/login'; throw 0; }
  return r.json();
}
const esc = s => String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function init() {
  const me = await api('/api/account/me');
  who.textContent = me.email;
  const h = await (await fetch('/health')).json();
  status.innerHTML = `provider=<b>${h.provider}</b> app=<b>${esc(h.app)}</b> time=${h.time}`;
  loadInbox();
}
async function sendMail() {
  const d = await api('/api/mail/send', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ to: to.value, subject: subj.value, text: body.value }) });
  m1.innerHTML = d.ok ? `<p class=ok>sent (${d.id})</p>` : `<p class=err>${esc(d.error)}</p>`;
  loadInbox();
}
async function sendOtp() {
  const d = await api('/api/auth/send-otp', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email: otpEmail.value }) });
  m2.innerHTML = d.ok ? `<p class=ok>OTP sent</p>` : `<p class=err>${esc(d.error)}</p>`;
}
async function verifyOtp() {
  const d = await api('/api/auth/verify-otp', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email: otpEmail.value, code: otpCode.value }) });
  m2.innerHTML = d.ok ? `<p class=ok>verified: ${esc(d.email)}</p>` : `<p class=err>${esc(d.error)}</p>`;
}
async function reqReset() {
  const d = await api('/api/auth/request-password-reset', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email: rsEmail.value }) });
  m3.innerHTML = d.ok ? `<p class=ok>link:</p><pre>${esc(d.link)}</pre>` : `<p class=err>${esc(d.error)}</p>`;
}
async function loadInbox() {
  try {
    const d = await api('/api/console/mails');
    inbox.innerHTML = d.length ? d.map(m =>
      `<div class=mail><b>${esc(m.subject)}</b><br><small>${esc(m.time)} | To: ${esc(m.to)}</small><pre>${esc((m.text||'').slice(0,400))}</pre></div>`).join('')
      : '<p class=mut>khali</p>';
  } catch(e) { inbox.innerHTML = '<p class=mut>inbox off (dev-smtp cholche na?)</p>'; }
}
async function logout() { await fetch('/api/account/logout', { method:'POST', credentials:'include' }); location.href='/'; }
init();
