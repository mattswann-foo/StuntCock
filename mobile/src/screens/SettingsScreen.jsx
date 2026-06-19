import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Switch, TextInput, Pressable,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { api } from '../api';
import { useWebSocket } from '../useWebSocket';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

function SettingSection({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ToggleRow({ label, value, onChange, subtitle }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle && <Text style={styles.rowSub}>{subtitle}</Text>}
      </View>
      <Switch
        value={!!value}
        onValueChange={onChange}
        trackColor={{ true: '#3a86ff', false: '#444' }}
        thumbColor="#fff"
      />
    </View>
  );
}

function InputRow({ label, value, onChange, secureTextEntry, keyboardType, multiline, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.inputRow}>
      <View style={styles.inputLabelRow}>
        <Text style={styles.rowLabel}>{label}</Text>
        {secureTextEntry && (
          <Pressable onPress={() => setShow(s => !s)}>
            <Text style={styles.showHide}>{show ? 'Hide' : 'Show'}</Text>
          </Pressable>
        )}
      </View>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={String(value ?? '')}
        onChangeText={onChange}
        secureTextEntry={secureTextEntry && !show}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export default function SettingsScreen({ onSignOut }) {
  const [settings, setSettings] = useState({});
  const [waStatus, setWaStatus] = useState({ running: false, authenticated: false, qrDataUrl: null });
  const [signalStatus, setSignalStatus] = useState({ running: false, enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    try {
      const [s, wa, sig] = await Promise.all([api.getSettings(), api.getWhatsappStatus(), api.getSignalStatus()]);
      const map = {};
      (Array.isArray(s) ? s : Object.entries(s).map(([k, v]) => ({ key: k, value: v }))).forEach(r => {
        map[r.key] = r.value;
      });
      setSettings(map);
      setWaStatus(wa);
      setSignalStatus(sig);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useWebSocket((event) => {
    if (event.event === 'whatsapp_status') setWaStatus(event.data);
    if (event.event === 'whatsapp_qr') setWaStatus(prev => ({ ...prev, qrDataUrl: event.data.qrDataUrl }));
    if (event.event === 'signal_status') setSignalStatus(prev => ({ ...prev, ...event.data }));
  });

  async function toggleSignal(enable) {
    try {
      if (enable) await api.enableSignal();
      else await api.disableSignal();
      setSignalStatus(prev => ({ ...prev, enabled: enable }));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  function set(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.bulkSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleWhatsapp(enable) {
    try {
      if (enable) {
        await api.enableWhatsapp();
        set('whatsapp_enabled', 'true');
      } else {
        await api.disableWhatsapp();
        set('whatsapp_enabled', 'false');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#3a86ff" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 60 }}>

      <SettingSection title="LLM Fallback">
        <ToggleRow
          label="Enable Claude fallback"
          subtitle="Uses Claude when no rule matches"
          value={settings.llm_enabled === 'true'}
          onChange={v => set('llm_enabled', v ? 'true' : 'false')}
        />
        <InputRow
          label="Anthropic API Key"
          value={settings.anthropic_api_key}
          onChange={v => set('anthropic_api_key', v)}
          secureTextEntry
          placeholder="sk-ant-..."
        />
        <InputRow
          label="System Prompt"
          value={settings.llm_system_prompt}
          onChange={v => set('llm_system_prompt', v)}
          multiline
          placeholder="You are a helpful assistant..."
        />
      </SettingSection>

      <SettingSection title="Signal">
        <ToggleRow
          label="Enable Signal"
          subtitle={signalStatus.running ? '● Connected' : signalStatus.enabled ? 'Starting…' : 'Disabled'}
          value={signalStatus.enabled}
          onChange={toggleSignal}
        />
      </SettingSection>

      <SettingSection title="WhatsApp">
        <ToggleRow
          label="Enable WhatsApp"
          value={settings.whatsapp_enabled === 'true'}
          onChange={toggleWhatsapp}
        />
        {waStatus.running && !waStatus.authenticated && waStatus.qrDataUrl && (
          <View style={styles.qrContainer}>
            <Text style={styles.qrLabel}>Scan with WhatsApp → Linked Devices</Text>
            <Image source={{ uri: waStatus.qrDataUrl }} style={styles.qr} />
          </View>
        )}
        {waStatus.running && waStatus.authenticated && (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>✓ WhatsApp connected</Text>
          </View>
        )}
      </SettingSection>

      <SettingSection title="GIF Replies">
        <ToggleRow
          label="Enable GIF replies"
          value={settings.gif_enabled === 'true'}
          onChange={v => set('gif_enabled', v ? 'true' : 'false')}
        />
        <InputRow
          label="Giphy API Key"
          value={settings.giphy_api_key}
          onChange={v => set('giphy_api_key', v)}
          secureTextEntry
          placeholder="Giphy key..."
        />
        <View style={styles.inputRow}>
          <Text style={styles.rowLabel}>GIF Frequency: {Math.round(parseFloat(settings.gif_frequency || 0.15) * 100)}%</Text>
        </View>
      </SettingSection>

      <SettingSection title="General">
        <InputRow
          label="Global Cooldown (minutes)"
          value={settings.global_cooldown_minutes}
          onChange={v => set('global_cooldown_minutes', v)}
          keyboardType="numeric"
          placeholder="5"
        />
        <View style={styles.inputRow}>
          <Text style={styles.rowLabel}>Timezone</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {TIMEZONES.map(tz => (
              <Pressable
                key={tz}
                style={[styles.tzChip, settings.timezone === tz && styles.tzChipActive]}
                onPress={() => set('timezone', tz)}
              >
                <Text style={[styles.tzChipText, settings.timezone === tz && { color: '#fff' }]}>
                  {tz.replace('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </SettingSection>

      <Pressable style={[styles.saveBtn, saved && styles.saveBtnDone]} onPress={save} disabled={saving}>
        <Text style={styles.saveBtnText}>
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Settings'}
        </Text>
      </Pressable>

      <Pressable
        style={styles.signOutBtn}
        onPress={() => Alert.alert('Sign Out', 'Are you sure?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: onSignOut },
        ])}
      >
        <Text style={styles.signOutBtnText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f0f' },
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  section: { gap: 2 },
  sectionTitle: { color: '#6c757d', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  sectionBody: { backgroundColor: '#1a1a2e', borderRadius: 12, borderWidth: 1, borderColor: '#2d2d4e', overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: '#2d2d4e',
  },
  rowLabel: { color: '#e0e0e0', fontSize: 14, fontWeight: '500' },
  rowSub: { color: '#6c757d', fontSize: 11, marginTop: 2 },
  inputRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#2d2d4e' },
  inputLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  showHide: { color: '#3a86ff', fontSize: 12 },
  input: {
    backgroundColor: '#0f0f0f', borderRadius: 8, borderWidth: 1,
    borderColor: '#3d3d5e', color: '#e0e0e0', padding: 10, fontSize: 13,
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top' },
  qrContainer: { padding: 16, alignItems: 'center', gap: 10 },
  qrLabel: { color: '#adb5bd', fontSize: 12, textAlign: 'center' },
  qr: { width: 200, height: 200, borderRadius: 8 },
  statusPill: { margin: 12, backgroundColor: 'rgba(37,211,102,0.15)', borderRadius: 8, padding: 10, alignItems: 'center' },
  statusPillText: { color: '#25d366', fontWeight: '600', fontSize: 13 },
  tzChip: {
    backgroundColor: '#0f0f0f', borderRadius: 16, paddingHorizontal: 10,
    paddingVertical: 5, marginRight: 6, borderWidth: 1, borderColor: '#3d3d5e',
  },
  tzChipActive: { backgroundColor: '#3a86ff', borderColor: '#3a86ff' },
  tzChipText: { color: '#6c757d', fontSize: 11 },
  saveBtn: {
    backgroundColor: '#3a86ff', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  saveBtnDone: { backgroundColor: '#25d366' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  signOutBtn: {
    borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4,
    borderWidth: 1, borderColor: '#f72585',
  },
  signOutBtnText: { color: '#f72585', fontWeight: '600', fontSize: 15 },
});
