// StuntCock — First-launch setup wizard for Signal registration
import React, { useState } from 'react';
import { API } from '../lib/utils.js';

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState('welcome');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/signal/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setStep('verify');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/signal/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setStep('done');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{
      background: 'linear-gradient(135deg, #0B1535 0%, #172255 60%, #0E1C48 100%)',
    }}>
      {/* Decorative glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #3D72E8 0%, transparent 70%)' }} />
      </div>

      <div className="relative w-full max-w-sm px-6">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="mb-4 relative">
            <img
              src="/stuntcock5.jpg"
              alt="StuntCock"
              className="w-24 h-24"
              style={{ objectFit: 'cover', borderRadius: '22%', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}
            />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Stunt Cock</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Your messages. Handled.</p>
        </div>

        {/* Card */}
        <div className="rounded-3xl p-6" style={{
          background: 'rgba(17,30,71,0.8)',
          border: '1px solid var(--border2)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}>
          {step === 'welcome' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-white font-semibold text-lg mb-1">Before you start</h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>A few things you'll need:</p>
              </div>
              <ul className="space-y-3">
                {[
                  'Java 17+ installed on your machine',
                  <>signal-cli on your PATH or set via <code className="text-[#3D72E8] text-xs">SIGNAL_CLI_PATH</code></>,
                  'Your phone number in E.164 format (+15550001234)',
                  'Signal will SMS a verification code to that number',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5"
                      style={{ background: 'var(--blue-pale)', color: 'var(--blue)' }}>{i+1}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs pt-1" style={{ color: 'var(--muted)' }}>
                Don't have signal-cli?{' '}
                <a href="https://github.com/AsamK/signal-cli/releases" target="_blank" rel="noreferrer"
                  className="text-[#3D72E8] underline">Download it here →</a>
              </p>
              <Btn onClick={() => setStep('register')}>Let's go →</Btn>
            </div>
          )}

          {step === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <h2 className="text-white font-semibold text-lg mb-1">Connect Signal</h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Enter your phone number to receive a verification code.</p>
              </div>
              <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+15550001234" required label="Phone number (E.164)" />
              {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
              <Btn type="submit" loading={loading}>{loading ? 'Sending SMS…' : 'Send verification code'}</Btn>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <h2 className="text-white font-semibold text-lg mb-1">Enter code</h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Signal just sent a code to <span className="text-white font-medium">{phone}</span>.
                </p>
              </div>
              <Input type="text" value={code} onChange={e => setCode(e.target.value)}
                placeholder="123456" required label="Verification code" />
              {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
              <Btn type="submit" loading={loading}>{loading ? 'Verifying…' : 'Verify & connect'}</Btn>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                style={{ background: 'rgba(61,114,232,0.15)', border: '2px solid rgba(61,114,232,0.4)' }}>
                <svg viewBox="0 0 20 20" fill="#3D72E8" className="w-8 h-8">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-lg">You're connected!</p>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                  StuntCock is now linked to <span className="text-white">{phone}</span>
                </p>
              </div>
              <Btn onClick={onComplete}>Open dashboard →</Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Btn({ children, onClick, type = 'button', loading, disabled }) {
  return (
    <button type={type} onClick={onClick} disabled={loading || disabled}
      className="w-full py-3 rounded-2xl text-white font-semibold text-sm transition-all disabled:opacity-50 active:scale-[0.98]"
      style={{ background: 'linear-gradient(135deg, #3D72E8, #2D5ACC)', boxShadow: '0 4px 16px rgba(61,114,232,0.35)' }}>
      {children}
    </button>
  );
}

function Input({ label, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--muted)' }}>{label}</label>}
      <input {...props}
        className="w-full rounded-2xl px-4 py-3 text-white text-sm placeholder-white/25 outline-none transition-all"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(61,114,232,0.6)'}
        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
      />
    </div>
  );
}
