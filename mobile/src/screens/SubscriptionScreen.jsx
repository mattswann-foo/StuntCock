// SubscriptionScreen — IAP subscription UI with StoreKit 2 / Play Billing purchase flow.
// Tapping the subscription button triggers the native purchase sheet.

import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Alert, Platform,
} from 'react-native';
import { useIAP } from '../hooks/useIAP';

/**
 * Format an ISO date string into a human-readable expiry string.
 * @param {string} isoDate
 * @returns {string}
 */
function formatExpiry(isoDate) {
  if (!isoDate) return 'Unknown';
  const d = new Date(isoDate);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * SubscriptionScreen
 * @param {{ user: object, jwtToken: string }} props
 */
export default function SubscriptionScreen({ user, jwtToken }) {
  const { products, purchasing, entitlement, initError, purchase, refreshEntitlement } = useIAP(jwtToken);

  // Refresh entitlement each time the screen comes into focus
  useEffect(() => {
    refreshEntitlement();
  }, [refreshEntitlement]);

  if (initError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>⚠️ {initError}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🐓</Text>
        <Text style={styles.heroTitle}>StuntCock Pro</Text>
        <Text style={styles.heroSubtitle}>Unlock unlimited auto-responder rules, AI personas, and priority support.</Text>
      </View>

      {/* Active entitlement banner */}
      {entitlement && (
        <View style={styles.entitlementBanner}>
          <Text style={styles.entitlementIcon}>✅</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.entitlementTitle}>Pro Active</Text>
            <Text style={styles.entitlementSub}>Expires {formatExpiry(entitlement.expiresAt)}</Text>
          </View>
        </View>
      )}

      {/* Feature list */}
      <View style={styles.featureList}>
        {[
          '⚡  Unlimited auto-responder rules',
          '🎭  All AI persona packs',
          '📊  Advanced analytics',
          '🔒  Priority support',
          '🔄  Cross-device sync',
        ].map((f) => (
          <View key={f} style={styles.featureRow}>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      {/* Product buttons */}
      {products.length === 0 && !entitlement && (
        <ActivityIndicator size="large" color="#3a86ff" style={{ marginVertical: 24 }} />
      )}

      {products.map((product) => (
        <Pressable
          key={product.productId}
          style={[styles.subscribeBtn, purchasing && styles.subscribeBtnDisabled]}
          onPress={() => purchase(product.productId)}
          disabled={purchasing}
          accessibilityRole="button"
          accessibilityLabel={`Subscribe to ${product.title || product.productId}`}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.subscribeBtnTitle}>{product.title || 'StuntCock Pro'}</Text>
              <Text style={styles.subscribeBtnPrice}>
                {product.localizedPrice || product.price} / {product.subscriptionPeriodUnitIOS || product.subscriptionPeriodAndroid || 'month'}
              </Text>
            </>
          )}
        </Pressable>
      ))}

      {/* Restore / legal */}
      <Text style={styles.legal}>
        {Platform.OS === 'ios'
          ? 'Payment will be charged to your Apple ID account at confirmation of purchase. Subscriptions automatically renew unless auto-renew is turned off at least 24 hours before the end of the current period.'
          : 'Payment will be charged to your Google Play account at confirmation of purchase.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { padding: 20, paddingBottom: 60, gap: 20 },
  center: { flex: 1, backgroundColor: '#0f0f0f', justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#f72585', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  hero: { alignItems: 'center', paddingVertical: 24 },
  heroIcon: { fontSize: 56, marginBottom: 12 },
  heroTitle: { color: '#e0e0e0', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  heroSubtitle: { color: '#6c757d', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  entitlementBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1a3a2e', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#2ecc71',
  },
  entitlementIcon: { fontSize: 28 },
  entitlementTitle: { color: '#2ecc71', fontWeight: '700', fontSize: 15 },
  entitlementSub: { color: '#adb5bd', fontSize: 12, marginTop: 2 },

  featureList: { gap: 10 },
  featureRow: {
    backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#2d2d4e',
  },
  featureText: { color: '#e0e0e0', fontSize: 14 },

  subscribeBtn: {
    backgroundColor: '#3a86ff', borderRadius: 14, paddingVertical: 18,
    alignItems: 'center', gap: 4,
  },
  subscribeBtnDisabled: { opacity: 0.6 },
  subscribeBtnTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  subscribeBtnPrice: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },

  legal: {
    color: '#495057', fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 8,
  },
});
