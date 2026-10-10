import React, { useEffect, useState } from 'react';
import { api, API_BASE, MailItem, AttachmentOut, readFiles } from '../lib/api';
import { Nav } from '../components/Layout';

const OFFICIAL = [
  'hello@elsemail.indevs.in',
  'support@elsemail.indevs.in',
  'partnership@elsemail.indevs.in',
  'report@elsemail.indevs.in',
];

export default function Console() {
  const [who, setWho] = useState('...');
  const [status, setStatus] = useState('loading...');
  const [inbox, setInbox] = useState<MailItem[]>([]);
  const [to, setTo] = useState('');
  const [subj, setSubj] = useState('');
  const [body, setBody] = useState('');
  const [from, setFrom] = useState('');
  const [m1, setM1] = useState('');
  const [m1ok, setM1ok] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [m2, setM2] = useState('');
  const [m2ok, setM2ok] = useState(false);
  const [rsEmail, setRsEmail] = useState('');
  const [m3, setM3] = useState('');
  const [m3ok, setM3ok] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);

  const loadInbox = async () => {
    try {
      const d = await api<MailItem[]>('/api/console/mails');
      setInbox(d);
    } catch {
      setInbox([]);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await api<{ ok: boolean; email?: string }>('/api/account/me');
        setWho(me.ok && me.email ? me.email : 'Guest (open access)');
      } catch {
        setWho('Guest (open access)');
      }
      try {
        const h = await (await fetch(API_BASE + '/health')).json();
        setStatus(`provider=${h.provider} app=${h.app}`);
      } catch {
        setStatus('offline');
      }
      loadInbox();
    })();
    const t = setInterval(loadInbox, 15000);
    return () => clearInterval(t);
  }, []);

  const sendMail = async () => {
    let attachments: AttachmentOut[] | undefined;
    try {
      const list = await readFiles(files);
      if (list.length) attachments = list;
    } catch (e: any) {
      setM1(e.message); setM1ok(false); return;
    }
    const d = await api<any>('/api/mail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to.trim(), subject: subj, text: body, from: from || undefined, attachments }),
    });
    setM1(d.ok ? `sent (${d.id})${d.from ? ' from ' + d.from : ''}` : d.error);
    setM1ok(!!d.ok);
    loadInbox();
  };

  const sendOtp = async () => {
    const d = await api<any>('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otpEmail.trim() }),
    });
    setM2(d.ok ? 'OTP sent' : d.error); setM2ok(!!d.ok);
  };

  const verifyOtp = async () => {
    const d = await api<any>('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otpEmail.trim(), code: otpCode.trim() }),
    });
    setM2(d.ok ? `Verified: ${d.email}` : d.error); setM2ok(!!d.ok);
  };

  const reqReset = async () => {
    const d = await api<any>('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: rsEmail.trim() }),
    });
    setM3(d.ok ? `link: ${d.link}` : d.error); setM3ok(!!d.ok);
  };

  const logout = async () => {
    await fetch(API_BASE + '/api/account/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  };

  return (
    <>
      <div className="nav">
        <b><a href="/" style={{ color: '#fff' }}>Elsemail</a></b><span>Console</span>
        <span className="sp"></span>
        <span id="who" className="mut">{who}</span>
        <a href="/docs">Docs</a>
        <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>Logout</a>
      </div>
      <div className="wrap">
        <div className="card"><h3>Status</h3><div className="mut">{status}</div></div>
        <div className="card">
          <h3>Official addresses</h3>
          <p className="mut">Write to us at any of these — inbound forwards to the owner once verified.</p>
          {OFFICIAL.map((a) => (
            <div className="mail" key={a}><b>{a}</b>{' '}
              <button className="btn ghost" onClick={() => navigator.clipboard.writeText(a)}>Copy</button>
            </div>
          ))}
        </div>
        <div className="grid">
          <div className="card"><h3>Send mail</h3><div>{m1 && <p className={m1ok ? 'ok' : 'err'}>{m1}</p>}</div>
            <label>From</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">No-Reply (default)</option>
              {OFFICIAL.map((a) => <option key={a} value={a}>{a.split('@')[0]}@</option>)}
            </select>
            <input placeholder="to@mail.com" value={to} onChange={(e) => setTo(e.target.value)} />
            <input placeholder="Subject" value={subj} onChange={(e) => setSubj(e.target.value)} />
            <textarea rows={3} placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
            <label>Attachments (max 5, 5MB each)</label>
            <input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
            <button className="btn" onClick={sendMail}>Send</button>
          </div>
          <div className="card"><h3>OTP test</h3><div>{m2 && <p className={m2ok ? 'ok' : 'err'}>{m2}</p>}</div>
            <input placeholder="email" value={otpEmail} onChange={(e) => setOtpEmail(e.target.value)} />
            <div className="row"><button className="btn" onClick={sendOtp}>Send OTP</button></div>
            <input placeholder="code" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} />
            <button className="btn ghost" onClick={verifyOtp}>Verify</button>
          </div>
        </div>
        <div className="card"><h3>Password reset test</h3><div>{m3 && <p className={m3ok ? 'ok' : 'err'}>{m3}</p>}</div>
          <input placeholder="email" value={rsEmail} onChange={(e) => setRsEmail(e.target.value)} />
          <button className="btn" onClick={reqReset}>Send reset link</button>
        </div>
        <div className="card"><h3>Inbox <span className="mut">{inbox.length ? `(${inbox.length})` : ''}</span></h3>
          <button className="btn ghost" onClick={loadInbox}>Refresh</button>
          <div>{inbox.length ? inbox.map((m, i) => (
            <div className="mail" key={m.id || i}><b>{m.subject}</b> <small className="ok">{m.status || ''}</small><br />
              <small>{m.time} | From: {m.from} | To: {m.to}</small>
              <pre>{(m.text || '').slice(0, 400)}</pre></div>
          )) : <p className="mut">No messages yet</p>}</div>
        </div>
      </div>
    </>
  );
}
