import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const API    = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const WS_URL = import.meta.env.VITE_WS_URL  || 'ws://localhost:3001';

/**
 * Returns auth headers for fetch calls.
 *
 * Priority:
 *  1. Firebase ID token (Authorization: Bearer <token>) — used when a Firebase
 *     user is signed in.  getIdToken() refreshes the token automatically before
 *     expiry (Firebase SDK handles this — no manual refresh needed).
 *  2. Legacy X-StuntCock-Token from localStorage — kept for backward compat
 *     with self-hosted deployments that haven't enabled Firebase Auth.
 *
 * This is a *sync* helper that returns whatever is already cached.
 * For calls where you need a guaranteed-fresh token use `getAuthHeadersAsync()`.
 *
 * @returns {{ 'Authorization': string } | { 'X-StuntCock-Token': string } | {}}
 */
export function getAuthHeaders() {
  // Try legacy localStorage token first (kept for backwards compat)
  const legacyToken = localStorage.getItem('stuntcock_api_token');
  if (legacyToken && legacyToken.trim() !== '') {
    return { 'X-StuntCock-Token': legacyToken };
  }
  return {};
}

/**
 * Async variant — always returns the freshest Firebase ID token available.
 * Falls back to legacy localStorage token, then empty object.
 *
 * Use this for any mutating / sensitive request.
 *
 * @returns {Promise<{ 'Authorization': string } | { 'X-StuntCock-Token': string } | {}>}
 */
export async function getAuthHeadersAsync() {
  // Lazy import to avoid circular dep during module initialisation
  try {
    const { getIdToken } = await import('./firebase.js');
    const token = await getIdToken();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Firebase not configured / user not signed in — fall through
  }

  // Fall back to legacy static token
  const legacyToken = localStorage.getItem('stuntcock_api_token');
  if (legacyToken && legacyToken.trim() !== '') {
    return { 'X-StuntCock-Token': legacyToken };
  }

  return {};
}
