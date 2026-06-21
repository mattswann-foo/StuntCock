import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, FlatList,
  TextInput, Alert, ActivityIndicator, StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../api';

const PURPLE = '#7209b7';
const DARK = '#0B1535';
const CARD = 'rgba(255,255,255,0.05)';
const BORDER = 'rgba(255,255,255,0.1)';

export default function MemeToolsScreen() {
  const [tab, setTab] = useState('library'); // library | wizard
  const [step, setStep] = useState('photo'); // photo | captions | generating | review
  const [personas, setPersonas] = useState([]);
  const [memes, setMemes] = useState([]);
  const [credits, setCredits] = useState(null);
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [photo, setPhoto] = useState(null); // { uri }
  const [captions, setCaptions] = useState([]);
  const [captionsLoading, setCaptionsLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newMemes, setNewMemes] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.getPersonas(),
      api.getMemes(),
      api.getMemeCredits(),
    ]).then(([p, m, c]) => {
      setPersonas(p);
      setMemes(m);
      setCredits(c);
    }).catch(console.error);
  }, []);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Enable photo library access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!result.canceled) {
      setPhoto({ uri: result.assets[0].uri });
      setStep('captions');
      if (selectedPersona) fetchCaptions(selectedPersona);
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Enable camera access in Settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!result.canceled) {
      setPhoto({ uri: result.assets[0].uri });
      setStep('captions');
      if (selectedPersona) fetchCaptions(selectedPersona);
    }
  }

  async function fetchCaptions(personaId) {
    setCaptionsLoading(true);
    try {
      const data = await api.previewCaptions(personaId);
      setCaptions(data.captions || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setCaptionsLoading(false);
    }
  }

  async function generate() {
    if (!photo || !selectedPersona || !captions.length) return;
    setStep('generating');
    setGenerating(true);
    setError(null);
    try {
      const data = await api.generateMemes(photo.uri, selectedPersona, captions);
      setNewMemes(data.memes || []);
      setCredits(data.credits);
      setMemes(prev => [...(data.memes || []), ...prev]);
      setStep('review');
    } catch (e) {
      setError(e.message);
      setStep('captions');
    } finally {
      setGenerating(false);
    }
  }

  async function deleteMeme(id) {
    Alert.alert('Delete meme?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await api.deleteMeme(id);
        setMemes(p => p.filter(m => m.id !== id));
        setNewMemes(p => p.filter(m => m.id !== id));
      }},
    ]);
  }

  function startWizard() {
    setPhoto(null); setCaptions([]); setNewMemes([]); setError(null);
    setStep('photo'); setTab('wizard');
  }

  function finishWizard() {
    setTab('library'); setPhoto(null); setCaptions([]); setNewMemes([]);
  }

  // ── Library tab ───────────────────────────────────────────────────────────
  if (tab === 'library') {
    return (
      <View style={s.screen}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>🎭 Meme Tools</Text>
            {credits && (
              <Text style={s.creditsText}>{credits.credits} credit{credits.credits !== 1 ? 's' : ''} remaining</Text>
            )}
          </View>
          <TouchableOpacity style={s.primaryBtn} onPress={startWizard}>
            <Text style={s.primaryBtnText}>+ Generate</Text>
          </TouchableOpacity>
        </View>

        {memes.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🎨</Text>
            <Text style={s.emptyText}>No memes yet.</Text>
            <Text style={s.emptySubtext}>Tap Generate to create your first set.</Text>
          </View>
        ) : (
          <FlatList
            data={memes}
            numColumns={2}
            keyExtractor={m => String(m.id)}
            contentContainerStyle={{ padding: 12 }}
            columnWrapperStyle={{ gap: 8 }}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item: m }) => (
              <View style={s.memeCard}>
                <Image source={{ uri: api.getMemeImageUrl(m.id) }} style={s.memeImage} />
                <Text style={s.memeCaption} numberOfLines={2}>{m.caption}</Text>
                <TouchableOpacity style={s.deleteBtn} onPress={() => deleteMeme(m.id)}>
                  <Text style={s.deleteBtnText}>×</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    );
  }

  // ── Wizard tab ─────────────────────────────────────────────────────────────
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setTab('library')}>
          <Text style={s.backBtn}>← Library</Text>
        </TouchableOpacity>
        <Text style={s.title}>Generate Memes</Text>
      </View>

      {error && (
        <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

        {/* Step: photo */}
        {(step === 'photo' || step === 'captions') && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>1. Choose persona</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {personas.map(p => (
                <TouchableOpacity key={p.id} onPress={async () => {
                  setSelectedPersona(p.id);
                  if (photo) await fetchCaptions(p.id);
                }} style={[s.personaChip, selectedPersona === p.id && s.personaChipActive]}>
                  <Text style={s.personaChipText}>{p.emoji} {p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[s.sectionLabel, { marginTop: 16 }]}>2. Your photo</Text>
            {photo ? (
              <View style={{ alignItems: 'center' }}>
                <Image source={{ uri: photo.uri }} style={s.photoPreview} />
                <TouchableOpacity onPress={() => setPhoto(null)} style={{ marginTop: 8 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Change photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[s.primaryBtn, { flex: 1 }]} onPress={pickPhoto}>
                  <Text style={s.primaryBtnText}>📷 Library</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.primaryBtn, { flex: 1 }]} onPress={takePhoto}>
                  <Text style={s.primaryBtnText}>📸 Camera</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Step: captions */}
        {step === 'captions' && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>3. Review captions (tap to edit)</Text>
            {captionsLoading ? (
              <ActivityIndicator color={PURPLE} style={{ marginVertical: 16 }} />
            ) : (
              captions.map((c, i) => (
                <View key={i} style={s.captionRow}>
                  <Text style={s.captionNum}>{i + 1}</Text>
                  <TextInput
                    value={c}
                    onChangeText={v => { const next = [...captions]; next[i] = v; setCaptions(next); }}
                    style={s.captionInput}
                    multiline
                  />
                </View>
              ))
            )}
            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 12, opacity: (!captions.length || !selectedPersona || !credits?.credits) ? 0.4 : 1 }]}
              disabled={!captions.length || !selectedPersona || !credits?.credits}
              onPress={generate}
            >
              <Text style={s.primaryBtnText}>
                {credits?.credits ? 'Generate 10 Memes (1 credit)' : 'No credits remaining'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step: generating */}
        {step === 'generating' && (
          <View style={[s.card, { alignItems: 'center', paddingVertical: 48 }]}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🎨</Text>
            <Text style={s.title}>Generating…</Text>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
              Compositing your photo with {captions.length} captions.{'\n'}Usually takes 30–60 seconds.
            </Text>
            <ActivityIndicator color={PURPLE} size="large" style={{ marginTop: 24 }} />
          </View>
        )}

        {/* Step: review */}
        {step === 'review' && (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={s.title}>🎉 {newMemes.length} memes ready</Text>
              <TouchableOpacity style={s.primaryBtn} onPress={finishWizard}>
                <Text style={s.primaryBtnText}>Save →</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {newMemes.map(m => (
                <View key={m.id} style={[s.memeCard, { width: '47%' }]}>
                  <Image source={{ uri: api.getMemeImageUrl(m.id) }} style={s.memeImage} />
                  <Text style={s.memeCaption} numberOfLines={2}>{m.caption}</Text>
                  <TouchableOpacity style={s.deleteBtn} onPress={() => deleteMeme(m.id)}>
                    <Text style={s.deleteBtnText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DARK },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  creditsText: { color: PURPLE, fontSize: 12, marginTop: 2 },
  primaryBtn: { backgroundColor: PURPLE, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  backBtn: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  card: { backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  personaChip: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: BORDER },
  personaChipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  personaChipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  photoPreview: { width: 120, height: 120, borderRadius: 12, borderWidth: 2, borderColor: PURPLE },
  captionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  captionNum: { color: 'rgba(255,255,255,0.3)', width: 20, textAlign: 'right', fontSize: 12, marginTop: 10 },
  captionInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, color: '#e0e0e0', padding: 10, fontSize: 13, borderWidth: 1, borderColor: BORDER },
  memeCard: { flex: 1, backgroundColor: '#111', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, position: 'relative' },
  memeImage: { width: '100%', aspectRatio: 1 },
  memeCaption: { color: 'rgba(255,255,255,0.75)', fontSize: 11, padding: 8, lineHeight: 15 },
  deleteBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(247,37,133,0.85)', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySubtext: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  errorBox: { backgroundColor: 'rgba(247,37,133,0.12)', borderRadius: 10, margin: 16, padding: 12, borderWidth: 1, borderColor: '#f72585' },
  errorText: { color: '#f72585', fontSize: 13 },
});
