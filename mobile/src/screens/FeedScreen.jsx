import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, Pressable,
} from 'react-native';
import { api } from '../api';
import { useWebSocket } from '../useWebSocket';

const PLATFORM_COLORS = { signal: '#3a86ff', whatsapp: '#25d366' };
const TYPE_COLORS = { llm: '#f72585', static: '#3a86ff', template: '#7209b7', none: '#6c757d' };
const TYPE_LABELS = { llm: '♥ Claude', static: '⚡ Rule', template: '⚡ Rule', none: 'Silent' };

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function MessageCard({ item, isNew }) {
  const platform = item.platform || 'signal';
  const sender = item.sender_name || item.sender || 'Unknown';
  const responseType = item.response_type || 'none';

  return (
    <View style={[styles.card, isNew && styles.cardNew]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: PLATFORM_COLORS[platform] }]}>
          <Text style={styles.avatarText}>{initials(sender)}</Text>
        </View>
        <View style={styles.senderInfo}>
          <Text style={styles.senderName} numberOfLines={1}>{sender}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: PLATFORM_COLORS[platform] }]}>
              <Text style={styles.badgeText}>{platform}</Text>
            </View>
            {item.group_id && (
              <View style={[styles.badge, { backgroundColor: '#495057' }]}>
                <Text style={styles.badgeText}>group</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.timestamp}>{timeAgo(item.timestamp)}</Text>
      </View>

      <Text style={styles.messageBody} numberOfLines={3}>{item.message_body}</Text>

      {item.response_sent ? (
        <View style={styles.responseRow}>
          <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[responseType] }]}>
            <Text style={styles.typeBadgeText}>{TYPE_LABELS[responseType]}</Text>
          </View>
          <Text style={styles.responseText} numberOfLines={2}>{item.response_sent}</Text>
        </View>
      ) : (
        <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS.none, alignSelf: 'flex-start', marginTop: 6 }]}>
          <Text style={styles.typeBadgeText}>Silent</Text>
        </View>
      )}
    </View>
  );
}

export default function FeedScreen() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newIds, setNewIds] = useState(new Set());
  const listRef = useRef(null);

  async function load() {
    try {
      const data = await api.getMessages(50);
      setMessages(data);
    } catch (e) {
      console.warn('Feed load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  useWebSocket((event) => {
    if (event.event === 'message') {
      const msg = { ...event.data, id: Date.now() };
      setMessages(prev => [msg, ...prev]);
      setNewIds(prev => new Set([...prev, msg.id]));
      setTimeout(() => setNewIds(prev => {
        const next = new Set(prev);
        next.delete(msg.id);
        return next;
      }), 2000);
    }
  });

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#3a86ff" /></View>;
  }

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(item, i) => String(item.id ?? i)}
      renderItem={({ item }) => <MessageCard item={item} isNew={newIds.has(item.id)} />}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f0f' },
  list: { padding: 12, gap: 10, backgroundColor: '#0f0f0f', flexGrow: 1 },
  empty: { color: '#6c757d', textAlign: 'center', marginTop: 60, fontSize: 15 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2d2d4e',
  },
  cardNew: { borderColor: '#3a86ff', shadowColor: '#3a86ff', shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  senderInfo: { flex: 1 },
  senderName: { color: '#e0e0e0', fontWeight: '600', fontSize: 14 },
  badges: { flexDirection: 'row', gap: 4, marginTop: 2 },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  timestamp: { color: '#6c757d', fontSize: 11 },
  messageBody: { color: '#adb5bd', fontSize: 13, lineHeight: 18 },
  responseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  typeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  typeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  responseText: { flex: 1, color: '#ced4da', fontSize: 12, lineHeight: 16 },
});
