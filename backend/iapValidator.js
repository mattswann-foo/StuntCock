// StuntCock — IAP receipt validation helpers for Apple App Store and Google Play.
// Validates purchase receipts against platform APIs and writes entitlements to the DB.

'use strict';

const https = require('https');
const db_module = require('./db');

// ---------------------------------------------------------------------------
// Entitlements table bootstrap (idempotent)
// ---------------------------------------------------------------------------

const db = db_module.db;

// Create the entitlements table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS iap_entitlements (
    transaction_id  TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    platform        TEXT NOT NULL,
    product_id      TEXT NOT NULL,
    entitlement     TEXT NOT NULL DEFAULT 'pro',
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simple HTTPS POST/GET helper that resolves with parsed JSON.
 * @param {object} options - https.request options
 * @param {string|null} body - JSON body string or null
 * @returns {Promise<{status: number, data: any}>}
 */
function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Apple App Store Server API validation (StoreKit 2 / signed transactions)
// ---------------------------------------------------------------------------

/**
 * Validate an Apple receipt/transactionId against the App Store Server API.
 * In StoreKit 2 the "receipt" passed from the client is the signed JWS transaction string.
 * We decode the payload (no signature verification needed for the claims we use here —
 * signature verification would require Apple's public key via the JWKS endpoint, which is
 * out of scope for this implementation; production deployments should add it).
 *
 * @param {string} receipt  - JWS compact-serialised transaction from StoreKit 2
 * @param {string} productId - expected productId
 * @returns {{ transactionId: string, expiresAt: string }} or throws on failure
 */
