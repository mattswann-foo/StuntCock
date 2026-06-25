// useAuth.js — Firebase-backed authentication hook
// Manages Google OAuth, Apple Sign-In → Firebase ID tokens stored in expo-secure-store
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { setTokenProvider } from './api';

// ─── Firebase project config (values injected at build time via EAS env vars) ─
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialise Firebase once — guard against hot-reload double-init
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(firebaseApp);

// SecureStore key for persisting the serialised user profile (NOT the raw token —
// the Firebase SDK manages token persistence internally via its own cache)
const STORE_KEY = 'stuntcock_user_v2';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Register the token provider with the API client so every request gets
    // Authorization: Bearer <firebase_id_token>
    setTokenProvider({
      getIdToken: async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) return null;
        return currentUser.getIdToken(false);
      },
      refreshIdToken: async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('No authenticated user');
        return currentUser.getIdToken(true); // forceRefresh: true
      },
    });

    // Restore cached user profile from SecureStore on app start
    SecureStore.getItemAsync(STORE_KEY).then(val => {
      if (val) {
        try { setUser(JSON.parse(val)); } catch {}
      }
    });

    // Listen for Firebase auth state changes; update user profile accordingly
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const profile = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || 'User',
          email: firebaseUser.email,
          picture: firebaseUser.photoURL,
          provider: firebaseUser.providerData[0]?.providerId || 'unknown',
        };
        await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(profile));
        setUser(profile);
      } else {
        await SecureStore.deleteItemAsync(STORE_KEY);
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  /**
   * Sign in with a Google access token obtained from expo-auth-session.
   * Exchanges it for a Firebase credential, completing OAuth with Firebase Auth.
   * The Firebase ID token is then available via auth.currentUser.getIdToken().
   * @param {string} accessToken — Google OAuth access token
   */
  async function signInWithGoogle(accessToken) {
    const credential = GoogleAuthProvider.credential(null, accessToken);
    await signInWithCredential(auth, credential);
    // onAuthStateChanged will update user state + SecureStore
  }

  /**
   * Sign in with Apple identity token obtained from expo-apple-authentication.
   * Exchanges it for a Firebase credential.
   * @param {string} identityToken — Apple identity token (JWT)
   * @param {string} nonce — raw nonce used during Apple sign-in request
   */
  async function signInWithApple(identityToken, nonce) {
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({ idToken: identityToken, rawNonce: nonce });
    await signInWithCredential(auth, credential);
    // onAuthStateChanged will update user state + SecureStore
  }

  async function signOut() {
    await firebaseSignOut(auth);
    // onAuthStateChanged → null → clears SecureStore + sets user to null
  }

  return { user, loading, signInWithGoogle, signInWithApple, signOut };
}
