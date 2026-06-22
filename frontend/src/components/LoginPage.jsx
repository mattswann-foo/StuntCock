// StuntCock — Login screen (Firebase Auth)
// Supports Google Sign-in (popup) and email/password.
// Shown automatically when no Firebase user is authenticated.

import React, { useState } from 'react';
import {
  signInWithGoogle,
  signInWithEmail,
  createAccountWithEmail,
} from '../lib/firebase.js';

// ─── Design tokens (match dashboard palette) ──────────────────────────────────
const BG     = '#0B1535';
const BG2    = '#111E47';
const BLUE   = '#3D72E8';
const BLUE2  = '#2D5ACC';
const BORDER = 'rgba(255,255,255,0.08)';
const MUTED  = 'rgba(255,255,255,0.45)';

// ─── Input ────────────────────────────────────────────────────────────────────
function Field({ label, type = 'text', value, onChange, placeholder, autoComplete }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ width: '100%' }}>
      {label && (
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: MUTED }}>
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          width: '100%',
          padding: '10px 14px',
          fontSize: 14,
          borderRadius: 12,
          border: `1px solid ${focused ? 'rgba(61,114,232,0.6)' : 'rgba(255,255,255,0.12)'}`,
          background: 'rgba(255,255,255,0.05)',
          color: '#fff',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

// ─── Google SVG icon ──────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 6.8 29.5 5 24 5 12.4 5 3 14.4 3 26s9.4 21 21 21c10.6 0 20-7.6 20-21 0-1.3-.2-2.7-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 15.1l6.6 4.8C14.5 16.2 18.9 13 24 13c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 6.8 29.5 5 24 5 16.3 5 9.7 9.2 6.3 15.1z"/>
      <path fill="#4CAF50" d="M24 47c5.4 0 10.2-1.8 14-4.7l-6.5-5.5C29.3 38.6 26.8 39.5 24 39.5c-5.2 0-9.6-3.2-11.3-7.8L6 37.3C9.5 43.2 16.3 47 24 47z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.1-2.2 3.9-4 5.2l6.5 5.5c-.5.4 7.2-5.2 7.2-14.7 0-1.3-.2-2.7-.4-3.9z"/>
    </svg>
  );
}

// ─── Main login component ─────────────────────────────────────────────────────
export default function LoginPage() {
  const [mode, setMode]         = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  function friendlyError(err) {
    const code = err?.code ?? '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'Incorrect email or password.';
    }
    if (code === 'auth/email-already-in-use') return 'An account with this email already exists.';
    if (code === 'auth/weak-password')         return 'Password must be at least 6 characters.';
    if (code === 'auth/invalid-email')         return 'Please enter a valid email address.';
    if (code === 'auth/popup-closed-by-user')  return 'Sign-in popup closed. Try again.';
    if (code === 'auth/popup-blocked')         return 'Sign-in popup was blocked. Allow popups and try again.';
    return err?.message ?? 'Something went wrong. Please try again.';
  }

  async function handleGoogle() {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      // onAuthStateChanged in AuthProvider will update user state automatically
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await createAccountWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: `linear-gradient(135deg, ${BG} 0%, #172255 60%, #0E1C48 100%)`,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif",
    }}>
      {/* Blue radial glow */}
      <div style={{
        position: 'fixed', top: '40%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 600, height: 600, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(61,114,232,0.15) 0%, transparent 65%)',
      }} />

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        background: 'rgba(17,30,71,0.8)',
        border: `1px solid ${BORDER}`,
        borderRadius: 24,
        padding: '40px 36px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Logo + branding */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-block', marginBottom: 16, position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: -4, borderRadius: '28%', pointerEvents: 'none',
              background: 'linear-gradient(135deg, rgba(61,114,232,0.5), rgba(232,54,93,0.3))',
              filter: 'blur(10px)',
            }} />
            <img
              src="/sc_bubble.jpg"
              alt="StuntCock"
              style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: '22%', display: 'block', position: 'relative' }}
            />
          </div>
          <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.5px' }}>
            StuntCock
          </h1>
          <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>
            {mode === 'signup' ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            background: 'rgba(232,54,93,0.12)',
            border: '1px solid rgba(232,54,93,0.3)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 20,
            color: '#f87b99',
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Google Sign-in */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: '100%',
            padding: '11px 16px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.96)',
            color: '#1f1f1f',
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'opacity 0.15s, transform 0.15s',
            marginBottom: 20,
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ color: MUTED, fontSize: 12 }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleEmailSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              width: '100%',
              padding: '11px 16px',
              borderRadius: 12,
              border: 'none',
              background: loading || !email || !password
                ? 'rgba(61,114,232,0.4)'
                : `linear-gradient(135deg, ${BLUE}, ${BLUE2})`,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
              boxShadow: loading || !email || !password
                ? 'none'
                : '0 4px 20px rgba(61,114,232,0.4)',
              transition: 'all 0.15s',
            }}
          >
            {loading
              ? 'Please wait…'
              : mode === 'signup'
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        {/* Toggle sign-in / sign-up */}
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: MUTED }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#7aaeff', fontWeight: 600, fontSize: 13, padding: 0,
            }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
