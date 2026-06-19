import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'stuntcock_user';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY).then(val => {
      if (val) {
        try { setUser(JSON.parse(val)); } catch {}
      }
      setLoading(false);
    });
  }, []);

  async function signIn(userData) {
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(userData));
    setUser(userData);
  }

  async function signOut() {
    await SecureStore.deleteItemAsync(STORE_KEY);
    setUser(null);
  }

  return { user, loading, signIn, signOut };
}
