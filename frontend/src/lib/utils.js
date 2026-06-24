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

export const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

/**
 * Returns auth headers for fetch calls.
 * Reads `stuntcock_api_token` from localStorage; returns the X-API-Token header
 * when a non-empty value is stored, or an empty object when absent.
 * @returns {{ 'X-API-Token': string } | {}}
 */
export function getAuthHeaders() {
  const token = localStorage.getItem('stuntcock_api_token');
  if (token && token.trim() !== '') {
    return { 'X-API-Token': token };
  }
  return {};
}
