// StuntCock — Marketing landing page, navy/blue palette from stuntcock5.jpg
import React, { useState, useEffect } from 'react';

// ─── Tokens (mirror dashboard palette) ───────────────────────────────────────
const BG     = '#0B1535';
const BG2    = '#111E47';
const BLUE   = '#3D72E8';
const BLUE2  = '#2D5ACC';
const RED    = '#E8365D';
const BORDER = 'rgba(255,255,255,0.08)';
const BORDER2= 'rgba(61,114,232,0.3)';
const MUTED  = 'rgba(255,255,255,0.45)';
const FONT   = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif";

// ─── Reusable ─────────────────────────────────────────────────────────────────

function BlueButton({ children, onClick, href, size = 'md' }) {
  const pad = size === 'lg' ? '14px 36px' : '10px 24px';
  const fs  = size === 'lg' ? '16px' : '14px';
  const el  = href ? 'a' : 'button';
  return React.createElement(el, {
    href, onClick,
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: pad, fontSize: fs, fontWeight: 700, borderRadius: 12,
      background: `linear-gradient(135deg, ${BLUE}, ${BLUE2})`,
      color: '#fff', textDecoration: 'none', border: 'none', cursor: 'pointer',
      boxShadow: '0 4px 24px rgba(61,114,232,0.4)',
      transition: 'transform 0.15s, box-shadow 0.15s',
    },
    onMouseEnter: e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(61,114,232,0.55)'; },
    onMouseLeave: e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 24px rgba(61,114,232,0.4)'; },
  }, children);
}

function GhostButton({ children, href }) {
  return (
    <a href={href} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '14px 32px', fontSize: 16, fontWeight: 600, borderRadius: 12,
      background: 'rgba(61,114,232,0.08)', color: '#fff', textDecoration: 'none',
      border: `1px solid ${BORDER2}`,
      transition: 'border-color 0.15s, background 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.background = 'rgba(61,114,232,0.15)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER2; e.currentTarget.style.background = 'rgba(61,114,232,0.08)'; }}>
      {children}
    </a>
  );
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

const IconRules = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
  </svg>
);

const IconLLM = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
);

