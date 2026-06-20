import { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:3001';

function MemeToolsGate({ children, credits, onUpgrade }) {
  // In production this would check a subscription flag.
  // For now all users have access; the credit gate is the limit.
  return children;
}

function CreditBadge({ credits }) {
  if (!credits) return null;
  const resetDate = credits.reset_at ? new Date(credits.reset_at).toLocaleDateString() : '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        background: credits.credits > 0 ? 'rgba(114,9,183,0.2)' : 'rgba(247,37,133,0.15)',
        border: `1px solid ${credits.credits > 0 ? '#7209b7' : '#f72585'}`,
        color: credits.credits > 0 ? '#c77dff' : '#f72585',
        borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700,
      }}>
        {credits.credits} generation credit{credits.credits !== 1 ? 's' : ''} remaining
      </span>
      {resetDate && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>resets {resetDate}</span>}
    </div>
  );
}

function PersonaPicker({ personas, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {personas.map(p => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          style={{
            background: value === p.id ? '#7209b7' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${value === p.id ? '#7209b7' : 'rgba(255,255,255,0.1)'}`,
            color: value === p.id ? '#fff' : 'rgba(255,255,255,0.6)',
            borderRadius: 20, padding: '6px 14px', cursor: 'pointer',
            fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
          }}
        >
          {p.emoji} {p.name}
        </button>
      ))}
    </div>
  );
}

function CaptionEditor({ captions, onChange, loading }) {
  if (loading) return (
    <div style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.4)' }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>✨</div>
      Generating captions…
    </div>
  );
  if (!captions.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {captions.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', width: 20, textAlign: 'right', fontSize: 12 }}>{i + 1}</span>
          <input
            value={c}
            onChange={e => {
              const next = [...captions];
              next[i] = e.target.value;
              onChange(next);
            }}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, color: '#e0e0e0', padding: '8px 12px', fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
      ))}
    </div>
  );
}

function MemeGrid({ memes, onDelete, onToggleGlobal, baseUrl, selectable, selected, onSelect }) {
  if (!memes.length) return (
    <div style={{ textAlign: 'center', padding: 48, color: 'rgba(255,255,255,0.3)' }}>
      No memes yet. Generate your first set above.
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
      {memes.map(m => (
        <div
          key={m.id}
          onClick={() => onSelect && onSelect(m.id)}
          style={{
            position: 'relative', borderRadius: 10, overflow: 'hidden',
            border: selected?.includes(m.id) ? '2px solid #7209b7' : '1px solid rgba(255,255,255,0.08)',
            cursor: selectable ? 'pointer' : 'default',
            background: '#111',
          }}
        >
          <img
            src={`${baseUrl}/api/memes/image/${m.id}`}
            alt={m.caption}
            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <div style={{
            padding: '8px 10px', fontSize: 11, color: 'rgba(255,255,255,0.7)',
            background: 'rgba(0,0,0,0.7)', lineHeight: 1.3,
          }}>
            {m.caption}
          </div>
          {m.persona_name && (
            <div style={{
              position: 'absolute', top: 6, left: 6,
              background: 'rgba(114,9,183,0.85)', color: '#fff',
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            }}>
              {m.persona_emoji} {m.persona_name}
            </div>
          )}
          {onToggleGlobal && (
            <button
              title={m.is_global ? 'Remove from global pool' : 'Add to global pool'}
              onClick={e => { e.stopPropagation(); onToggleGlobal(m.id, !m.is_global); }}
              style={{
                position: 'absolute', bottom: 32, right: 6,
                background: m.is_global ? 'rgba(61,114,232,0.9)' : 'rgba(255,255,255,0.15)',
                border: 'none', color: '#fff', borderRadius: 4, padding: '2px 6px',
                cursor: 'pointer', fontSize: 10, fontWeight: 700,
              }}
            >{m.is_global ? '🌐 Global' : '+ Global'}</button>
          )}
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(m.id); }}
              style={{
                position: 'absolute', top: 6, right: 6, background: 'rgba(247,37,133,0.85)',
                border: 'none', color: '#fff', width: 22, height: 22, borderRadius: '50%',
                cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: '22px',
              }}
            >×</button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function MemeTools() {
  const [personas, setPersonas] = useState([]);
  const [memes, setMemes] = useState([]);
  const [credits, setCredits] = useState(null);
  const [step, setStep] = useState('library'); // library | wizard-photo | wizard-captions | wizard-generating | wizard-review

  // Wizard state
  const [photo, setPhoto] = useState(null); // { file, previewUrl }
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [captions, setCaptions] = useState([]);
  const [captionsLoading, setCaptionsLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [newMemes, setNewMemes] = useState([]);
  const [error, setError] = useState(null);

  const fileInputRef = useRef();

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/personas`).then(r => r.json()),
      fetch(`${API}/api/memes`).then(r => r.json()),
      fetch(`${API}/api/memes/credits`).then(r => r.json()),
    ]).then(([p, m, c]) => {
      setPersonas(p);
      setMemes(m);
      setCredits(c);
    }).catch(console.error);
  }, []);

  async function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setPhoto({ file, previewUrl });
    setStep('wizard-captions');
    setError(null);

    if (selectedPersona) {
      setCaptionsLoading(true);
      try {
        const res = await fetch(`${API}/api/memes/captions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona_id: selectedPersona }),
        });
        const data = await res.json();
        setCaptions(data.captions || []);
      } catch (e) {
        setError('Caption generation failed: ' + e.message);
      } finally {
        setCaptionsLoading(false);
      }
    }
  }

  async function handleGenerate() {
    if (!photo || !selectedPersona || !captions.length) return;
    setStep('wizard-generating');
    setGenerating(true);
    setError(null);

    const formData = new FormData();
    formData.append('photo', photo.file);
    formData.append('persona_id', String(selectedPersona));
    formData.append('captions', JSON.stringify(captions));

    // Fake progress while generation runs (~45s)
    let prog = 0;
    const timer = setInterval(() => {
      prog = Math.min(prog + 2, 90);
      setGenerationProgress(prog);
    }, 900);

    try {
      const res = await fetch(`${API}/api/memes/generate`, { method: 'POST', body: formData });
      const data = await res.json();
      clearInterval(timer);
      setGenerationProgress(100);
      if (!res.ok) throw new Error(data.error);
      setNewMemes(data.memes || []);
      setCredits(data.credits);
      setMemes(prev => [...(data.memes || []), ...prev]);
      setTimeout(() => setStep('wizard-review'), 500);
    } catch (e) {
      clearInterval(timer);
      setError(e.message);
      setStep('wizard-captions');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id) {
    await fetch(`${API}/api/memes/${id}`, { method: 'DELETE' });
    setMemes(prev => prev.filter(m => m.id !== id));
    setNewMemes(prev => prev.filter(m => m.id !== id));
  }

  async function handleToggleGlobal(id, isGlobal) {
    await fetch(`${API}/api/memes/${id}/global`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_global: isGlobal }),
    });
    const update = m => m.id === id ? { ...m, is_global: isGlobal ? 1 : 0 } : m;
    setMemes(prev => prev.map(update));
    setNewMemes(prev => prev.map(update));
  }

  function startWizard() {
    setPhoto(null); setCaptions([]); setNewMemes([]); setError(null);
    setStep('wizard-photo');
  }

  function finishWizard() {
    setStep('library');
    setPhoto(null); setCaptions([]); setNewMemes([]);
  }

  // ── Styles ──
  const card = {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: 24,
  };
  const btn = (color = '#7209b7') => ({
    background: color, border: 'none', color: '#fff',
    padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
    fontWeight: 700, fontSize: 14, transition: 'opacity 0.15s',
  });
  const label = { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10, display: 'block' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🎭 Meme Tools</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', margin: '4px 0 0', fontSize: 13 }}>
            Generate 10 persona-styled memes from your photo and use them as auto-replies.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CreditBadge credits={credits} />
          {step === 'library' && (
            <button onClick={startWizard} style={btn()}>+ Generate Memes</button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(247,37,133,0.1)', border: '1px solid #f72585', borderRadius: 10, padding: '12px 16px', color: '#f72585', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Library ── */}
      {step === 'library' && (
        <div style={card}>
          <MemeGrid memes={memes} onDelete={handleDelete} onToggleGlobal={handleToggleGlobal} baseUrl={API} />
        </div>
      )}

      {/* ── Wizard: photo ── */}
      {step === 'wizard-photo' && (
        <div style={card}>
          <span style={label}>Step 1 — Choose your persona</span>
          <PersonaPicker personas={personas} value={selectedPersona} onChange={setSelectedPersona} />

          <div style={{ marginTop: 24 }}>
            <span style={label}>Step 2 — Upload your photo</span>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed rgba(114,9,183,0.4)', borderRadius: 12,
                padding: 48, textAlign: 'center', cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)', transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#7209b7'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(114,9,183,0.4)'}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
              <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>Click to upload</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>JPEG, PNG or WEBP · Max 10 MB · Must contain a face</div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoSelect} />
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button onClick={() => setStep('library')} style={{ ...btn('rgba(255,255,255,0.08)'), color: 'rgba(255,255,255,0.6)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Wizard: captions ── */}
      {step === 'wizard-captions' && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
            {photo && (
              <img src={photo.previewUrl} alt="Your photo" style={{ width: 100, height: 100, borderRadius: 10, objectFit: 'cover', border: '2px solid #7209b7' }} />
            )}
            <div style={{ flex: 1 }}>
              <span style={label}>Your photo + persona</span>
              <PersonaPicker personas={personas} value={selectedPersona} onChange={async (id) => {
                setSelectedPersona(id);
                setCaptionsLoading(true);
                try {
                  const res = await fetch(`${API}/api/memes/captions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ persona_id: id }),
                  });
                  const data = await res.json();
                  setCaptions(data.captions || []);
                } catch (e) { setError(e.message); }
                finally { setCaptionsLoading(false); }
              }} />
            </div>
          </div>

          <span style={label}>Step 3 — Review & edit captions (click any to edit)</span>
          <CaptionEditor captions={captions} onChange={setCaptions} loading={captionsLoading} />

          <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={handleGenerate}
              disabled={!captions.length || !selectedPersona || !credits?.credits}
              style={{ ...btn(), opacity: (!captions.length || !selectedPersona || !credits?.credits) ? 0.4 : 1 }}
            >
              {credits?.credits ? `Generate 10 Memes (1 credit)` : 'No credits remaining'}
            </button>
            <button onClick={() => setStep('wizard-photo')} style={{ ...btn('rgba(255,255,255,0.08)'), color: 'rgba(255,255,255,0.6)' }}>← Back</button>
          </div>
        </div>
      )}

      {/* ── Wizard: generating ── */}
      {step === 'wizard-generating' && (
        <div style={{ ...card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🎨</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Generating your memes…</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 28 }}>
            Compositing your face with {captions.length} captions. Usually takes 30–60 seconds.
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 8, overflow: 'hidden', maxWidth: 400, margin: '0 auto' }}>
            <div style={{ background: '#7209b7', height: '100%', width: `${generationProgress}%`, transition: 'width 0.8s ease', borderRadius: 99 }} />
          </div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 10 }}>{generationProgress}%</div>
        </div>
      )}

      {/* ── Wizard: review ── */}
      {step === 'wizard-review' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>🎉 {newMemes.length} memes generated</span>
            <button onClick={finishWizard} style={btn('#3a86ff')}>Save to Library →</button>
          </div>
          <MemeGrid memes={newMemes} onDelete={handleDelete} baseUrl={API} />
        </div>
      )}
    </div>
  );
}
