// StuntCock — Rules CRUD editor with drag-to-reorder
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { API, getAuthHeaders } from '../lib/utils.js';
import { PersonaModal } from './Personas.jsx';

const EMPTY_RULE = {
  name: '', active: true, trigger_type: 'contains', trigger_value: '',
  sender_filter: 'all', response_type: 'static', response_text: '',
  schedule_start: '', schedule_end: '', schedule_days: '', cooldown_minutes: 0,
  rule_llm_prompt: '', rule_gif_enabled: '', rule_gif_frequency: '', persona_id: null, platform_filter: 'any',
};

// ---- shared style tokens ----
const card = {
  background: 'rgba(17,30,71,0.6)',
  border: '1px solid rgba(255,255,255,0.07)',
  backdropFilter: 'blur(12px)',
};
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
const focusStyle = { borderColor: 'rgba(61,114,232,0.6)' };
const blurStyle  = { borderColor: 'rgba(255,255,255,0.1)' };

function Input({ label, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs mb-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</label>}
      <input {...props} style={inputStyle}
        onFocus={e => Object.assign(e.target.style, focusStyle)}
        onBlur={e => Object.assign(e.target.style, blurStyle)} />
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs mb-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</label>}
      <select {...props} style={{ ...inputStyle, appearance: 'none' }}
        onFocus={e => Object.assign(e.target.style, focusStyle)}
        onBlur={e => Object.assign(e.target.style, blurStyle)}>
        {children}
      </select>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 transition-all"
      style={{ width: 36, height: 20, borderRadius: 10, background: checked ? '#3D72E8' : 'rgba(255,255,255,0.15)' }}>
      <span className="absolute top-[2px] w-4 h-4 rounded-full bg-white shadow transition-all"
        style={{ left: checked ? '16px' : '2px' }} />
    </button>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs mb-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</label>}
      <textarea {...props} style={{ ...inputStyle, resize: 'none' }}
        onFocus={e => Object.assign(e.target.style, focusStyle)}
        onBlur={e => Object.assign(e.target.style, blurStyle)} />
    </div>
  );
}

