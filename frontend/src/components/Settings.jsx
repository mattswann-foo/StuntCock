// StuntCock — Settings panel
import React, { useEffect, useState } from 'react';
import { API } from '../lib/utils.js';

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
    global_cooldown_minutes: '0',
    timezone: 'America/New_York',
  });
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/settings`).then(r => r.json())
      .then(data => setForm(f => ({ ...f, ...data }))).catch(() => {});
  }, []);

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
