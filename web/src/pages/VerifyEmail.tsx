import React, { useEffect, useState } from 'react';
import { API_BASE } from '../lib/api';

export default function VerifyEmail() {
  const [msg, setMsg] = useState('checking...');
  const [ok, setOk] = useState(false);
  useEffect(() => {
    (async () => {
      const t = new URLSearchParams(window.location.search).get('token');
      if (!t) { setMsg('token missing.'); return; }
      try {
        const r = await fetch(API_BASE + '/api/auth/verify-email?token=' + encodeURIComponent(t));
        const d = await r.json();
        setMsg(d.ok ? `Verified: ${d.email}` : (d.error || 'failed'));
        setOk(!!d.ok);
      } catch {
        setMsg('network error');
      }
    })();
  }, []);
  return (
    <>
      <div className="nav"><img src="/logo.svg" alt="" width={28} height={28} style={{ verticalAlign: -6, borderRadius: 6 }} /><b><a href="/" style={{ color: '#fff' }}>Elsemail</a></b></div>
      <div className="wrap"><div className="card" style={{ maxWidth: 480, margin: '40px auto' }}>
        <h2>Email verify</h2><div><p className={ok ? 'ok' : msg === 'checking...' ? 'mut' : 'err'}>{msg}</p></div>
        <p><a className="btn ghost" href="/console">Console</a></p></div></div>
    </>
  );
}
