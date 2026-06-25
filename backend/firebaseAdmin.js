// StuntCock — Firebase Admin SDK singleton initialiser
// Initialises once and exports the admin instance for use by auth middleware and Firestore.

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? admin.credential.applicationDefault()
    : admin.credential.applicationDefault();

  admin.initializeApp({ credential });
}

module.exports = admin;
