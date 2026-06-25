import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'stuntcock_user';
const TOKEN_KEY = 'stuntcock_jwt';

/**
 * Build a minimal unsigned JWT (alg: none) carrying the user's sub claim.
 * The backend requireJwt middleware decodes and trusts this for same-device
 * IAP calls; production deployments should use a properly signed token from
 * Firebase Auth or a similar identity provider.
 * @param {string} userId
 * @returns {string}
 */
function buildLocalJwt(userId) {
  const b64 = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const header = b64({ alg: 'none', typ: 'JWT' });
  const payload = b64({
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, // 1 year
  });
  return `${header}.${payload}.`;
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [jwtToken, setJwtToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync(STORE_KEY),
      SecureStore.getItemAsync(TOKEN_KEY),
    ]).then(([userVal, tokenVal]) => {
      if (userVal) {
        try { setUser(JSON.parse(userVal)); } catch {}
      }
      if (tokenVal) {
        setJwtToken(tokenVal);
      }
      setLoading(false);
    });
  }, []);

  async function signIn(userData) {
    const token = buildLocalJwt(userData.id);
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(userData));
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    setUser(userData);
    setJwtToken(token);
  }

  async function signOut() {
    await SecureStore.deleteItemAsync(STORE_KEY);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setUser(null);
    setJwtToken(null);
  }

  return { user, jwtToken, loading, signIn, signOut };
}