const IconPrivacy = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 40px', height: 64,
      background: scrolled ? 'rgba(11,21,53,0.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? `1px solid ${BORDER}` : '1px solid transparent',
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="/stuntcock5.jpg" alt="StuntCock" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: '22%' }} />
        <span style={{ fontWeight: 800, fontSize: 17, color: '#fff', letterSpacing: '-0.3px' }}>StuntCock</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="https://github.com/AsamK/signal-cli/releases" target="_blank" rel="noreferrer"
          style={{ color: MUTED, fontSize: 14, textDecoration: 'none', padding: '6px 14px', transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = MUTED}>
          signal-cli →
        </a>
        <BlueButton onClick={() => { window.location.hash = 'app'; window.location.reload(); }}>
          Open dashboard
        </BlueButton>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      padding: '120px 24px 80px', position: 'relative', overflow: 'hidden',
    }}>
      {/* Blue radial glow */}
      <div style={{
        position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 700, height: 700, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(61,114,232,0.18) 0%, transparent 65%)',
      }} />
      {/* Red heart glow (lower) */}
      <div style={{
        position: 'absolute', top: '60%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 400, height: 400, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(232,54,93,0.1) 0%, transparent 65%)',
      }} />

      <div style={{ position: 'relative' }}>
        {/* App icon with glow ring */}
        <div style={{ display: 'inline-block', marginBottom: 32, position: 'relative' }}>
          <div style={{
            position: 'absolute', inset: -6, borderRadius: '28%', pointerEvents: 'none',
            background: 'linear-gradient(135deg, rgba(61,114,232,0.5), rgba(232,54,93,0.3))',
            filter: 'blur(12px)',
          }} />
          <img src="/stuntcock5.jpg" alt="StuntCock" style={{
            width: 104, height: 104, objectFit: 'cover', borderRadius: '22%',
            display: 'block', position: 'relative',
            boxShadow: '0 0 0 1px rgba(61,114,232,0.4), 0 24px 56px rgba(0,0,0,0.7)',
          }} />
        </div>

        {/* Badge */}
        <div style={{ marginBottom: 24 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 20, fontSize: 12,
            fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: 'rgba(61,114,232,0.12)', color: BLUE,
            border: `1px solid rgba(61,114,232,0.3)`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: BLUE, display: 'inline-block' }} />
            Signal auto-responder
          </span>
        </div>

        <h1 style={{
          fontSize: 'clamp(44px, 7vw, 84px)', fontWeight: 900, lineHeight: 1.02,
          letterSpacing: '-2.5px', color: '#fff', margin: '0 0 22px',
        }}>
          Your messages.<br />
          <span style={{
            background: `linear-gradient(135deg, ${BLUE} 0%, #6B9FFF 50%, ${RED} 100%)`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Handled.</span>
        </h1>

        <p style={{
          fontSize: 'clamp(16px, 2.2vw, 20px)', color: MUTED, maxWidth: 520,
          lineHeight: 1.65, margin: '0 auto 44px',
        }}>
          StuntCock monitors your Signal inbox and fires smart auto-replies —
          rule-based or Claude-powered — while you stay heads-down.
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <BlueButton size="lg" onClick={() => { window.location.hash = 'app'; window.location.reload(); }}>
            Open dashboard →
          </BlueButton>
          <GhostButton href="#how-it-works">See how it works</GhostButton>
        </div>

        {/* Local badge */}
        <div style={{
          marginTop: 60, display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 18px', borderRadius: 20, fontSize: 13, color: MUTED,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${BORDER}`,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', display: 'inline-block', flexShrink: 0 }} />
          Runs entirely on your machine · no cloud · no telemetry
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    Icon: IconRules,
    accent: BLUE,
    accentBg: 'rgba(61,114,232,0.12)',
    accentBorder: 'rgba(61,114,232,0.25)',
    title: 'Rule Engine',
    desc: 'Define triggers — exact match, contains, starts-with, or regex — and pair them with static replies, templates, or Claude. Rules run in priority order with per-sender cooldowns.',
    pills: ['Regex support', 'Cooldowns', 'Schedule windows'],
    pillColor: BLUE,
    pillBg: 'rgba(61,114,232,0.1)',
    pillBorder: 'rgba(61,114,232,0.25)',
  },
  {
    Icon: IconLLM,
    accent: RED,
    accentBg: 'rgba(232,54,93,0.12)',
    accentBorder: 'rgba(232,54,93,0.25)',
    title: 'LLM Fallback',
    desc: 'When no rule matches, Claude steps in. Gets the last 10 messages for context, follows your system prompt, and caps responses at 500 characters so replies stay sharp.',
    pills: ['claude-sonnet-4-6', 'Context window', '500-char cap'],
    pillColor: RED,
    pillBg: 'rgba(232,54,93,0.1)',
    pillBorder: 'rgba(232,54,93,0.25)',
  },
  {
    Icon: IconPrivacy,
    accent: BLUE,
    accentBg: 'rgba(61,114,232,0.12)',
    accentBorder: 'rgba(61,114,232,0.25)',
    title: 'Privacy-First',
    desc: 'Your messages never leave your machine except to Signal\'s own servers — and Anthropic\'s API only when LLM fallback fires. No analytics, no tracking, no cloud storage.',
    pills: ['Local SQLite', 'No telemetry', 'Open source'],
    pillColor: BLUE,
    pillBg: 'rgba(61,114,232,0.1)',
    pillBorder: 'rgba(61,114,232,0.25)',
  },
];

