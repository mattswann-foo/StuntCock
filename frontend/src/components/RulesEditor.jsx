// StuntCock — Rules CRUD editor with drag-to-reorder
import React, { useEffect, useState, useRef } from 'react';
import { API } from '../lib/utils.js';

const EMPTY_RULE = {
  name: '', active: true, trigger_type: 'contains', trigger_value: '',
  sender_filter: 'all', response_type: 'static', response_text: '',
  schedule_start: '', schedule_end: '', schedule_days: '', cooldown_minutes: 0,
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
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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

          <Input label="Sender filter" value={form.sender_filter} onChange={e => set('sender_filter', e.target.value)}
            placeholder="all  |  +15550001234  |  group:ID  |  unknown" />

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
  const [editRule, setEditRule] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const dragIdx = useRef(null);

  const load = () => fetch(`${API}/api/rules`).then(r => r.json()).then(setRules).catch(() => {});
  useEffect(() => { load(); }, []);

  const saveRule = async (form) => {
    if (form.id) {
      await fetch(`${API}/api/rules/${form.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    } else {
      await fetch(`${API}/api/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    }
    load();
  };

  const deleteRule = async (id) => {
    if (!confirm('Delete this rule?')) return;
    await fetch(`${API}/api/rules/${id}`, { method: 'DELETE' });
    load();
  };

  const toggleActive = async (rule) => {
    await fetch(`${API}/api/rules/${rule.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rule, active: !rule.active }) });
    load();
  };

  const duplicateRule = async (rule) => {
    const { id, created_at, updated_at, ...rest } = rule;
    await fetch(`${API}/api/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rest, name: rest.name + ' (copy)' }) });
    load();
  };

  const handleDrop = async (toIdx) => {
    if (dragIdx.current === null || dragIdx.current === toIdx) return;
    const reordered = [...rules];
    const [moved] = reordered.splice(dragIdx.current, 1);
    reordered.splice(toIdx, 0, moved);
    setRules(reordered);
    dragIdx.current = null;
    await fetch(`${API}/api/rules/reorder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: reordered.map(r => r.id) }) });
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
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {rule.trigger_value ? `"${rule.trigger_value}"` : 'matches any'}
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
    : { background: 'rgba(61,114,232,0.12)', color: '#3D72E8', border: '1px solid rgba(61,114,232,0.25)' };
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={styles}>{children}</span>
  );
}
