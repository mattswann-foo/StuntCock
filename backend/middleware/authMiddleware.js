// StuntCock — Firebase JWT authentication middleware
// Verifies Firebase ID tokens on all /api/* routes (except /api/health).
// Sets req.uid on success; returns 401 on missing or invalid token.

const admin = require('../firebaseAdmin');

/**
 * Express middleware that verifies a Firebase ID token from the
 * Authorization: Bearer <token> header.
 *
 * On success: sets req.uid = decodedToken.uid and calls next().
 * On failure: responds 401 { error: 'Unauthorized' }.
 *
 * /api/health is exempted to allow unauthenticated liveness checks.
 */
async function authMiddleware(req, res, next) {
  // Exempt health check from auth.
  // When mounted as app.use('/api', authMiddleware), req.path is relative
  // to the mount point (e.g. '/health' not '/api/health').
  if (req.path === '/health' || req.path === '/api/health') return next();

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.uid = decoded.uid;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = authMiddleware;
