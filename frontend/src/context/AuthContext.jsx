// StuntCock — Firebase Auth context
// Provides the current Firebase user to all child components and exposes
// sign-in / sign-out helpers.  The SDK handles automatic token refresh.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, onAuthStateChanged } from '../lib/firebase.js';

const AuthContext = createContext(null);

/**
 * Wraps the app so every component can call `useAuth()`.
 */
export function AuthProvider({ children }) {
  // null  = still loading; false = unauthenticated; object = Firebase User
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? false);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Returns `{ user, loading }` from the nearest AuthProvider.
 * `user` is a Firebase User object when signed in, or `false` when not.
 * `loading` is true during the initial auth-state resolution.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth() must be used inside <AuthProvider>');
  }
  return ctx;
}