function Features() {
  return (
    <section style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#fff', margin: '0 0 12px', letterSpacing: '-1px' }}>
          Built for the way you actually work
        </h2>
        <p style={{ color: MUTED, fontSize: 17, maxWidth: 480, margin: '0 auto' }}>
          Three components that stay out of your way until someone messages you.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {FEATURES.map(({ Icon, accent, accentBg, accentBorder, title, desc, pills, pillColor, pillBg, pillBorder }) => (
          <div key={title} style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${BORDER}`,
            borderRadius: 20, padding: '28px 28px 24px',
            backdropFilter: 'blur(8px)',
            transition: 'border-color 0.2s, background 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = accentBorder; e.currentTarget.style.background = accentBg.replace('0.12', '0.05'); }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, marginBottom: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: accentBg, border: `1px solid ${accentBorder}`,
            }}>
              <Icon />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 10px' }}>{title}</h3>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.65, margin: '0 0 20px' }}>{desc}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {pills.map(p => (
                <span key={p} style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: pillBg, color: pillColor, border: `1px solid ${pillBorder}`,
                }}>{p}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    n: '01',
    title: 'Install signal-cli',
    body: 'Download the latest release and point StuntCock at it via SIGNAL_CLI_PATH. Java 17+ required.',
    code: 'brew install signal-cli',
  },
  {
    n: '02',
    title: 'Run npm run dev',
    body: 'Starts the Express backend and Vite frontend concurrently. Open localhost:5173 and complete the setup wizard to link your number.',
    code: 'npm run dev',
  },
  {
    n: '03',
    title: 'Set your rules',
    body: 'Add rules in the dashboard, seed the five built-in defaults, or let Claude handle everything automatically.',
    code: 'npm run seed',
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" style={{ padding: '80px 24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: '#fff', margin: '0 0 12px', letterSpacing: '-1px' }}>
          Up in three steps
        </h2>
        <p style={{ color: MUTED, fontSize: 17 }}>No accounts. No API tokens required to start.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STEPS.map(({ n, title, body, code }) => (
          <div key={n} style={{
            display: 'grid', gridTemplateColumns: '60px 1fr auto',
            alignItems: 'center', gap: 24,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${BORDER}`,
            borderRadius: 18, padding: '22px 28px',
            backdropFilter: 'blur(8px)',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = BORDER2}
          onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(61,114,232,0.12)', border: `1px solid ${BORDER2}`,
              fontWeight: 800, fontSize: 14, color: BLUE,
            }}>{n}</div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{title}</h3>
              <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, margin: 0 }}>{body}</p>
            </div>
            <code style={{
              display: 'block', padding: '9px 14px', borderRadius: 10, fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'nowrap',
              background: 'rgba(61,114,232,0.08)', color: BLUE,
              border: `1px solid ${BORDER2}`,
            }}>{code}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────

function CTA() {
  return (
    <section style={{ padding: '80px 24px 100px', textAlign: 'center' }}>
      <div style={{
        display: 'inline-block', maxWidth: 600, width: '100%',
        background: 'rgba(61,114,232,0.06)',
        border: `1px solid rgba(61,114,232,0.25)`,
        borderRadius: 28, padding: '52px 40px',
        backdropFilter: 'blur(16px)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* subtle glow behind card */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 400, height: 200, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(61,114,232,0.15) 0%, transparent 70%)',
        }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'inline-block', marginBottom: 24, position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: -4, borderRadius: '26%', pointerEvents: 'none',
              background: 'linear-gradient(135deg, rgba(61,114,232,0.4), rgba(232,54,93,0.25))',
              filter: 'blur(8px)',
            }} />
            <img src="/stuntcock5.jpg" alt="" style={{
              width: 72, height: 72, objectFit: 'cover', borderRadius: '22%',
              display: 'block', position: 'relative',
              boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
            }} />
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: '#fff', margin: '0 0 12px', letterSpacing: '-1px' }}>
            Ready to go hands-free?
          </h2>
          <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.6, margin: '0 0 32px' }}>
            StuntCock is open, local, and ready to run. No signup. No subscription.
          </p>
          <BlueButton size="lg" onClick={() => { window.location.hash = 'app'; window.location.reload(); }}>
            Launch StuntCock →
          </BlueButton>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer style={{
      borderTop: `1px solid ${BORDER}`, padding: '28px 40px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src="/stuntcock5.jpg" alt="" style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: '22%', opacity: 0.7 }} />
        <span style={{ color: MUTED, fontSize: 13 }}>StuntCock — Your messages. Handled.</span>
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        {[
          { label: 'signal-cli', href: 'https://github.com/AsamK/signal-cli/releases' },
          { label: 'Anthropic API', href: 'https://console.anthropic.com' },
          { label: 'Privacy', href: '#privacy' },
        ].map(({ label, href }) => (
          <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
            style={{ color: MUTED, fontSize: 13, textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = MUTED}>
            {label}
          </a>
        ))}
      </div>
      <p id="privacy" style={{ width: '100%', color: 'rgba(255,255,255,0.2)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
        Privacy: message content is never stored in any cloud. It is sent to Anthropic's API only when LLM fallback fires, and to Signal's infrastructure as normal. No telemetry. No third-party tracking.
      </p>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${BG} 0%, ${BG2} 50%, #0E1C48 100%)`,
      backgroundAttachment: 'fixed',
      minHeight: '100vh', color: '#fff', fontFamily: FONT,
    }}>
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <CTA />
      <Footer />
    </div>
  );
}