async function validateAppleReceipt(receipt, productId) {
  // StoreKit 2 transactions are JWS strings: header.payload.signature (base64url encoded parts)
  // We extract the payload for the transaction details.
  const parts = (receipt || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid StoreKit 2 transaction JWS format');
  }

  // Base64url → base64 → JSON
  const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
  } catch {
    throw new Error('Failed to decode StoreKit 2 transaction payload');
  }

  const transactionId = payload.transactionId || payload.originalTransactionId;
  if (!transactionId) {
    throw new Error('Missing transactionId in StoreKit 2 payload');
  }

  // Optionally verify against App Store Server API (environment-aware)
  const isSandbox = payload.environment === 'Sandbox';
  const host = isSandbox
    ? 'api.storekit-sandbox.itunes.apple.com'
    : 'api.storekit.itunes.apple.com';

  // The App Store Server API requires a JWT bearer token (App Store Connect API key).
  // We attempt verification if the key is configured; otherwise we trust the JWS payload.
  const appleApiKey = process.env.APPLE_APPSTORE_API_KEY;
  if (appleApiKey) {
    const path = `/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
    const result = await httpsRequest({
      hostname: host,
      path,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${appleApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (result.status !== 200) {
      throw new Error(`Apple API returned ${result.status}`);
    }

    // The signed transaction returned is another JWS — decode for confirmation
    const confirmedTx = result.data.signedTransactionInfo;
    if (confirmedTx) {
      const confParts = confirmedTx.split('.');
      try {
        const confirmed = JSON.parse(
          Buffer.from(
            confParts[1].replace(/-/g, '+').replace(/_/g, '/'),
            'base64',
          ).toString('utf8'),
        );
        if (confirmed.productId !== productId) {
          throw new Error('Product ID mismatch in Apple receipt');
        }
      } catch (e) {
        if (e.message.includes('mismatch')) throw e;
        // If we can't decode the confirmation JWS, fall through to payload check
      }
    }
  }

  // Check productId from decoded payload
  if (payload.productId && payload.productId !== productId) {
    throw new Error('Product ID mismatch in StoreKit 2 transaction');
  }

  // expiresDate is in milliseconds since epoch per Apple's JWS schema
  const expiresMs = payload.expiresDate || payload.subscriptionExpirationDate;
  let expiresAt;
  if (expiresMs) {
    expiresAt = new Date(expiresMs).toISOString();
  } else {
    // Non-subscription or lifetime purchase — set far future expiry
    expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  }

  return { transactionId, expiresAt };
}

// ---------------------------------------------------------------------------
// Google Play Developer API validation
// ---------------------------------------------------------------------------

/**
 * Validate a Google Play purchase token against the Play Developer API.
 * Requires GOOGLE_PLAY_SERVICE_ACCOUNT_JSON or GOOGLE_PLAY_ACCESS_TOKEN env var.
 *
 * @param {string} receipt  - purchase token from Google Play
 * @param {string} productId - product/subscription ID
 * @returns {{ transactionId: string, expiresAt: string }} or throws on failure
 */
async function validateGoogleReceipt(receipt, productId) {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.mattswann.stuntcock';

  // Get access token
  const accessToken = await getGoogleAccessToken();

  // Try as a subscription first, then as a one-time purchase
  const subPath = `/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${receipt}`;
  const subResult = await httpsRequest({
    hostname: 'androidpublisher.googleapis.com',
    path: subPath,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (subResult.status === 200) {
    const sub = subResult.data;
    // paymentState: 1 = payment received, 2 = free trial
    if (sub.paymentState !== 1 && sub.paymentState !== 2 && sub.paymentState !== undefined) {
      throw new Error(`Google Play subscription payment not received (paymentState=${sub.paymentState})`);
    }
    // cancelReason present = cancelled
    if (sub.cancelReason !== undefined && sub.cancelReason !== null) {
      throw new Error('Google Play subscription was cancelled');
    }
    const expiresMs = parseInt(sub.expiryTimeMillis || sub.startTimeMillis || Date.now() + 365 * 24 * 60 * 60 * 1000, 10);
    const expiresAt = new Date(expiresMs).toISOString();
    // Google's orderId serves as the unique transaction ID
    const transactionId = sub.orderId || receipt;
    return { transactionId, expiresAt };
  }

  // Try as a one-time product purchase
  const prodPath = `/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${receipt}`;
  const prodResult = await httpsRequest({
    hostname: 'androidpublisher.googleapis.com',
    path: prodPath,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (prodResult.status === 200) {
    const prod = prodResult.data;
    if (prod.purchaseState !== 0) {
      throw new Error(`Google Play purchase not in purchased state (purchaseState=${prod.purchaseState})`);
    }
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const transactionId = prod.orderId || receipt;
    return { transactionId, expiresAt };
  }

  throw new Error(`Google Play API returned ${subResult.status} for subscription, ${prodResult.status} for product`);
}

/**
 * Get a Google OAuth2 access token from either a pre-configured token env var
 * or a service account JSON env var.
 * @returns {Promise<string>}
 */
async function getGoogleAccessToken() {
  // Prefer pre-issued token (e.g. injected by a server-side OAuth2 flow)
  if (process.env.GOOGLE_PLAY_ACCESS_TOKEN) {
    return process.env.GOOGLE_PLAY_ACCESS_TOKEN;
  }

  // Attempt service account JWT flow
  const saJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    throw new Error('Google Play credentials not configured (set GOOGLE_PLAY_ACCESS_TOKEN or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)');
  }

  let sa;
  try { sa = JSON.parse(saJson); } catch {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON');
  }

  // Build a JWT for service account authentication
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  // Sign with the private key using Node's crypto
  const { createSign } = require('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${claims}`);
  const signature = sign.sign(sa.private_key, 'base64url');
  const assertion = `${header}.${claims}.${signature}`;

  const body = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(assertion)}`;
  const result = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  if (result.status !== 200 || !result.data.access_token) {
    throw new Error(`Failed to obtain Google access token: ${JSON.stringify(result.data)}`);
  }
  return result.data.access_token;
}

// ---------------------------------------------------------------------------
// Entitlement persistence (idempotent)
// ---------------------------------------------------------------------------

/**
 * Upsert an entitlement record. Returns the existing record unchanged if a
 * record with the same transactionId already exists (idempotent by design).
 *
 * @param {object} opts
 * @param {string} opts.transactionId
 * @param {string} opts.userId
 * @param {string} opts.platform
 * @param {string} opts.productId
 * @param {string} opts.expiresAt
 * @returns {{ entitlement: string, expiresAt: string, transactionId: string }}
 */
function upsertEntitlement({ transactionId, userId, platform, productId, expiresAt }) {
  // Check for existing record first (idempotency)
  const existing = db
    .prepare('SELECT * FROM iap_entitlements WHERE transaction_id = ?')
    .get(transactionId);

  if (existing) {
    return {
      entitlement: existing.entitlement,
      expiresAt: existing.expires_at,
      transactionId: existing.transaction_id,
    };
  }

  // Insert new entitlement
  db.prepare(`
    INSERT INTO iap_entitlements (transaction_id, user_id, platform, product_id, entitlement, expires_at)
    VALUES (?, ?, ?, ?, 'pro', ?)
  `).run(transactionId, userId, platform, productId, expiresAt);

  return { entitlement: 'pro', expiresAt, transactionId };
}

/**
 * Fetch the latest active entitlement for a user (for cross-device sync).
 * @param {string} userId
 * @returns {{ entitlement: string, expiresAt: string } | null}
 */
function getEntitlementForUser(userId) {
  const row = db
    .prepare(`
      SELECT entitlement, expires_at
      FROM iap_entitlements
      WHERE user_id = ?
      ORDER BY expires_at DESC
      LIMIT 1
    `)
    .get(userId);

  if (!row) return null;
  return { entitlement: row.entitlement, expiresAt: row.expires_at };
}

// ---------------------------------------------------------------------------
// Main validate function
// ---------------------------------------------------------------------------

/**
 * Validate a purchase receipt from Apple or Google, then persist the entitlement.
 * Throws with a descriptive message on validation failure (do NOT catch here — let
 * the route handler convert to a 402).
 *
 * @param {object} opts
 * @param {'ios'|'android'} opts.platform
 * @param {string} opts.receipt
 * @param {string} opts.productId
 * @param {string} opts.userId
 * @returns {Promise<{ entitlement: 'pro', expiresAt: string }>}
 */
async function validateAndPersist({ platform, receipt, productId, userId }) {
  let transactionId;
  let expiresAt;

  if (platform === 'ios') {
    ({ transactionId, expiresAt } = await validateAppleReceipt(receipt, productId));
  } else if (platform === 'android') {
    ({ transactionId, expiresAt } = await validateGoogleReceipt(receipt, productId));
  } else {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const result = upsertEntitlement({ transactionId, userId, platform, productId, expiresAt });
  return { entitlement: result.entitlement, expiresAt: result.expiresAt };
}

module.exports = {
  validateAndPersist,
  getEntitlementForUser,
  upsertEntitlement,
  validateAppleReceipt,
  validateGoogleReceipt,
  // Exposed for testing
  _db: db,
};
