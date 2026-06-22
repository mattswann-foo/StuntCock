import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Landing from './pages/Landing.jsx';
import LoginPage from './components/LoginPage.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import './index.css';

/**
 * Gates the main app on Firebase Auth state.
 * - Loading  → show nothing (avoids flash)
 * - Signed in → show app (or landing page via hash routing)
 * - Signed out → show LoginPage
 */
function Root() {
  const { user, loading } = useAuth();
  const [hash, setHash] = React.useState(window.location.hash);

  React.useEffect(() => {
    const fn = () => setHash(window.location.hash);
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);

  // Wait for Firebase to resolve auth state before rendering anything
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0B1535 0%, #172255 60%, #0E1C48 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/sc_bubble.jpg"
            alt=""
            style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: '22%', opacity: 0.5 }}
          />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>Loading StuntCock…</span>
        </div>
      </div>
    );
  }

  // Not authenticated → show login
  if (!user) {
    return <LoginPage />;
  }

  // Authenticated → hash routing: #app → dashboard, else landing page
  return hash === '#app' ? <App /> : <Landing />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>,
);
