// StuntCock — minimal auth middleware
// Reads the Bearer token from the Authorization header and sets req.userId.
// The token IS the userId — callers are responsible for issuing opaque,
// sufficiently-random tokens in production; this module only parses them.

'use strict';

/**
 * Express middleware.
 * Sets req.userId from the Bearer token in the Authorization header.
 * Returns 401 if the header is missing or malformed.
 */
function requireUserId(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return res.status(401).json({ error: 'Authorization header with Bearer token required' });
  }
  req.userId = match[1].trim();
  next();
}

module.exports = { requireUserId };
