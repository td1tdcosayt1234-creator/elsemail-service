import React from 'react';

export default function Privacy() {
  return (
    <>
      <div className="nav"><b><a href="/" style={{ color: '#fff' }}>Elsemail</a></b></div>
      <div className="wrap"><div className="card"><h2>Privacy Policy</h2>
        <p className="mut">Last updated: Oct 2026</p>
        <p><b>1. Data:</b> signup stores only your email + hashed password. Passwords are never kept in plain text (scrypt hash).</p>
        <p><b>2. Mail content:</b> test mail stays in the local inbox and never goes to a third party (except direct-to-MX delivery, which only goes to the recipient server).</p>
        <p><b>3. OTP/token:</b> kept in a local file store and auto-deleted on expiry.</p>
        <p><b>4. Sharing:</b> your data is never sold or shared.</p>
        <p><b>5. Delete:</b> to delete an account, remove the email from <code>data/users.json</code> (self-hosted).</p>
        <p>Contact: no-reply@elsemail.indevs.in</p>
      </div></div><footer><a href="/terms">Terms</a> | <a href="/">Home</a></footer>
    </>
  );
}
