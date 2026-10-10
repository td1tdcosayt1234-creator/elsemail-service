import React from 'react';

export default function Terms() {
  return (
    <>
      <div className="nav"><b><a href="/" style={{ color: '#fff' }}>Elsemail</a></b></div>
      <div className="wrap"><div className="card"><h2>Terms &amp; Conditions</h2>
        <p className="mut">Last updated: Oct 2026</p>
        <p><b>1. Service:</b> Elsemail self-hosted email testing/delivery tool (elsemail.indevs.in).</p>
        <p><b>2. Fair use:</b> sending spam is prohibited. Rate limits (send 20/min, OTP 10/min) must be respected. Abuse will lead to blocked access.</p>
        <p><b>3. Delivery:</b> with direct delivery, the recipient server (Gmail etc.) may file mail as spam under its own policy — that is the recipient's decision.</p>
        <p><b>4. Password:</b> you are responsible for your own password. Min 6 chars.</p>
        <p><b>5. Liability:</b> service is "as-is" — no data-loss guarantee (keep your own backup).</p>
        <p>Contact: no-reply@elsemail.indevs.in</p>
      </div></div><footer><a href="/privacy">Privacy</a> | <a href="/">Home</a></footer>
    </>
  );
}
