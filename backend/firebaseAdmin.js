// StuntCock — Firebase Admin SDK singleton initialiser
// Initialises once and exports the admin instance for use by auth middleware and Firestore.

const admin = require('firebase-admin');

if (!admin.apps.length) {
  // Uses GOOGLE_APPLICATION_CREDENTIALS env var (file path) or ADC (Workload Identity on Cloud Run)
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

module.exports = admin;