function RuleModal({ rule, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_RULE, ...rule });
  const [personas, setPersonas] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [showContactPicker, setShowContactPicker] = useState(false);
  const pickerRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const handleClick = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowContactPicker(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    fetch(`${API}/api/personas`).then(r => r.json()).then(setPersonas).catch(() => {});
    fetch(`${API}/api/contacts`).then(r => r.json()).then(setContacts).catch(() => {});
  }, []);

  const saveNewPersona = async (p) => {
    const res = await fetch(`${API}/api/personas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    const created = await res.json();
    setPersonas(prev => [...prev, created]);
    set('persona_id', created.id);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-3xl overflow-hidden" style={{
        background: 'linear-gradient(160deg, #111E47, #0D1840)',
        border: '1px solid rgba(61,114,232,0.3)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div className="px-6 py-4 flex justify-between items-center"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-white font-semibold">{rule?.id ? 'Edit Rule' : 'New Rule'}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.4)' }}>✕</button>
        </div>

        <form onSubmit={e => { e.preventDefault(); onSave(form).then(onClose); }} className="px-6 py-5 space-y-4">
          <Input label="Rule name" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Night owl reply" />

          <div className="grid grid-cols-2 gap-3">
            <Select label="Trigger type" value={form.trigger_type} onChange={e => set('trigger_type', e.target.value)}>
              <option value="any">Any message</option>
              <option value="contains">Contains</option>
              <option value="starts_with">Starts with</option>
              <option value="exact">Exact match</option>
              <option value="regex">Regex</option>
            </Select>
            {form.trigger_type !== 'any' && (
              <Input label="Trigger value" value={form.trigger_value} onChange={e => set('trigger_value', e.target.value)}
                placeholder={form.trigger_type === 'contains' ? 'word|other word' : ''} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select label="Platform" value={form.platform_filter} onChange={e => set('platform_filter', e.target.value)}>
              <option value="any">Any platform</option>
              <option value="signal">Signal only</option>
              <option value="whatsapp">WhatsApp only</option>
            </Select>

            {/* Contact / sender picker */}
            <div>
              <label className="block text-xs mb-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>Who this rule applies to</label>
              <div className="relative" ref={pickerRef}>
                <button type="button"
                  onClick={() => setShowContactPicker(v => !v)}
                  className="w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl text-sm"
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  <span className="truncate" style={{ color: form.sender_filter === 'all' ? 'rgba(255,255,255,0.35)' : 'white' }}>
                    {form.sender_filter === 'all' ? 'Everyone (no filter)' : (() => {
                      const c = contacts.find(x => x.sender === form.sender_filter);
                      const icon = !c ? '' : c.platform === 'both' ? '📞💬' : c.platform === 'whatsapp' ? '💬' : '📞';
                      return c ? `${icon} ${c.sender_name || c.sender}` : form.sender_filter;
                    })()}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>▼</span>
                </button>

                {showContactPicker && (
                  <div className="absolute top-full left-0 right-0 z-30 mt-1 rounded-2xl overflow-hidden shadow-2xl"
                    style={{ background: 'rgba(13,24,65,0.98)', border: '1px solid rgba(61,114,232,0.35)', backdropFilter: 'blur(16px)', maxHeight: 260, overflowY: 'auto' }}>

                    <div className="p-2 sticky top-0" style={{ background: 'rgba(13,24,65,0.98)' }}>
                      <input autoFocus value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                        placeholder="Search contacts…" className="w-full rounded-xl px-3 py-1.5 text-xs outline-none"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    </div>

                    {/* Everyone option */}
                    <button type="button" onClick={() => { set('sender_filter', 'all'); setShowContactPicker(false); setContactSearch(''); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-white/5 transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-base">🌐</span>
                      <div>
                        <div className="font-semibold text-white text-xs">Everyone</div>
                        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>No sender filter — applies to all</div>
                      </div>
                      {form.sender_filter === 'all' && <span className="ml-auto text-[#3D72E8] text-xs font-bold">✓</span>}
                    </button>

                    {/* Known contacts from message history */}
                    {contacts
                      .filter(c => {
                        if (form.platform_filter !== 'any') {
                          // show contact if they have activity on the filtered platform
                          const plats = (c.platforms || c.platform || '').split(',');
                          if (!plats.includes(form.platform_filter)) return false;
                        }
                        if (!contactSearch) return true;
                        const q = contactSearch.toLowerCase();
                        return (c.sender_name || '').toLowerCase().includes(q) || c.sender.toLowerCase().includes(q);
                      })
                      .map(c => {
                        const name = c.sender_name || null;
                        const icon = c.platform === 'both' ? '📞💬' : c.platform === 'whatsapp' ? '💬' : '📞';
                        const isSelected = form.sender_filter === c.sender;
                        return (
                          <button key={c.sender} type="button"
                            onClick={() => { set('sender_filter', c.sender); setShowContactPicker(false); setContactSearch(''); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                            style={{ background: isSelected ? 'rgba(61,114,232,0.12)' : undefined }}>
                            <span className="text-base flex-shrink-0">{icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-white truncate">{name || c.sender}</div>
                              {name && <div className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{c.sender}</div>}
                              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                {c.platform === 'both' ? 'Signal + WhatsApp' : c.platform} · {c.message_count} msg{c.message_count !== 1 ? 's' : ''}
                              </div>
                            </div>
                            {isSelected && <span className="ml-auto text-[#3D72E8] text-xs font-bold flex-shrink-0">✓</span>}
                          </button>
                        );
                      })}

                    {/* Manual entry fallback */}
                    <div className="p-2 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <input value={form.sender_filter === 'all' || contacts.find(c => c.sender === form.sender_filter) ? '' : form.sender_filter}
                        onChange={e => set('sender_filter', e.target.value || 'all')}
                        placeholder="Or type phone / JID manually…"
                        className="w-full rounded-xl px-3 py-1.5 text-xs outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'white' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select label="Response type" value={form.response_type} onChange={e => set('response_type', e.target.value)}>
              <option value="static">Static text</option>
              <option value="template">Template</option>
              <option value="llm">♥ LLM (Claude)</option>
            </Select>
            <Input label="Cooldown (minutes)" type="number" min="0"
              value={form.cooldown_minutes} onChange={e => set('cooldown_minutes', parseInt(e.target.value) || 0)} />
          </div>

          {form.response_type !== 'llm' && (
            <Textarea label="Response text" rows={3} value={form.response_text} onChange={e => set('response_text', e.target.value)}
              placeholder={form.response_type === 'template' ? 'Hi {sender_name}, reply at {time}.' : 'Type your reply…'} />
          )}

          {form.response_type === 'llm' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>Persona</label>
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                <div
                  onClick={() => set('persona_id', null)}
                  className="rounded-xl px-3 py-2.5 cursor-pointer transition-all"
                  style={{
                    background: !form.persona_id ? 'rgba(61,114,232,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${!form.persona_id ? 'rgba(61,114,232,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  }}>
                  <div className="text-lg leading-none mb-1">🌐</div>
                  <div className="text-xs font-semibold text-white">Global default</div>
                  <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Use settings prompt</div>
                </div>
                {personas.map(p => (
                  <div key={p.id}
                    onClick={() => set('persona_id', p.id)}
                    className="rounded-xl px-3 py-2.5 cursor-pointer transition-all"
                    style={{
                      background: form.persona_id === p.id ? 'rgba(61,114,232,0.2)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${form.persona_id === p.id ? 'rgba(61,114,232,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    <div className="text-lg leading-none mb-1">{p.emoji}</div>
                    <div className="text-xs font-semibold text-white truncate">{p.name}</div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{p.description || 'Custom'}</div>
                  </div>
                ))}
                <div
                  onClick={() => setShowPersonaModal(true)}
                  className="rounded-xl px-3 py-2.5 cursor-pointer transition-all flex flex-col items-center justify-center"
                  style={{ border: '1px dashed rgba(61,114,232,0.35)', background: 'rgba(61,114,232,0.04)' }}>
                  <div className="text-lg leading-none mb-1 text-[#3D72E8]">+</div>
                  <div className="text-xs font-semibold text-[#3D72E8]">New persona</div>
                </div>
              </div>
              {form.persona_id === null && (
                <Textarea label="Custom prompt override (optional)" rows={3}
                  value={form.rule_llm_prompt || ''}
                  onChange={e => set('rule_llm_prompt', e.target.value)}
                  placeholder="Leave blank to use the global system prompt…" />
              )}
            </div>
          )}
          {showPersonaModal && (
            <PersonaModal persona={null} onSave={saveNewPersona} onClose={() => setShowPersonaModal(false)} />
          )}

          {/* Per-rule GIF override */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>GIF replies — override global setting</p>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {form.rule_gif_enabled === '' ? 'Use global setting' : form.rule_gif_enabled === 'true' ? 'GIFs enabled' : 'GIFs disabled'}
              </span>
              <div className="flex items-center gap-2">
                <button type="button"
                  className="text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ color: form.rule_gif_enabled === '' ? '#3D72E8' : 'rgba(255,255,255,0.35)', background: form.rule_gif_enabled === '' ? 'rgba(61,114,232,0.15)' : 'rgba(255,255,255,0.05)' }}
                  onClick={() => set('rule_gif_enabled', '')}>
                  Global
                </button>
                <Toggle
                  checked={form.rule_gif_enabled === 'true'}
                  onChange={v => set('rule_gif_enabled', form.rule_gif_enabled === '' ? 'true' : v ? 'true' : 'false')}
                />
              </div>
            </div>
            {form.rule_gif_enabled === 'true' && (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Frequency</span>
                  <span className="text-xs font-semibold" style={{ color: '#3D72E8' }}>
                    {Math.round(parseFloat(form.rule_gif_frequency || 0.3) * 100)}%
                  </span>
                </div>
                <input type="range" min="0.05" max="0.75" step="0.05"
                  value={form.rule_gif_frequency || '0.3'}
                  onChange={e => set('rule_gif_frequency', e.target.value)}
                  style={{ width: '100%', accentColor: '#3D72E8' }} />
                <div className="flex justify-between text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  <span>Rarely</span><span>Often</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Schedule start (HH:MM)" type="time" value={form.schedule_start} onChange={e => set('schedule_start', e.target.value)} />
            <Input label="Schedule end (HH:MM)" type="time" value={form.schedule_end} onChange={e => set('schedule_end', e.target.value)} />
          </div>

          <Input label="Active days (0=Sun…6=Sat, comma-sep, blank=all)" value={form.schedule_days}
            onChange={e => set('schedule_days', e.target.value)} placeholder="1,2,3,4,5 for weekdays" />

          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className={`relative w-10 h-5.5 rounded-full transition-colors ${form.active ? '' : ''}`}
              style={{ background: form.active ? '#3D72E8' : 'rgba(255,255,255,0.15)', height: '22px', width: '40px', position: 'relative', borderRadius: '11px' }}
              onClick={() => set('active', !form.active)}>
              <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                style={{ left: form.active ? '20px' : '2px' }} />
            </div>
            <span className="text-sm text-white/70">Rule active</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button type="submit"
              className="flex-1 py-3 rounded-2xl text-white font-semibold text-sm transition-all"
              style={{ background: 'linear-gradient(135deg, #3D72E8, #2D5ACC)', boxShadow: '0 4px 16px rgba(61,114,232,0.3)' }}>
              Save rule
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-3 rounded-2xl text-sm font-medium transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RulesEditor() {
  const [rules, setRules] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [editRule, setEditRule] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const dragIdx = useRef(null);

  const load = () => fetch(`${API}/api/rules`, { headers: getAuthHeaders() }).then(r => r.json()).then(setRules).catch(() => {});
  useEffect(() => {
    load();
    fetch(`${API}/api/contacts`).then(r => r.json()).then(setContacts).catch(() => {});
  }, []);

  const saveRule = async (form) => {
    if (form.id) {
      await fetch(`${API}/api/rules/${form.id}`, { method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    } else {
      await fetch(`${API}/api/rules`, { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    }
    load();
  };

  const deleteRule = async (id) => {
    if (!confirm('Delete this rule?')) return;
    await fetch(`${API}/api/rules/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    load();
  };

  const toggleActive = async (rule) => {
    await fetch(`${API}/api/rules/${rule.id}`, { method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rule, active: !rule.active }) });
    load();
  };

  const duplicateRule = async (rule) => {
    const { id, created_at, updated_at, ...rest } = rule;
    await fetch(`${API}/api/rules`, { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rest, name: rest.name + ' (copy)' }) });
    load();
  };

  const handleDrop = async (toIdx) => {
    if (dragIdx.current === null || dragIdx.current === toIdx) return;
    const reordered = [...rules];
    const [moved] = reordered.splice(dragIdx.current, 1);
    reordered.splice(toIdx, 0, moved);
    setRules(reordered);
    dragIdx.current = null;
    await fetch(`${API}/api/rules/reorder`, { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: reordered.map(r => r.id) }) });
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <div className="flex justify-between items-center mb-5">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {rules.filter(r => r.active).length} of {rules.length} active · first match wins
        </p>
        <button
          onClick={() => { setEditRule(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl text-white text-sm font-semibold transition-all"
          style={{ background: 'linear-gradient(135deg, #3D72E8, #2D5ACC)', boxShadow: '0 4px 16px rgba(61,114,232,0.3)' }}>
          <span className="text-base leading-none">+</span> New rule
        </button>
      </div>

      {rules.length === 0 && (
        <div className="text-center py-20">
          <p className="text-sm font-medium text-white/30">No rules yet</p>
          <p className="text-xs mt-1 text-white/20">StuntCock will use LLM fallback for everything.</p>
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule, idx) => (
          <div key={rule.id}
            draggable
            onDragStart={() => dragIdx.current = idx}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDrop(idx)}
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all cursor-grab active:cursor-grabbing group"
            style={{
              ...card,
              borderLeft: rule.active ? '3px solid #3D72E8' : '3px solid rgba(255,255,255,0.1)',
              opacity: rule.active ? 1 : 0.5,
            }}
          >
            {/* drag handle */}
            <span className="text-white/15 group-hover:text-white/40 transition-colors select-none text-sm">⠿</span>

            {/* info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-sm font-semibold">{rule.name}</span>
                <Badge color="blue">{rule.trigger_type === 'any' ? 'catch-all' : rule.trigger_type}</Badge>
                <Badge color={rule.response_type === 'llm' ? 'red' : 'blue'}>
                  {rule.response_type === 'llm' ? '♥ LLM' : rule.response_type}
                </Badge>
                {rule.platform_filter && rule.platform_filter !== 'any' && (
                  <Badge color="green">{rule.platform_filter === 'signal' ? '📞 Signal' : '💬 WhatsApp'}</Badge>
                )}
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {(() => {
                  const sf = rule.sender_filter;
                  if (!sf || sf === 'all') return '👥 Everyone';
                  const c = contacts.find(x => x.sender === sf);
                  if (c) return `${c.platform === 'whatsapp' ? '💬' : '📞'} ${c.sender_name || c.sender}`;
                  return `👤 ${sf}`;
                })()}
                {rule.trigger_value ? ` · "${rule.trigger_value}"` : ' · any message'}
                {rule.schedule_start ? ` · ${rule.schedule_start}–${rule.schedule_end}` : ''}
                {rule.cooldown_minutes > 0 ? ` · ${rule.cooldown_minutes}m cooldown` : ''}
              </p>
            </div>

            {/* actions */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {[
                { title: rule.active ? 'Pause' : 'Activate', icon: rule.active ? '⏸' : '▶', action: () => toggleActive(rule) },
                { title: 'Duplicate', icon: '⎘', action: () => duplicateRule(rule) },
                { title: 'Edit', icon: '✏', action: () => { setEditRule(rule); setShowModal(true); } },
                { title: 'Delete', icon: '✕', action: () => deleteRule(rule.id), danger: true },
              ].map(({ title, icon, action, danger }) => (
                <button key={title} title={title} onClick={action}
                  className="w-7 h-7 rounded-xl flex items-center justify-center text-xs transition-all"
                  style={{ color: danger ? 'rgba(232,54,93,0.5)' : 'rgba(255,255,255,0.3)' }}
                  onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(232,54,93,0.12)' : 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <RuleModal rule={editRule} onSave={saveRule} onClose={() => { setShowModal(false); setEditRule(null); }} />
      )}
    </div>
  );
}

function Badge({ children, color }) {
  const styles = color === 'red'
    ? { background: 'rgba(232,54,93,0.12)', color: '#E8365D', border: '1px solid rgba(232,54,93,0.25)' }
    : color === 'green'
    ? { background: 'rgba(37,211,102,0.1)', color: '#25D366', border: '1px solid rgba(37,211,102,0.25)' }
    : { background: 'rgba(61,114,232,0.12)', color: '#3D72E8', border: '1px solid rgba(61,114,232,0.25)' };
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={styles}>{children}</span>
  );
}
