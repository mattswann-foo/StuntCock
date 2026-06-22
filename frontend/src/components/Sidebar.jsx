// StuntCock — Sidebar: logo, wordmark, nav, Signal status, quick stats
import React from 'react';
import { cn } from '../lib/utils.js';

const NAV = [
  { id: 'feed',      label: 'Message Feed',  icon: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3 1h10v6H5V6zm2 1a1 1 0 100 2 1 1 0 000-2zm4 0a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd"/>
    </svg>
  )},
  { id: 'rules',     label: 'Rules',         icon: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM6.343 4.929a1 1 0 00-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707zm8.485 0a1 1 0 10-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707zM10 7a3 3 0 100 6 3 3 0 000-6zm-7 3a1 1 0 110 2H2a1 1 0 010-2h1zm15 0a1 1 0 110 2h-1a1 1 0 010-2h1zM6.343 14.657a1 1 0 10-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zm9.9-1.414a1 1 0 00-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707zM11 17a1 1 0 10-2 0v1a1 1 0 102 0v-1z"/>
    </svg>
  )},
  { id: 'analytics', label: 'Analytics',     icon: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z"/>
      <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z"/>
    </svg>
  )},
  { id: 'personas',  label: 'Personas',      icon: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
    </svg>
  )},
  { id: 'settings',  label: 'Settings',      icon: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
    </svg>
  )},
];

export default function Sidebar({ page, setPage, signalStatus, whatsappStatus, stats, user, onSignOut }) {
  const isOnline = signalStatus?.running;
  const waOnline = whatsappStatus?.running || whatsappStatus?.authenticated;

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col h-screen border-r" style={{
      background: 'rgba(8,13,40,0.85)',
      backdropFilter: 'blur(20px)',
      borderColor: 'var(--border)',
    }}>
      {/* Logo + wordmark */}
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <img
            src="/sc_bubble.jpg"
            alt="StuntCock"
            className="w-10 h-10 flex-shrink-0"
            style={{ objectFit: 'cover', objectPosition: 'center', borderRadius: '22%', boxShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
          />
          <div>
            <div className="text-white font-bold text-base leading-tight tracking-tight">StuntCock</div>
            <div className="text-xs leading-tight" style={{ color: 'var(--muted)' }}>Your messages. Handled.</div>
          </div>
        </div>
      </div>

      {/* Platform status pills */}
      <div className="px-5 py-3 space-y-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
          isOnline ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isOnline ? 'bg-green-400 pulse-glow' : 'bg-red-500')} />
          {isOnline ? 'Signal connected' : 'Signal offline'}
        </div>
        <div className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
          waOnline ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-white/30'
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', waOnline ? 'bg-green-400 pulse-glow' : 'bg-white/20')} />
          {waOnline ? 'WhatsApp connected' : 'WhatsApp off'}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {NAV.map(item => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left font-medium',
              page === item.id
                ? 'text-white'
                : 'text-white/50 hover:text-white/80'
            )}
            style={page === item.id ? {
              background: 'linear-gradient(135deg, rgba(61,114,232,0.25), rgba(61,114,232,0.12))',
              border: '1px solid rgba(61,114,232,0.35)',
              color: 'white',
            } : {
              border: '1px solid transparent',
            }}
          >
            <span className={page === item.id ? 'text-[#3D72E8]' : 'text-white/30'}>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Quick stats */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Today</p>
        <div className="space-y-2">
          {[
            { label: 'Messages',    value: stats?.total ?? 0,      color: 'text-white' },
            { label: 'Replied',     value: stats?.replied ?? 0,    color: 'text-[#3D72E8]' },
            { label: 'Active rules',value: stats?.activeRules ?? 0, color: 'text-white' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{label}</span>
              <span className={`text-xs font-bold ${color}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Signed-in user + sign-out */}
      {user && (
        <div className="px-5 pb-5" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          {(user.displayName || user.email) && (
            <p className="text-xs truncate mb-2" style={{ color: 'rgba(255,255,255,0.35)' }} title={user.email}>
              {user.displayName || user.email}
            </p>
          )}
          <button
            onClick={onSignOut}
            className="w-full text-xs font-medium py-1.5 px-3 rounded-lg transition-colors text-left"
            style={{
              color: 'rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
          >
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
