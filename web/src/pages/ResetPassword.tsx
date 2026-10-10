import React, { useState } from 'react';
import { API_BASE } from '../lib/api';

export default function ResetPassword() {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const go = async () => {
    const t = new URLSearchParams(window.location.search).get('token');
    const r = await fetch(API_BASE + '/api/auth/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: t, newPassword: pw }),
    });
    const d = await r.json();
    setMsg(d.ok ? `Done (${d.email}). Now log in to your main app.` : (d.error || 'failed'));
    setOk(!!d.ok);
  };
  return (
    <>
      <div className="nav"><img src="/logo.svg" alt="" width={28} height={28} style={{ verticalAlign: -6, borderRadius: 6 }} /><b><a href="/" style={{ color: '#fff' }}>Elsemail</a></b></div>
      <div className="wrap"><div className="card" style={{ maxWidth: 480, margin: '40px auto' }}>
        <h2>New password</h2><div>{msg && <p className={ok ? 'ok' : 'err'}>{msg}</p>}</div>
        <label>New password (min 6)</label>
        <input type="password" placeholder="******" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn" onClick={go}>Update</button></div></div>
    </>
  );
}
