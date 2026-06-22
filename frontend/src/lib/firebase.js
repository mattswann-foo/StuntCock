// StuntCock — Firebase SDK initialisation
// All config values come from Vite env variables (VITE_FIREBASE_*).
// Set these in .env.local for dev, or .env.production for production builds.
// NEVER hardcode values here.

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Guard: warn clearly when config is missing (dev-time only, not leaked to prod)
if (import.meta.env.DEV && !firebaseConfig.apiKey) {
  console.warn(
    '[StuntCock] Firebase env vars are not set.\n' +
    'Create frontend/.env.local and populate VITE_FIREBASE_* variables.\n' +
    'See frontend/.env.example for the required keys.',
  );
}

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Sign in with Google via popup.
 * Returns the Firebase UserCredential.
 */
export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

/**
 * Sign in with email + password.
 */
export async function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Create a new account with email + password.
 */
export async function createAccountWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Sign the current user out.
 */
export async function signOut() {
  return firebaseSignOut(auth);
}

/**
 * Returns the current user's Firebase ID token, refreshing it if needed.
 * Returns null when no user is signed in.
 */
export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(/* forceRefresh */ false);
}

export { onAuthStateChanged };
