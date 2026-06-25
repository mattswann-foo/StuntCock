// AuthScreen.jsx — Google OAuth + Apple Sign-In UI, Firebase credential exchange
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Platform,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';

WebBrowser.maybeCompleteAuthSession();

// ─── Google OAuth client IDs — injected via EAS environment config ────────────
// Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, and
// EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in eas.json → build → <profile> → env
const GOOGLE_IDS = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};
// ─────────────────────────────────────────────────────────────────────────────

// For Expo Go: redirect URI is https://auth.expo.io/@mswann/stuntcock
// For standalone builds: stuntcock://auth
const redirectUri = makeRedirectUri({ scheme: 'stuntcock', path: 'auth' });

/**
 * AuthScreen props:
 *   onSignInGoogle(accessToken: string) — called with Google OAuth access token
 *   onSignInApple(identityToken: string, nonce: string) — called with Apple identity token + raw nonce
 */
export default function AuthScreen({ onSignInGoogle, onSignInApple }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [, googleResponse, googlePrompt] = Google.useAuthRequest(
    {
      iosClientId: GOOGLE_IDS.ios,
      androidClientId: GOOGLE_IDS.android,
      webClientId: GOOGLE_IDS.web,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
    },
  );

  React.useEffect(() => {
    if (googleResponse?.type === 'success') {
      handleGoogleSuccess(googleResponse.authentication.accessToken);
    } else if (googleResponse?.type === 'error') {
      setError('Google sign-in failed. Try again.');
    }
  }, [googleResponse]);

  async function handleGoogleSuccess(accessToken) {
    setLoading(true);
    setError(null);
    try {
      await onSignInGoogle(accessToken);
    } catch {
      setError('Google sign-in failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setLoading(true);
    setError(null);
    try {
      // Generate a cryptographic nonce — required for Apple + Firebase security
      const rawNonce = Array.from(
        await Crypto.getRandomBytesAsync(32),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('');
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      await onSignInApple(credential.identityToken, rawNonce);
    } catch (e) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        setError('Apple sign-in failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  const googleConfigured = !!(GOOGLE_IDS.web && !GOOGLE_IDS.web.startsWith('YOUR_'));

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>🐓</Text>
        <Text style={styles.title}>StuntCock</Text>
        <Text style={styles.subtitle}>Auto-responder for Signal & WhatsApp</Text>
      </View>

      <View style={styles.authBox}>
        <Text style={styles.authTitle}>Sign in to continue</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator size="large" color="#3a86ff" style={{ marginVertical: 20 }} />
        ) : (
          <>
            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={styles.appleBtn}
                onPress={handleApple}
              />
            )}

            <Pressable
              style={[styles.googleBtn, !googleConfigured && styles.googleBtnDisabled]}
              onPress={() => {
                if (!googleConfigured) {
                  setError('Google client IDs not configured — set EXPO_PUBLIC_GOOGLE_*_CLIENT_ID in eas.json');
                  return;
                }
                googlePrompt();
              }}
            >
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleBtnText}>Sign in with Google</Text>
            </Pressable>
          </>
        )}
      </View>

      <Text style={styles.footer}>
        Your messages never leave your device.{'\n'}
        Sign-in is only used to identify you.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0f0f0f',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  hero: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 72, marginBottom: 12 },
  title: { color: '#e0e0e0', fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: '#6c757d', fontSize: 14, marginTop: 6, textAlign: 'center' },
  authBox: {
    width: '100%', backgroundColor: '#1a1a2e',
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: '#2d2d4e',
    alignItems: 'center', gap: 14,
  },
  authTitle: { color: '#adb5bd', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  error: { color: '#f72585', fontSize: 13, textAlign: 'center' },
  appleBtn: { width: '100%', height: 50 },
  googleBtn: {
    width: '100%', height: 50, backgroundColor: '#fff',
    borderRadius: 12, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  googleBtnDisabled: { opacity: 0.5 },
  googleIcon: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  googleBtnText: { color: '#1f1f1f', fontWeight: '600', fontSize: 15 },
  footer: {
    color: '#495057', fontSize: 12, textAlign: 'center', marginTop: 32, lineHeight: 18,
  },
});
