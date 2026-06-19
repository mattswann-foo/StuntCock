// StuntCock — Persona Marketplace (full taxonomy)
import React, { useEffect, useRef, useState } from 'react';
import { API } from '../lib/utils.js';

// ── Toast helper ─────────────────────────────────────────────────────────────
function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold text-white shadow-xl"
      style={{ background: 'linear-gradient(135deg,#3D72E8,#2855C0)', border: '1px solid rgba(61,114,232,0.4)', backdropFilter: 'blur(12px)' }}>
      {message}
    </div>
  );
}

// ── Persona detail modal (long-press / More) ──────────────────────────────────
function PersonaDetail({ persona, onClose, onSelect, isSelected }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" onClick={onClose}
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <div className="max-w-sm w-full rounded-3xl p-6 relative" onClick={e => e.stopPropagation()}
        style={{ background: 'rgba(15,22,60,0.97)', border: '1px solid rgba(61,114,232,0.3)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/80 text-xl">✕</button>
        <div className="text-5xl mb-3">{persona.emoji}</div>
        <h2 className="text-white font-bold text-xl mb-1">{persona.name}</h2>
        <p className="text-sm mb-3 font-medium" style={{ color: '#3D72E8' }}>{persona.tagline || persona.description}</p>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {persona.full_description || persona.description}
        </p>
        {persona.group_label && (
          <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {persona.group_emoji} {persona.group_label}
          </p>
        )}
        <button onClick={() => { onSelect(persona); onClose(); }}
          className="w-full py-3 rounded-2xl text-sm font-bold transition-all"
          style={isSelected
            ? { background: 'rgba(61,114,232,0.15)', border: '1px solid rgba(61,114,232,0.4)', color: '#3D72E8' }
            : { background: 'linear-gradient(135deg,#3D72E8,#2855C0)', color: 'white' }}>
          {isSelected ? '✓ Selected' : 'Select Persona'}
        </button>
      </div>
    </div>
  );
}

// ── Create / Edit custom persona modal ───────────────────────────────────────
export function PersonaModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ name: '', emoji: '🤖', description: '', system_prompt: '', ...initial });
  const [generating, setGenerating] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleGenerate() {
    if (!form.name) return;
    setGenerating(true);
    try {
      const r = await fetch(`${API}/api/personas/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description }),
      });
      const d = await r.json();
      if (d.system_prompt) set('system_prompt', d.system_prompt);
      if (d.emoji && !form.emoji) set('emoji', d.emoji);
    } catch (_) {}
    setGenerating(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="max-w-lg w-full rounded-3xl p-6" style={{ background: 'rgba(15,22,60,0.97)', border: '1px solid rgba(61,114,232,0.3)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">{initial?.id ? 'Edit Persona' : 'New Persona'}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80">✕</button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={form.emoji} onChange={e => set('emoji', e.target.value)}
              className="w-14 text-center rounded-xl px-2 py-2 text-xl"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Persona name"
              className="flex-1 rounded-xl px-3 py-2 text-sm"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          </div>
          <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Short description"
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          <div className="relative">
            <textarea value={form.system_prompt} onChange={e => set('system_prompt', e.target.value)}
              placeholder="System prompt — how should this persona respond?" rows={5}
              className="w-full rounded-xl px-3 py-2 text-sm resize-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            <button onClick={handleGenerate} disabled={generating || !form.name}
              className="absolute bottom-2 right-2 px-3 py-1 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
              style={{ background: 'rgba(61,114,232,0.2)', border: '1px solid rgba(61,114,232,0.4)', color: '#3D72E8' }}>
              {generating ? 'Generating…' : '✨ AI Generate'}
            </button>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
              Cancel
            </button>
            <button onClick={() => onSave(form)} disabled={!form.name || !form.system_prompt}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#3D72E8,#2855C0)', color: 'white' }}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Persona Card ──────────────────────────────────────────────────────────────
function PersonaCard({ persona, isSelected, onClick, onLongPress }) {
  const pressTimer = useRef(null);

  function handleMouseDown() { pressTimer.current = setTimeout(() => onLongPress(persona), 500); }
  function handleMouseUp() { clearTimeout(pressTimer.current); }

  return (
    <button
      onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
      onTouchStart={handleMouseDown} onTouchEnd={handleMouseUp}
      onClick={() => onClick(persona)}
      className="flex flex-col items-start p-3.5 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-[0.98] w-full"
      style={{
        background: isSelected ? 'rgba(61,114,232,0.15)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isSelected ? 'rgba(61,114,232,0.5)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: isSelected ? '0 0 12px rgba(61,114,232,0.2)' : 'none',
      }}>
      <div className="flex items-start justify-between w-full mb-1.5">
        <span className="text-2xl leading-none">{persona.emoji}</span>
        {isSelected && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(61,114,232,0.3)', color: '#3D72E8' }}>✓</span>
        )}
      </div>
      <span className="text-sm font-bold text-white leading-tight mb-0.5">{persona.name}</span>
      <span className="text-xs leading-tight line-clamp-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
        {persona.tagline || persona.description}
      </span>
    </button>
  );
}

// ── Main Personas page ────────────────────────────────────────────────────────
export default function Personas() {
  const [personas, setPersonas] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [detail, setDetail] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [showAll, setShowAll] = useState({});

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/personas`).then(r => r.json()),
      fetch(`${API}/api/personas/groups`).then(r => r.json()),
    ]).then(([p, g]) => {
      setPersonas(p);
      setGroups(g);
    }).catch(() => {});
  }, []);

  const q = search.toLowerCase();
  const filtered = personas.filter(p => {
    if (activeGroup !== 'all' && activeGroup !== 'custom' && p.group_id !== activeGroup) return false;
    if (activeGroup === 'custom' && p.is_builtin) return false;
    if (q) return (p.name + ' ' + (p.tagline || '') + ' ' + (p.full_description || '') + ' ' + p.description).toLowerCase().includes(q);
    return true;
  });

  const builtinByGroup = {};
  const customPersonas = [];
  filtered.forEach(p => {
    if (!p.is_builtin) { customPersonas.push(p); return; }
    const gid = p.group_id || 'other';
    if (!builtinByGroup[gid]) builtinByGroup[gid] = [];
    builtinByGroup[gid].push(p);
  });

  function handleSelect(persona) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(persona.id)) { n.delete(persona.id); return n; }
      if (n.size >= 3) { setToast('Max 3 active personas. Deselect one first.'); return prev; }
      n.add(persona.id);
      setToast(`${persona.name} activated. ${persona.tagline || persona.description}`);
      return n;
    });
  }

  async function savePersona(form) {
    const method = form.id ? 'PUT' : 'POST';
    const url = form.id ? `${API}/api/personas/${form.id}` : `${API}/api/personas`;
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const fresh = await fetch(`${API}/api/personas`).then(r => r.json());
    setPersonas(fresh);
    setEditModal(null);
    setToast(form.id ? `${form.name} updated.` : `${form.name} created.`);
  }

  async function deletePersona(p) {
    if (!confirm(`Delete "${p.name}"?`)) return;
    await fetch(`${API}/api/personas/${p.id}`, { method: 'DELETE' });
    setPersonas(prev => prev.filter(x => x.id !== p.id));
    setSelected(prev => { const n = new Set(prev); n.delete(p.id); return n; });
  }

  const PREVIEW_COUNT = 4;
  const groupOrder = groups.map(g => g.id);

  function renderGroup(gid, groupPersonas) {
    const group = groups.find(g => g.id === gid);
    if (!groupPersonas?.length) return null;
    const isExpanded = showAll[gid] || !!q;
    const visible = isExpanded ? groupPersonas : groupPersonas.slice(0, PREVIEW_COUNT);

    return (
      <div key={gid} className="mb-8">
        {group && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-lg">{group.emoji}</span>
              <h3 className="text-white font-bold text-sm">{group.label}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full ml-auto"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
                {groupPersonas.length}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{group.tagline}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {visible.map(p => (
            <PersonaCard key={p.id} persona={p} isSelected={selected.has(p.id)}
              onClick={handleSelect} onLongPress={setDetail} />
          ))}
        </div>
        {!q && groupPersonas.length > PREVIEW_COUNT && (
          <button onClick={() => setShowAll(s => ({ ...s, [gid]: !s[gid] }))}
            className="mt-2 text-xs font-semibold w-full py-2 rounded-xl transition-all"
            style={{ color: '#3D72E8', background: 'rgba(61,114,232,0.06)', border: '1px solid rgba(61,114,232,0.15)' }}>
            {isExpanded ? '↑ Show less' : `↓ Show all ${groupPersonas.length}`}
          </button>
        )}
      </div>
    );
  }

  // Count selected per group for pill badges
  function selCountForGroup(gid) {
    if (gid === 'all') return selected.size;
    if (gid === 'custom') return [...selected].filter(id => personas.find(p => p.id === id && !p.is_builtin)).length;
    return [...selected].filter(id => personas.find(p => p.id === id && p.group_id === gid)).length;
  }

  const pills = [{ id: 'all', label: 'All', emoji: '✨' }, ...groups, { id: 'custom', label: 'My Personas', emoji: '🛠️' }];

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">

      {/* Search */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search 52 personas…"
          className="w-full rounded-2xl pl-9 pr-4 py-2.5 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
      </div>

      {/* Group pills */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-5" style={{ scrollbarWidth: 'none' }}>
        {pills.map(g => {
          const sel = selCountForGroup(g.id);
          return (
            <button key={g.id} onClick={() => setActiveGroup(g.id)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap"
              style={activeGroup === g.id
                ? { background: 'linear-gradient(135deg,rgba(61,114,232,0.35),rgba(61,114,232,0.2))', border: '1px solid rgba(61,114,232,0.5)', color: 'white' }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
              <span>{g.emoji}</span>
              <span>{g.label}</span>
              {sel > 0 && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(61,114,232,0.4)', color: '#7EA8FF' }}>{sel}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active selection summary */}
      {selected.size > 0 && (
        <div className="mb-5 px-4 py-3 rounded-2xl flex items-center gap-3 flex-wrap"
          style={{ background: 'rgba(61,114,232,0.08)', border: '1px solid rgba(61,114,232,0.2)' }}>
          <span className="text-sm font-semibold text-white">{selected.size}/3 active</span>
          {[...selected].map(id => {
            const p = personas.find(x => x.id === id);
            return p ? (
              <span key={id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                style={{ background: 'rgba(61,114,232,0.2)', color: '#7EA8FF' }}>
                {p.emoji} {p.name}
                <button onClick={() => setSelected(prev => { const n = new Set(prev); n.delete(id); return n; })}
                  className="opacity-60 hover:opacity-100 ml-0.5">✕</button>
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* Persona grid */}
      {q ? (
        // Search: flat grid across all
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {filtered.map(p => (
            <PersonaCard key={p.id} persona={p} isSelected={selected.has(p.id)}
              onClick={handleSelect} onLongPress={setDetail} />
          ))}
        </div>
      ) : (
        <>
          {groupOrder.map(gid => renderGroup(gid, builtinByGroup[gid]))}
        </>
      )}

      {/* Custom personas section */}
      {(activeGroup === 'all' || activeGroup === 'custom') && !q && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-white font-bold text-sm">🛠️ My Personas</h3>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Your custom-built personas</p>
            </div>
            <button onClick={() => setEditModal({})}
              className="px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(61,114,232,0.15)', border: '1px solid rgba(61,114,232,0.3)', color: '#3D72E8' }}>
              + New
            </button>
          </div>
          {customPersonas.length === 0 ? (
            <button onClick={() => setEditModal({})}
              className="w-full py-8 rounded-2xl flex flex-col items-center gap-2 hover:bg-white/5 transition-all"
              style={{ border: '2px dashed rgba(255,255,255,0.1)' }}>
              <span className="text-2xl">🧬</span>
              <span className="text-sm font-semibold text-white/40">Create your first custom persona</span>
              <span className="text-xs text-white/25">Craft a voice that's uniquely yours</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {customPersonas.map(p => (
                <div key={p.id} className="relative group">
                  <PersonaCard persona={p} isSelected={selected.has(p.id)}
                    onClick={handleSelect} onLongPress={setDetail} />
                  <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                    <button onClick={e => { e.stopPropagation(); setEditModal(p); }}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                      style={{ background: 'rgba(61,114,232,0.3)', color: '#3D72E8' }}>✏️</button>
                    <button onClick={e => { e.stopPropagation(); deletePersona(p); }}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                      style={{ background: 'rgba(232,54,93,0.3)', color: '#E8365D' }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail overlay */}
      {detail && (
        <PersonaDetail persona={detail} onClose={() => setDetail(null)}
          isSelected={selected.has(detail.id)}
          onSelect={p => { handleSelect(p); setDetail(null); }} />
      )}

      {/* Create / Edit modal */}
      {editModal !== null && (
        <PersonaModal initial={editModal} onSave={savePersona} onClose={() => setEditModal(null)} />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
