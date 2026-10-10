import React from 'react';
import Home from './pages/Home';
import Console from './pages/Console';
import Docs from './pages/Docs';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';

const ROUTES: Record<string, () => React.JSX.Element> = {
  '/': Home,
  '/console': Console,
  '/docs': Docs,
  '/login': Login,
  '/signup': Signup,
  '/privacy': Privacy,
  '/terms': Terms,
  '/verify-email': VerifyEmail,
  '/reset-password': ResetPassword,
};

export default function App() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const Page = ROUTES[path];
  if (!Page) {
    window.location.href = '/';
    return null;
  }
  // /console needs a session unless TEMP_OPEN (server redirects to /login when required)
  return <Page />;
}
