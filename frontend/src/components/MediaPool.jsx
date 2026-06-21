// StuntCock — Media Pool editor for a rule
// Lets admins curate which GIFs and memes the rule will occasionally attach.
import { useState, useEffect, useRef } from 'react';
import { API } from '../lib/utils.js';

const inp = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10, color: 'white', padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%',
};

// ── Frequency slider ──────────────────────────────────────────────────────────
export function MediaFrequencyControls({ form, set }) {
  const enabled = form.media_pool_enabled === 'true'
    || (form.media_pool_enabled === '' && false); // '' = inherit global

  const freq = form.media_pool_frequency !== ''
    ? parseFloat(form.media_pool_frequency)
    : 0.3;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Attach media alongside replies</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['', 'Global default'], ['false', 'Off'], ['true', 'On']].map(([val, label]) => (
            <button key={val} type="button"
              onClick={() => set('media_pool_enabled', val)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: 'none',
                cursor: 'pointer',
                background: form.media_pool_enabled === val ? '#3D72E8' : 'rgba(255,255,255,0.08)',
                color: form.media_pool_enabled === val ? '#fff' : 'rgba(255,255,255,0.5)',
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      {form.media_pool_enabled === 'true' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', width: 80 }}>Frequency</span>
            <input type="range" min="0" max="1" step="0.05"
              value={freq}
              onChange={e => set('media_pool_frequency', e.target.value)}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', width: 36, textAlign: 'right' }}>
              {Math.round(freq * 100)}%
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {[['any', '🎲 Any'], ['gif', '🎞 GIF only'], ['meme', '🎭 Meme only']].map(([val, label]) => (
              <button key={val} type="button"
                onClick={() => set('media_pool_type', val)}
                style={{
                  flex: 1, fontSize: 11, fontWeight: 700, padding: '6px 8px', borderRadius: 8,
                  border: 'none', cursor: 'pointer',
                  background: (form.media_pool_type || 'any') === val ? 'rgba(114,9,183,0.4)' : 'rgba(255,255,255,0.06)',
                  color: (form.media_pool_type || 'any') === val ? '#fff' : 'rgba(255,255,255,0.5)',
                  outline: (form.media_pool_type || 'any') === val ? '1px solid rgba(114,9,183,0.7)' : 'none',
                }}
              >{label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── GIF search + pool ─────────────────────────────────────────────────────────
function GifPoolTab({ ruleId }) {
  const [savedGifs, setSavedGifs] = useState([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!ruleId) return;
    fetch(`${API}/api/gifs?rule_id=${ruleId}`).then(r => r.json()).then(setSavedGifs).catch(() => {});
  }, [ruleId]);

  function handleQueryChange(val) {
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (!val.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(() => doSearch(val), 500);
  }

  async function doSearch(q) {
    setSearching(true); setSearchError(null);
    try {
      const res = await fetch(`${API}/api/gifs/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 12 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSearchResults(data);
    } catch (e) { setSearchError(e.message); }
    finally { setSearching(false); }
  }

  async function addGif(gif) {
    if (!ruleId) return;
    const already = savedGifs.find(g => g.gif_id === gif.gif_id);
    if (already) return;
    const res = await fetch(`${API}/api/gifs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...gif, rule_id: ruleId, source: 'giphy' }),
    });
    const saved = await res.json();
    setSavedGifs(p => [saved, ...p]);
  }

  async function removeGif(id) {
    await fetch(`${API}/api/gifs/${id}`, { method: 'DELETE' });
    setSavedGifs(p => p.filter(g => g.id !== id));
  }

  const alreadySaved = new Set(savedGifs.map(g => g.gif_id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input value={query} onChange={e => handleQueryChange(e.target.value)}
        placeholder="Search Giphy… (e.g. 'excited', 'love', 'reaction')"
        style={inp}
        onFocus={e => e.target.style.borderColor = 'rgba(61,114,232,0.6)'}
        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
      />

      {searchError && <div style={{ color: '#f72585', fontSize: 12 }}>Giphy error: {searchError}</div>}
      {searching && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Searching…</div>}

      {searchResults.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase' }}>
            Results — click to add to pool
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {searchResults.map(g => {
              const saved = alreadySaved.has(g.gif_id);
              return (
                <div key={g.gif_id}
                  onClick={() => !saved && addGif(g)}
                  style={{
                    position: 'relative', borderRadius: 8, overflow: 'hidden',
                    cursor: saved ? 'default' : 'pointer',
                    border: saved ? '2px solid #3D72E8' : '1px solid rgba(255,255,255,0.08)',
                    opacity: saved ? 0.6 : 1,
                  }}
                >
                  <img src={g.preview_url || g.gif_url} alt={g.title}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  {saved && (
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', background: 'rgba(61,114,232,0.3)', fontSize: 20,
                    }}>✓</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {savedGifs.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase' }}>
            Pool ({savedGifs.length} GIF{savedGifs.length !== 1 ? 's' : ''})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {savedGifs.map(g => (
              <div key={g.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                <img src={g.preview_url || g.gif_url} alt=""
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                <button onClick={() => removeGif(g.id)}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(247,37,133,0.85)', border: 'none', color: '#fff',
                    width: 18, height: 18, borderRadius: '50%', fontSize: 11, cursor: 'pointer',
                    fontWeight: 700, lineHeight: '18px',
                  }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!ruleId && (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', padding: 16 }}>
          Save the rule first to manage its GIF pool.
        </div>
      )}
    </div>
  );
}

// ── Meme pool tab ─────────────────────────────────────────────────────────────
function MemePoolTab({ ruleId, personaId }) {
  const [allMemes, setAllMemes] = useState([]);
  const [poolIds, setPoolIds] = useState(new Set());

  useEffect(() => {
    fetch(`${API}/api/memes`).then(r => r.json()).then(setAllMemes).catch(() => {});
  }, []);

  useEffect(() => {
    if (!ruleId) return;
    fetch(`${API}/api/rules/${ruleId}/meme-pool`).then(r => r.json())
      .then(pool => setPoolIds(new Set(pool.map(m => m.id))))
      .catch(() => {});
  }, [ruleId]);

  async function toggle(memeId) {
    if (!ruleId) return;
    if (poolIds.has(memeId)) {
      await fetch(`${API}/api/rules/${ruleId}/meme-pool/${memeId}`, { method: 'DELETE' });
      setPoolIds(p => { const s = new Set(p); s.delete(memeId); return s; });
    } else {
      await fetch(`${API}/api/rules/${ruleId}/meme-pool`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meme_id: memeId }),
      });
      setPoolIds(p => new Set([...p, memeId]));
    }
  }

  // Prioritise persona-matched memes, then others
  const sorted = [...allMemes].sort((a, b) => {
    const aMatch = personaId && a.persona_id === personaId ? -1 : 0;
    const bMatch = personaId && b.persona_id === personaId ? -1 : 0;
    return aMatch - bMatch;
  });

  if (!allMemes.length) return (
    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', padding: 24 }}>
      No memes generated yet. Create some in Meme Tools first.
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>
        Click to add/remove from this rule's pool · {poolIds.size} selected
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
        {sorted.map(m => {
          const inPool = poolIds.has(m.id);
          return (
            <div key={m.id}
              onClick={() => toggle(m.id)}
              style={{
                position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: ruleId ? 'pointer' : 'default',
                border: inPool ? '2px solid #7209b7' : '1px solid rgba(255,255,255,0.08)',
                opacity: ruleId ? 1 : 0.5,
              }}
            >
              <img src={`${API}/api/memes/image/${m.id}`} alt={m.caption}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                onError={e => { e.target.style.display = 'none'; }}
              />
              <div style={{ padding: '5px 7px', fontSize: 10, color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.7)', lineHeight: 1.3 }}>
                {m.caption}
              </div>
              {inPool && (
                <div style={{
                  position: 'absolute', top: 4, right: 4, background: '#7209b7',
                  width: 18, height: 18, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700,
                }}>✓</div>
              )}
              {personaId && m.persona_id === personaId && (
                <div style={{
                  position: 'absolute', top: 4, left: 4, background: 'rgba(61,114,232,0.85)',
                  fontSize: 9, color: '#fff', padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                }}>matched</div>
              )}
            </div>
          );
        })}
      </div>
      {!ruleId && (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
          Save the rule first to manage its meme pool.
        </div>
      )}
    </div>
  );
}

// ── Main MediaPool component ──────────────────────────────────────────────────
export default function MediaPool({ ruleId, personaId, form, set }) {
  const [tab, setTab] = useState('gif');

  const tabStyle = (active) => ({
    padding: '6px 14px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
    borderRadius: '8px 8px 0 0', background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.35)',
    borderBottom: active ? '2px solid #3D72E8' : '2px solid transparent',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <MediaFrequencyControls form={form} set={set} />

      {form.media_pool_enabled === 'true' && (
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 2, padding: '8px 8px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <button type="button" style={tabStyle(tab === 'gif')}  onClick={() => setTab('gif')}>🎞 GIFs</button>
            <button type="button" style={tabStyle(tab === 'meme')} onClick={() => setTab('meme')}>🎭 Memes</button>
          </div>
          <div style={{ padding: 12 }}>
            {tab === 'gif'  && <GifPoolTab  ruleId={ruleId} />}
            {tab === 'meme' && <MemePoolTab ruleId={ruleId} personaId={personaId} />}
          </div>
        </div>
      )}
    </div>
  );
}
