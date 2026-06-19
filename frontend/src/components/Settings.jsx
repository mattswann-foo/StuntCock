// StuntCock — Settings panel
import React, { useEffect, useState } from 'react';
import { API } from '../lib/utils.js';
import { useWebSocket } from '../hooks/useWebSocket.js';

const TIMEZONES = [
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'America/Anchorage','Pacific/Honolulu','Europe/London','Europe/Paris',
  'Europe/Berlin','Europe/Moscow','Asia/Dubai','Asia/Kolkata',
  'Asia/Singapore','Asia/Tokyo','Australia/Sydney','Pacific/Auckland',
];

const inputStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '14px',
  color: 'white',
  padding: '10px 14px',
  fontSize: '13px',
  width: '100%',
  outline: 'none',
};

export default function Settings() {
  const [form, setForm] = useState({
    anthropic_api_key: '',
    llm_system_prompt: '',
    llm_enabled: 'true',
    gif_enabled: 'false',
    gif_frequency: '0.3',
    giphy_api_key: '',
    global_cooldown_minutes: '0',
    timezone: 'America/New_York',
    whatsapp_enabled: 'false',
  });
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [waStatus, setWaStatus] = useState({ running: false, authenticated: false, qrDataUrl: null });
  const [signalStatus, setSignalStatus] = useState({ running: false, enabled: true });

  useEffect(() => {
    fetch(`${API}/api/settings`).then(r => r.json())
      .then(data => setForm(f => ({ ...f, ...data }))).catch(() => {});
    fetch(`${API}/api/whatsapp/status`).then(r => r.json())
      .then(setWaStatus).catch(() => {});
    fetch(`${API}/api/signal/status`).then(r => r.json())
      .then(setSignalStatus).catch(() => {});
  }, []);

  useWebSocket((event, data) => {
    if (event === 'whatsapp_status') setWaStatus(s => ({ ...s, ...data }));
    if (event === 'whatsapp_qr') setWaStatus(s => ({ ...s, qrDataUrl: data.qrDataUrl, authenticated: false }));
    if (event === 'signal_status') setSignalStatus(s => ({ ...s, ...data }));
  });

  const toggleSignal = async (enable) => {
    await fetch(`${API}/api/signal/${enable ? 'enable' : 'disable'}`, { method: 'POST' });
    setSignalStatus(s => ({ ...s, enabled: enable }));
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    await fetch(`${API}/api/settings/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <form onSubmit={save} className="max-w-lg space-y-5">

        <Section title="LLM Fallback" desc="When enabled, unmatched messages are sent to Claude for a response.">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-white/70">Enable Claude LLM fallback</span>
            <Toggle checked={form.llm_enabled === 'true'} onChange={v => set('llm_enabled', v ? 'true' : 'false')} />
          </label>
        </Section>

        <Section title="Anthropic API Key" desc="Required for LLM fallback. Never sent anywhere except Anthropic's API.">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={form.anthropic_api_key}
              onChange={e => set('anthropic_api_key', e.target.value)}
              placeholder="sk-ant-..."
              style={{ ...inputStyle, paddingRight: '72px' }}
              onFocus={e => e.target.style.borderColor = 'rgba(61,114,232,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
            <button type="button" onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)' }}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </Section>

        <Section title="LLM System Prompt" desc="Instructions Claude follows when generating auto-replies.">
          <textarea rows={5} value={form.llm_system_prompt}
            onChange={e => set('llm_system_prompt', e.target.value)}
            placeholder="You are a helpful personal assistant replying to Signal messages on behalf of the user. Keep replies brief, friendly, and natural."
            style={{ ...inputStyle, resize: 'vertical' }}
            onFocus={e => e.target.style.borderColor = 'rgba(61,114,232,0.6)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
          />
        </Section>

        <Section title="Signal" desc="Toggle Signal message handling on or off. Disabling stops signal-cli and pauses all Signal auto-replies.">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-white/70">Enable Signal</span>
            <Toggle checked={signalStatus.enabled} onChange={toggleSignal} />
          </label>
          <div className="flex items-center gap-2 pt-1">
            <span className={`w-2 h-2 rounded-full ${signalStatus.running ? 'bg-green-400' : 'bg-zinc-600'}`} />
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {signalStatus.running ? 'signal-cli running' : signalStatus.enabled ? 'Starting…' : 'Disabled'}
            </span>
          </div>
        </Section>

        <Section title="WhatsApp" desc="Connect a WhatsApp number via QR code scan. Rules and LLM fallback apply to both platforms.">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-white/70">Enable WhatsApp</span>
            <Toggle checked={form.whatsapp_enabled === 'true'} onChange={v => set('whatsapp_enabled', v ? 'true' : 'false')} />
          </label>
          {form.whatsapp_enabled === 'true' && (
            <div className="space-y-3 pt-1">
              {waStatus.authenticated || waStatus.running ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>WhatsApp connected</span>
                </div>
              ) : waStatus.qrDataUrl ? (
                <div className="space-y-2">
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    Scan this QR code with WhatsApp on your phone (Linked Devices → Link a Device).
                  </p>
                  <img src={waStatus.qrDataUrl} alt="WhatsApp QR"
                    className="rounded-xl"
                    style={{ width: 200, height: 200, background: 'white', padding: 8 }} />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Starting WhatsApp… QR code will appear here</span>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section title="GIF Replies" desc="Occasionally reply with just a GIF instead of a text response — like a real person would.">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-white/70">Enable GIF replies</span>
            <Toggle checked={form.gif_enabled === 'true'} onChange={v => set('gif_enabled', v ? 'true' : 'false')} />
          </label>
          {form.gif_enabled === 'true' && (<>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Frequency</span>
                <span className="text-sm font-semibold" style={{ color: '#3D72E8' }}>
                  {Math.round(parseFloat(form.gif_frequency || 0.3) * 100)}%
                </span>
              </div>
              <input
                type="range" min="0.05" max="0.75" step="0.05"
                value={form.gif_frequency || '0.3'}
                onChange={e => set('gif_frequency', e.target.value)}
                style={{ width: '100%', accentColor: '#3D72E8' }}
              />
              <div className="flex justify-between text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <span>Rarely</span><span>Sometimes</span><span>Often</span>
              </div>
            </div>
            <input
              type="text"
              value={form.giphy_api_key}
              onChange={e => set('giphy_api_key', e.target.value)}
              placeholder="Giphy API key (free at giphy.com/developer)"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'rgba(61,114,232,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </>)}
        </Section>

        <Section title="Global Default Cooldown" desc="Applied to rules that don't have their own cooldown set.">
          <div className="flex items-center gap-3">
            <input type="number" min="0" value={form.global_cooldown_minutes}
              onChange={e => set('global_cooldown_minutes', e.target.value)}
              style={{ ...inputStyle, width: '96px' }}
              onFocus={e => e.target.style.borderColor = 'rgba(61,114,232,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
            <span className="text-sm text-white/50">minutes</span>
          </div>
        </Section>

        <Section title="Schedule Timezone" desc="Used to evaluate rule time windows.">
          <select value={form.timezone} onChange={e => set('timezone', e.target.value)}
            style={{ ...inputStyle, appearance: 'none' }}
            onFocus={e => e.target.style.borderColor = 'rgba(61,114,232,0.6)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
          >
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Section>

        <button type="submit"
          className="px-6 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all"
          style={{ background: 'linear-gradient(135deg, #3D72E8, #2D5ACC)', boxShadow: '0 4px 16px rgba(61,114,232,0.3)' }}>
          {saved ? '✓ Saved' : 'Save settings'}
        </button>
      </form>
    </div>
  );
}

function Section({ title, desc, children }) {
  return (
    <div className="rounded-2xl p-5 space-y-3" style={{
      background: 'rgba(17,30,71,0.5)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {desc && <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 transition-all"
      style={{ width: 40, height: 22, borderRadius: 11, background: checked ? '#3D72E8' : 'rgba(255,255,255,0.15)' }}>
      <span className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all"
        style={{ left: checked ? '20px' : '3px' }} />
    </button>
  );
}
