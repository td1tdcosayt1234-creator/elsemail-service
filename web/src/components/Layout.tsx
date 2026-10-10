import React from 'react';

export function Nav({ title }: { title?: string }) {
  return (
    <div className="nav">
      <img src="/logo.svg" alt="Elsemail" width={28} height={28} style={{ verticalAlign: -6, borderRadius: 6 }} />
      <b><a href="/" style={{ color: '#fff' }}>Elsemail</a></b>
      {title && <span>{title}</span>}
      <span className="sp"></span>
      <a href="/docs">Docs</a>
      <a href="/console">Inbox</a>
      <a href="/console">Console</a>
    </div>
  );
}

export function Footer() {
  return (
    <footer>
      <a href="/privacy">Privacy</a> | <a href="/terms">Terms</a> | Elsemail
    </footer>
  );
}
