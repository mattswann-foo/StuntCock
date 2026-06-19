import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable, Switch,
  Modal, ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { api } from '../api';

const TRIGGER_TYPES = ['any', 'contains', 'starts_with', 'exact', 'regex'];
const RESPONSE_TYPES = ['static', 'template', 'llm'];
const PLATFORM_FILTERS = ['any', 'signal', 'whatsapp'];

function Badge({ label, color }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function RuleCard({ rule, onEdit, onDelete, onToggle }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ruleName}>{rule.name}</Text>
          <View style={styles.badgeRow}>
            <Badge label={rule.trigger_type} color="#3a86ff" />
            <Badge label={rule.response_type} color="#7209b7" />
            {rule.platform_filter !== 'any' && (
              <Badge label={rule.platform_filter} color={rule.platform_filter === 'signal' ? '#3a86ff' : '#25d366'} />
            )}
          </View>
        </View>
        <Switch
          value={!!rule.active}
          onValueChange={() => onToggle(rule)}
          trackColor={{ true: '#3a86ff', false: '#444' }}
          thumbColor="#fff"
        />
      </View>
      <View style={styles.cardActions}>
        <Pressable style={styles.actionBtn} onPress={() => onEdit(rule)}>
          <Text style={styles.actionBtnText}>Edit</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.deleteBtn]} onPress={() => onDelete(rule)}>
          <Text style={[styles.actionBtnText, { color: '#f72585' }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SegmentedPicker({ options, value, onChange }) {
  return (
    <View style={styles.segmented}>
      {options.map(opt => (
        <Pressable
          key={opt}
          style={[styles.segment, value === opt && styles.segmentActive]}
          onPress={() => onChange(opt)}
        >
          <Text style={[styles.segmentText, value === opt && styles.segmentTextActive]}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function RuleModal({ visible, rule, personas, onSave, onClose }) {
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('any');
  const [triggerValue, setTriggerValue] = useState('');
  const [platformFilter, setPlatformFilter] = useState('any');
  const [responseType, setResponseType] = useState('static');
  const [responseText, setResponseText] = useState('');
  const [personaId, setPersonaId] = useState(null);
  const [llmPrompt, setLlmPrompt] = useState('');
  const [cooldown, setCooldown] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setName(rule.name || '');
      setTriggerType(rule.trigger_type || 'any');
      setTriggerValue(rule.trigger_value || '');
      setPlatformFilter(rule.platform_filter || 'any');
      setResponseType(rule.response_type || 'static');
      setResponseText(rule.response_text || '');
      setPersonaId(rule.persona_id || null);
      setLlmPrompt(rule.rule_llm_prompt || '');
      setCooldown(String(rule.cooldown_minutes ?? 0));
    } else {
      setName(''); setTriggerType('any'); setTriggerValue('');
      setPlatformFilter('any'); setResponseType('static');
      setResponseText(''); setPersonaId(null); setLlmPrompt(''); setCooldown('0');
    }
  }, [rule, visible]);

  async function handleSave() {
    if (!name.trim()) return Alert.alert('Name required');
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        trigger_type: triggerType,
        trigger_value: triggerValue || null,
        platform_filter: platformFilter,
        response_type: responseType,
        response_text: responseText || null,
        persona_id: personaId,
        rule_llm_prompt: llmPrompt || null,
        cooldown_minutes: parseInt(cooldown) || 0,
        active: rule?.active ?? true,
      });
      onClose();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>{rule ? 'Edit Rule' : 'New Rule'}</Text>
          <Pressable onPress={handleSave} disabled={saving}>
            <Text style={[styles.modalSave, saving && { opacity: 0.5 }]}>Save</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.modalBody} contentContainerStyle={{ gap: 20, paddingBottom: 40 }}>
          <View>
            <Text style={styles.label}>Rule Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Morning greeting" placeholderTextColor="#555" />
          </View>

          <View>
            <Text style={styles.label}>Trigger Type</Text>
            <SegmentedPicker options={TRIGGER_TYPES} value={triggerType} onChange={setTriggerType} />
          </View>

          {triggerType !== 'any' && (
            <View>
              <Text style={styles.label}>Trigger Value</Text>
              <TextInput
                style={styles.input}
                value={triggerValue}
                onChangeText={setTriggerValue}
                placeholder={triggerType === 'regex' ? 'e.g. ^hello' : 'e.g. hey'}
                placeholderTextColor="#555"
                autoCapitalize="none"
              />
            </View>
          )}

          <View>
            <Text style={styles.label}>Platform</Text>
            <SegmentedPicker options={PLATFORM_FILTERS} value={platformFilter} onChange={setPlatformFilter} />
          </View>

          <View>
            <Text style={styles.label}>Response Type</Text>
            <SegmentedPicker options={RESPONSE_TYPES} value={responseType} onChange={setResponseType} />
          </View>

          {(responseType === 'static' || responseType === 'template') && (
            <View>
              <Text style={styles.label}>Response Text</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={responseText}
                onChangeText={setResponseText}
                multiline
                placeholder={responseType === 'template' ? 'Hey {sender_name}! It\'s {time}.' : 'Your reply here...'}
                placeholderTextColor="#555"
              />
            </View>
          )}

          {responseType === 'llm' && (
            <View>
              <Text style={styles.label}>Persona</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                <Pressable
                  style={[styles.personaChip, !personaId && styles.personaChipActive]}
                  onPress={() => setPersonaId(null)}
                >
                  <Text style={styles.personaChipText}>Global default</Text>
                </Pressable>
                {personas.map(p => (
                  <Pressable
                    key={p.id}
                    style={[styles.personaChip, personaId === p.id && styles.personaChipActive]}
                    onPress={() => setPersonaId(p.id)}
                  >
                    <Text style={styles.personaChipText}>{p.emoji} {p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={[styles.label, { marginTop: 12 }]}>Custom Prompt Override</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={llmPrompt}
                onChangeText={setLlmPrompt}
                multiline
                placeholder="Leave blank to use persona default"
                placeholderTextColor="#555"
              />
            </View>
          )}

          <View>
            <Text style={styles.label}>Cooldown (minutes)</Text>
            <TextInput
              style={styles.input}
              value={cooldown}
              onChangeText={setCooldown}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#555"
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function RulesScreen() {
  const [rules, setRules] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  async function load() {
    try {
      const [r, p] = await Promise.all([api.getRules(), api.getPersonas()]);
      setRules(r);
      setPersonas(p);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(rule) {
    try {
      const updated = await api.updateRule(rule.id, { active: !rule.active });
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
    } catch (e) { Alert.alert('Error', e.message); }
  }

  async function handleDelete(rule) {
    Alert.alert('Delete Rule', `Delete "${rule.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.deleteRule(rule.id);
            setRules(prev => prev.filter(r => r.id !== rule.id));
          } catch (e) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  }

  async function handleSave(data) {
    if (editingRule) {
      const updated = await api.updateRule(editingRule.id, data);
      setRules(prev => prev.map(r => r.id === editingRule.id ? updated : r));
    } else {
      const created = await api.createRule(data);
      setRules(prev => [...prev, created]);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#3a86ff" /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
      <FlatList
        data={rules}
        keyExtractor={r => String(r.id)}
        renderItem={({ item }) => (
          <RuleCard
            rule={item}
            onEdit={(r) => { setEditingRule(r); setModalVisible(true); }}
            onDelete={handleDelete}
            onToggle={handleToggle}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No rules yet. Tap + to create one.</Text>}
      />

      <Pressable style={styles.fab} onPress={() => { setEditingRule(null); setModalVisible(true); }}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <RuleModal
        visible={modalVisible}
        rule={editingRule}
        personas={personas}
        onSave={handleSave}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f0f' },
  list: { padding: 12, gap: 10, flexGrow: 1 },
  empty: { color: '#6c757d', textAlign: 'center', marginTop: 60, fontSize: 15 },
  card: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#2d2d4e',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleName: { color: '#e0e0e0', fontWeight: '600', fontSize: 15, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 12, borderTopWidth: 1, borderTopColor: '#2d2d4e', paddingTop: 10 },
  actionBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#2d2d4e', alignItems: 'center',
  },
  deleteBtn: { backgroundColor: 'rgba(247,37,133,0.1)', borderWidth: 1, borderColor: '#f72585' },
  actionBtnText: { color: '#e0e0e0', fontSize: 13, fontWeight: '600' },
  fab: {
    position: 'absolute', right: 20, bottom: 30,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#3a86ff', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#3a86ff', shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#0f0f0f' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#2d2d4e',
  },
  modalTitle: { color: '#e0e0e0', fontWeight: '700', fontSize: 16 },
  modalCancel: { color: '#6c757d', fontSize: 15 },
  modalSave: { color: '#3a86ff', fontSize: 15, fontWeight: '700' },
  modalBody: { flex: 1, padding: 16 },
  label: { color: '#adb5bd', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#1a1a2e', borderRadius: 10, borderWidth: 1,
    borderColor: '#2d2d4e', color: '#e0e0e0', padding: 12, fontSize: 14,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  segmented: {
    flexDirection: 'row', backgroundColor: '#1a1a2e',
    borderRadius: 10, borderWidth: 1, borderColor: '#2d2d4e', overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentActive: { backgroundColor: '#3a86ff' },
  segmentText: { color: '#6c757d', fontSize: 12, fontWeight: '600' },
  segmentTextActive: { color: '#fff' },
  personaChip: {
    backgroundColor: '#1a1a2e', borderRadius: 20, paddingHorizontal: 12,
    paddingVertical: 6, marginRight: 8, borderWidth: 1, borderColor: '#2d2d4e',
  },
  personaChipActive: { backgroundColor: '#7209b7', borderColor: '#7209b7' },
  personaChipText: { color: '#e0e0e0', fontSize: 12 },
});
