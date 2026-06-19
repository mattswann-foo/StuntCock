import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  ScrollView, RefreshControl, Dimensions,
} from 'react-native';
import { api } from '../api';

const W = Dimensions.get('window').width;

function StatCard({ label, value, color }) {
  return (
    <View style={[styles.statCard, { borderColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function BarChart({ data }) {
  if (!data?.length) return null;
  const maxVal = Math.max(...data.map(d => d.total || 1), 1);
  const barW = (W - 48) / data.length - 6;

  return (
    <View style={styles.chart}>
      <View style={styles.chartBars}>
        {data.map((d, i) => {
          const totalH = Math.max((d.total / maxVal) * 120, 2);
          const repliedH = Math.max((d.replied / maxVal) * 120, 0);
          const llmH = Math.max((d.llm_triggered / maxVal) * 120, 0);
          return (
            <View key={i} style={[styles.barGroup, { width: barW }]}>
              <View style={{ height: 120, justifyContent: 'flex-end', alignItems: 'center' }}>
                <View style={{ width: barW - 2, height: totalH, backgroundColor: '#2d2d4e', borderRadius: 4, justifyContent: 'flex-end' }}>
                  <View style={{ height: repliedH, backgroundColor: '#3a86ff', borderRadius: 4 }} />
                </View>
              </View>
              <Text style={styles.barLabel} numberOfLines={1}>{d.day?.slice(5)}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#2d2d4e' }]} />
          <Text style={styles.legendText}>Received</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#3a86ff' }]} />
          <Text style={styles.legendText}>Replied</Text>
        </View>
      </View>
    </View>
  );
}

export default function AnalyticsScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const result = await api.getAnalytics(7);
      setData(result);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#3a86ff" /></View>;
  }

  const totalWeek = data?.daily?.reduce((s, d) => s + (d.total || 0), 0) ?? 0;
  const repliedWeek = data?.daily?.reduce((s, d) => s + (d.replied || 0), 0) ?? 0;
  const llmWeek = data?.daily?.reduce((s, d) => s + (d.llm_triggered || 0), 0) ?? 0;
  const unmatchedWeek = data?.daily?.reduce((s, d) => s + (d.unmatched || 0), 0) ?? 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.section}>Today</Text>
      <View style={styles.statRow}>
        <StatCard label="Received" value={data?.today?.total ?? 0} color="#3a86ff" />
        <StatCard label="Replied" value={data?.today?.replied ?? 0} color="#25d366" />
        <StatCard label="Active Rules" value={data?.activeRules ?? 0} color="#7209b7" />
      </View>

      <Text style={styles.section}>Last 7 Days</Text>
      <View style={styles.statRow}>
        <StatCard label="Messages" value={totalWeek} color="#3a86ff" />
        <StatCard label="Replied" value={repliedWeek} color="#25d366" />
        <StatCard label="Claude" value={llmWeek} color="#f72585" />
        <StatCard label="Unmatched" value={unmatchedWeek} color="#6c757d" />
      </View>

      <Text style={styles.section}>Activity Chart</Text>
      <BarChart data={data?.daily} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f0f' },
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { padding: 16, gap: 12 },
  section: { color: '#6c757d', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  statRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statCard: {
    flex: 1, minWidth: 80, backgroundColor: '#1a1a2e',
    borderRadius: 12, padding: 14, borderWidth: 1, alignItems: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '700' },
  statLabel: { color: '#6c757d', fontSize: 11, marginTop: 2, textAlign: 'center' },
  chart: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#2d2d4e' },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barGroup: { alignItems: 'center' },
  barLabel: { color: '#6c757d', fontSize: 9, marginTop: 4 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#adb5bd', fontSize: 11 },
});
