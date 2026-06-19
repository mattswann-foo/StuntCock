import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable,
  Modal, ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { api } from '../api';

function PersonaDetailModal({ persona, visible, onClose }) {
  if (!persona) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.detailModal}>
        <View style={styles.modalHeader}>
          <View />
          <Text style={styles.modalTitle}>{persona.emoji} {persona.name}</Text>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Done</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Text style={styles.tagline}>{persona.tagline}</Text>
          <Text style={styles.desc}>{persona.full_description || persona.description}</Text>
          {persona.system_prompt && (
            <>
              <Text style={styles.label}>System Prompt</Text>
              <View style={styles.promptBox}>
                <Text style={styles.promptText}>{persona.system_prompt}</Text>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function CreatePersonaModal({ visible, onSave, onClose }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🤖');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    if (!name.trim() || !description.trim()) return Alert.alert('Enter name and description first');
    setGenerating(true);
    try {
      const result = await api.generatePersonaPrompt(name, description);
      setSystemPrompt(result.system_prompt || result);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) return Alert.alert('Name required');
    setSaving(true);
    try {
      await onSave({ name, emoji, description, system_prompt: systemPrompt });
      setName(''); setEmoji('🤖'); setDescription(''); setSystemPrompt('');
      onClose();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.detailModal}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>New Persona</Text>
          <Pressable onPress={handleSave} disabled={saving}>
            <Text style={[styles.modalSave, saving && { opacity: 0.5 }]}>Save</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={styles.row}>
            <View style={{ width: 70 }}>
              <Text style={styles.label}>Emoji</Text>
              <TextInput style={[styles.input, { textAlign: 'center', fontSize: 24 }]} value={emoji} onChangeText={setEmoji} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Persona name" placeholderTextColor="#555" />
            </View>
          </View>

          <View>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
              value={description} onChangeText={setDescription}
              multiline placeholder="Describe the vibe..." placeholderTextColor="#555"
            />
          </View>

          <View>
            <View style={styles.labelRow}>
              <Text style={styles.label}>System Prompt</Text>
              <Pressable onPress={handleGenerate} disabled={generating} style={styles.genBtn}>
                <Text style={styles.genBtnText}>{generating ? 'Generating...' : '✨ AI Generate'}</Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
              value={systemPrompt} onChangeText={setSystemPrompt}
              multiline placeholder="You are..." placeholderTextColor="#555"
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function PersonaCard({ persona, onPress }) {
  return (
    <Pressable style={styles.card} onPress={() => onPress(persona)}>
      <Text style={styles.cardEmoji}>{persona.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{persona.name}</Text>
        <Text style={styles.cardTagline} numberOfLines={1}>{persona.tagline || persona.description}</Text>
      </View>
      {!persona.is_builtin && (
        <View style={styles.customBadge}><Text style={styles.customBadgeText}>custom</Text></View>
      )}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function PersonasScreen() {
  const [groups, setGroups] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null);

  async function load() {
    try {
      const [g, p] = await Promise.all([api.getPersonaGroups(), api.getPersonas()]);
      setGroups(g);
      setPersonas(p);
      if (g.length) setActiveGroup(g[0].id ?? g[0].group_id ?? g[0].label);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(data) {
    const created = await api.createPersona(data);
    setPersonas(prev => [...prev, created]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#3a86ff" /></View>;
  }

  const groupedPersonas = personas.filter(p =>
    activeGroup && (p.group_id === activeGroup || p.group_label === activeGroup || p.group_id === activeGroup)
  );

  const displayPersonas = groupedPersonas.length ? groupedPersonas : personas;

  return (
    <View style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupTabs} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
        {groups.map(g => {
          const gid = g.id ?? g.group_id ?? g.label;
          return (
            <Pressable
              key={gid}
              style={[styles.groupTab, activeGroup === gid && styles.groupTabActive]}
              onPress={() => setActiveGroup(gid)}
            >
              <Text style={[styles.groupTabText, activeGroup === gid && styles.groupTabTextActive]}>
                {g.emoji} {g.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.groupTab, activeGroup === 'custom' && styles.groupTabActive]}
          onPress={() => setActiveGroup('custom')}
        >
          <Text style={[styles.groupTabText, activeGroup === 'custom' && styles.groupTabTextActive]}>⚙️ Custom</Text>
        </Pressable>
      </ScrollView>

      <FlatList
        data={activeGroup === 'custom' ? personas.filter(p => !p.is_builtin) : displayPersonas}
        keyExtractor={p => String(p.id)}
        renderItem={({ item }) => (
          <PersonaCard persona={item} onPress={(p) => { setSelected(p); setShowDetail(true); }} />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No personas in this group.</Text>}
      />

      <Pressable style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <PersonaDetailModal persona={selected} visible={showDetail} onClose={() => setShowDetail(false)} />
      <CreatePersonaModal visible={showCreate} onSave={handleCreate} onClose={() => setShowCreate(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f0f' },
  groupTabs: { paddingVertical: 12, flexGrow: 0 },
  groupTab: {
    backgroundColor: '#1a1a2e', borderRadius: 20, paddingHorizontal: 12,
    paddingVertical: 6, borderWidth: 1, borderColor: '#2d2d4e',
  },
  groupTabActive: { backgroundColor: '#7209b7', borderColor: '#7209b7' },
  groupTabText: { color: '#6c757d', fontSize: 12, fontWeight: '600' },
  groupTabTextActive: { color: '#fff' },
  list: { padding: 12, gap: 8, flexGrow: 1 },
  empty: { color: '#6c757d', textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#2d2d4e', flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  cardEmoji: { fontSize: 28 },
  cardName: { color: '#e0e0e0', fontWeight: '600', fontSize: 14 },
  cardTagline: { color: '#6c757d', fontSize: 12, marginTop: 2 },
  customBadge: { backgroundColor: '#7209b7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  customBadgeText: { color: '#fff', fontSize: 10 },
  chevron: { color: '#6c757d', fontSize: 20 },
  fab: {
    position: 'absolute', right: 20, bottom: 30, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#7209b7', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#7209b7', shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
  // Modals
  detailModal: { flex: 1, backgroundColor: '#0f0f0f' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#2d2d4e',
  },
  modalTitle: { color: '#e0e0e0', fontWeight: '700', fontSize: 16 },
  modalCancel: { color: '#6c757d', fontSize: 15 },
  modalSave: { color: '#7209b7', fontSize: 15, fontWeight: '700' },
  tagline: { color: '#adb5bd', fontStyle: 'italic', fontSize: 15 },
  desc: { color: '#ced4da', fontSize: 14, lineHeight: 22 },
  label: { color: '#adb5bd', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  promptBox: { backgroundColor: '#1a1a2e', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#2d2d4e' },
  promptText: { color: '#adb5bd', fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 12 },
  input: {
    backgroundColor: '#1a1a2e', borderRadius: 10, borderWidth: 1,
    borderColor: '#2d2d4e', color: '#e0e0e0', padding: 12, fontSize: 14,
  },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  genBtn: { backgroundColor: '#1a1a2e', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#f72585' },
  genBtnText: { color: '#f72585', fontSize: 11, fontWeight: '600' },
});
