import React, { useState } from 'react';
import { API_BASE } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const go = async () => {
    const r = await fetch(API_BASE + '/api/account/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const d = await r.json();
    if (d.ok) window.location.href = '/console'; else setMsg(d.error);
  };
  return (
    <>
      <div className="nav"><b><a href="/" style={{ color: '#fff' }}>Elsemail</a></b></div>
      <div className="wrap"><div className="card" style={{ maxWidth: 420, margin: '40px auto' }}>
        <h2>Login</h2><div>{msg && <p className="err">{msg}</p>}</div>
        <label>Email</label><input type="email" placeholder="you@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Password</label><input type="password" placeholder="******" value={pass} onChange={(e) => setPass(e.target.value)} />
        <button className="btn" onClick={go}>Login</button>
        <p className="mut">No account? <a href="/signup">Sign up</a></p></div></div>
    </>
  );
}
