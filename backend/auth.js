// StuntCock — Firebase ID token verification middleware
// Reads FIREBASE_SERVICE_ACCOUNT_JSON from env and initialises firebase-admin.
// Every protected route must use verifyFirebaseToken as middleware.

const admin = require('firebase-admin');

let _initialised = false;

function initFirebase() {
  if (_initialised) return;
  _initialised = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.warn(
      '[StuntCock] FIREBASE_SERVICE_ACCOUNT_JSON is not set — ' +
      'Firebase auth will reject all requests.'
    );
    // Leave firebase-admin uninitialised; verifyFirebaseToken will return 401.
    return;
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      '[StuntCock] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ' + e.message
    );
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}

// Call once at module load so firebase-admin is ready before any request.
initFirebase();

/**
 * Express middleware.
 * Expects:  Authorization: Bearer <Firebase ID token>
 * On success: sets req.userId to the token's uid and calls next().
 * On failure: responds 401 { error: "INVALID_TOKEN" }.
 */
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }

  const idToken = match[1];

  // If firebase-admin was never initialised (missing env var) treat as invalid.
  if (!admin.apps.length) {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.userId = decoded.uid;
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}

module.exports = { verifyFirebaseToken };
