// api.js — HTTP client for StuntCock backend
// API_BASE and WS_URL are injected via EAS environment config (EXPO_PUBLIC_* are inlined by Metro at build time)
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:3001';
export const WS_URL = (() => {
  const base = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:3001';
  // Upgrade http → wss, https → wss; if already ws/wss honour it
  return base
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'wss://');
})();

// ─── Token provider — injected by useAuth after Firebase sign-in ──────────────
// Holds { getIdToken: () => Promise<string>, refreshIdToken: () => Promise<string> }
let _tokenProvider = null;

/** Called by useAuth once Firebase is ready. */
export function setTokenProvider(provider) {
  _tokenProvider = provider;
}

// ─── Core request helper ──────────────────────────────────────────────────────

/**
 * @param {string} path
 * @param {RequestInit & { body?: object }} opts
 * @param {boolean} [_isRetry] — internal flag; true on the second attempt after a 401
 */
async function req(path, opts = {}, _isRetry = false) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };

  // Attach Firebase ID token as Bearer on every request
  if (_tokenProvider) {
    try {
      const token = await _tokenProvider.getIdToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // If we can't get a token, proceed without — server will reject if auth required
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  // 401 → force-refresh the Firebase ID token and retry once
  if (res.status === 401 && !_isRetry && _tokenProvider) {
    try {
      await _tokenProvider.refreshIdToken();
    } catch {
      throw new Error('401 Unauthorized — token refresh failed');
    }
    return req(path, opts, true);
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  // Settings
  getSettings: () => req('/api/settings'),
  setSetting: (key, value) => req('/api/settings', { method: 'POST', body: { key, value } }),
  bulkSettings: (kv) => req('/api/settings/bulk', { method: 'POST', body: kv }),

  // Rules
  getRules: () => req('/api/rules'),
  createRule: (data) => req('/api/rules', { method: 'POST', body: data }),
  updateRule: (id, data) => req(`/api/rules/${id}`, { method: 'PUT', body: data }),
  deleteRule: (id) => req(`/api/rules/${id}`, { method: 'DELETE' }),
  reorderRules: (ids) => req('/api/rules/reorder', { method: 'POST', body: { ids } }),

  // Messages
  getMessages: (limit = 50) => req(`/api/messages?limit=${limit}`),

  // Analytics
  getAnalytics: (days = 7) => req(`/api/analytics?days=${days}`),

  // Contacts
  getContacts: () => req('/api/contacts'),
  setContactName: (sender, name) =>
    req(`/api/contacts/${encodeURIComponent(sender)}/name`, { method: 'PUT', body: { name } }),

  // Signal
  getSignalStatus: () => req('/api/signal/status'),
  enableSignal: () => req('/api/signal/enable', { method: 'POST' }),
  disableSignal: () => req('/api/signal/disable', { method: 'POST' }),

  // WhatsApp
  getWhatsappStatus: () => req('/api/whatsapp/status'),
  enableWhatsapp: () => req('/api/whatsapp/enable', { method: 'POST' }),
  disableWhatsapp: () => req('/api/whatsapp/disable', { method: 'POST' }),

  // Personas
  getPersonas: () => req('/api/personas'),
  getPersonaGroups: () => req('/api/personas/groups'),
  createPersona: (data) => req('/api/personas', { method: 'POST', body: data }),
  updatePersona: (id, data) => req(`/api/personas/${id}`, { method: 'PUT', body: data }),
  deletePersona: (id) => req(`/api/personas/${id}`, { method: 'DELETE' }),
  generatePersonaPrompt: (name, description) =>
    req('/api/personas/generate', { method: 'POST', body: { name, description } }),

  // Health
  health: () => req('/api/health'),
};
