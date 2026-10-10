import React from 'react';
import { Nav, Footer } from '../components/Layout';

export default function Home() {
  return (
    <>
      <Nav />
      <div className="hero"><h1>Your Own Email Service</h1>
        <p>OTP, verify-email and reset-password mail with no third party — live on <b>elsemail.indevs.in</b>.</p>
        <p><a className="btn" href="/console">Open Console</a> <a className="btn ghost" href="/docs">API Docs</a></p>
        <p className="mut">Live API: https://api.elsemail.indevs.in/health</p></div>
      <div className="wrap"><div className="grid">
        <div className="card"><h3>OTP kit</h3><p className="mut">Send + verify, 5 min expiry.</p></div>
        <div className="card"><h3>Reset password</h3><p className="mut">Secure token link, 60 min valid.</p></div>
        <div className="card"><h3>DKIM + SPF</h3><p className="mut">Signed delivery from your own domain.</p></div>
      </div></div>
      <Footer />
    </>
  );
}
