// useIAP — In-App Purchase hook wrapping expo-iap (StoreKit 2 on iOS, Play Billing on Android).
// Reads product IDs from EXPO_PUBLIC_IAP_PRODUCT_IDS env var (comma-separated).

import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import {
  initConnection,
  endConnection,
  getProducts,
  requestPurchase,
  purchaseErrorListener,
  purchaseUpdatedListener,
  finishTransaction,
  PurchaseError,
} from 'expo-iap';
import { API_BASE } from '../api';

// Product IDs must come from the environment — never hardcoded.
const RAW_IDS = process.env.EXPO_PUBLIC_IAP_PRODUCT_IDS || '';
export const PRODUCT_IDS = RAW_IDS.split(',').map((s) => s.trim()).filter(Boolean);

/**
 * useIAP — manages the full IAP lifecycle.
 *
 * @param {string|null} jwtToken  - The bearer token for the authenticated user.
 * @returns {{
 *   products: object[],
 *   purchasing: boolean,
 *   entitlement: {entitlement: string, expiresAt: string}|null,
 *   initError: string|null,
 *   purchase: (productId: string) => Promise<void>,
 *   refreshEntitlement: () => Promise<void>,
 * }}
 */
export function useIAP(jwtToken) {
  const [products, setProducts] = useState([]);
  const [purchasing, setPurchasing] = useState(false);
  const [entitlement, setEntitlement] = useState(null);
  const [initError, setInitError] = useState(null);

  // ── Fetch entitlement from the backend (cross-device sync) ──────────────────
  const refreshEntitlement = useCallback(async () => {
    if (!jwtToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/iap/entitlement`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEntitlement(data);
      }
    } catch {
      // Network failure — silently ignore; entitlement remains stale
    }
  }, [jwtToken]);

  // ── Validate receipt with backend and persist entitlement ───────────────────
  const validateWithBackend = useCallback(async ({ platform, receipt, productId }) => {
    if (!jwtToken) throw new Error('Not authenticated');
    const res = await fetch(`${API_BASE}/api/iap/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({ platform, receipt, productId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Validation failed (${res.status})`);
    }
    return res.json();
  }, [jwtToken]);

  // ── IAP connection & product loading ────────────────────────────────────────
  useEffect(() => {
    if (PRODUCT_IDS.length === 0) {
      setInitError('No IAP product IDs configured (EXPO_PUBLIC_IAP_PRODUCT_IDS is empty)');
      return;
    }

    let purchaseUpdateSub;
    let purchaseErrorSub;
    let active = true;

    async function init() {
      try {
        await initConnection();
      } catch (e) {
        if (active) setInitError(`IAP connection failed: ${e.message}`);
        return;
      }

      if (!active) return;

      // Load products from the store
      try {
        const fetched = await getProducts({ skus: PRODUCT_IDS });
        if (active) setProducts(fetched);
      } catch (e) {
        if (active) setInitError(`Failed to load products: ${e.message}`);
      }

      // Refresh entitlement on foreground
      refreshEntitlement();

      // Listen for successful purchases (handles completions from the store UI)
      purchaseUpdateSub = purchaseUpdatedListener(async (purchase) => {
        try {
          const platform = Platform.OS === 'ios' ? 'ios' : 'android';
          // On iOS the receipt is the JWS transaction; on Android it's the purchaseToken
          const receipt = Platform.OS === 'ios'
            ? purchase.transactionReceipt
            : purchase.purchaseToken;

          const result = await validateWithBackend({
            platform,
            receipt,
            productId: purchase.productId,
          });

          setEntitlement({ entitlement: result.entitlement, expiresAt: result.expiresAt });

          // Acknowledge the purchase so the store doesn't refund it
          await finishTransaction({ purchase, isConsumable: false });
        } catch (e) {
          Alert.alert('Purchase Error', e.message || 'Could not verify purchase. Please contact support.');
        } finally {
          setPurchasing(false);
        }
      });

      // Listen for purchase errors
      purchaseErrorSub = purchaseErrorListener((error) => {
        if (error instanceof PurchaseError && error.code === 'E_USER_CANCELLED') {
          // User cancelled — no alert needed
        } else {
          Alert.alert('Purchase Failed', error.message || 'An error occurred during purchase.');
        }
        setPurchasing(false);
      });
    }

    init();

    return () => {
      active = false;
      purchaseUpdateSub?.remove?.();
      purchaseErrorSub?.remove?.();
      endConnection();
    };
  }, [refreshEntitlement, validateWithBackend]);

  // ── Initiate a purchase ─────────────────────────────────────────────────────
  const purchase = useCallback(async (productId) => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      // requestPurchase triggers the native purchase sheet (StoreKit 2 / Play Billing)
      await requestPurchase({ sku: productId });
      // Completion is handled by purchaseUpdatedListener above
    } catch (e) {
      if (e instanceof PurchaseError && e.code === 'E_USER_CANCELLED') {
        setPurchasing(false);
        return;
      }
      Alert.alert('Purchase Failed', e.message || 'Could not initiate purchase.');
      setPurchasing(false);
    }
  }, [purchasing]);

  return { products, purchasing, entitlement, initError, purchase, refreshEntitlement };
}
