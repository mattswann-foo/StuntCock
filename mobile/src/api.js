// Change to your machine's LAN IP when running on a real device
// iOS Simulator: localhost works. Android emulator: use 10.0.2.2
export const API_BASE = 'http://192.168.1.134:3001';
export const WS_URL = 'ws://192.168.1.134:3001';

async function req(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
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

  // IAP — In-App Purchase validation & entitlement
  // These calls require an Authorization: Bearer <jwt> header.
  validateIAPReceipt: (jwtToken, { platform, receipt, productId }) =>
    req('/api/iap/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwtToken}` },
      body: { platform, receipt, productId },
    }),
  getIAPEntitlement: (jwtToken) =>
    req('/api/iap/entitlement', {
      headers: { Authorization: `Bearer ${jwtToken}` },
    }),
};
