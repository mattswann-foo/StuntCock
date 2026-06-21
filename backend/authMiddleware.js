// StuntCock — Optional token authentication middleware
// When API_TOKEN env var is set, enforces X-StuntCock-Token header on protected routes.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * Express middleware that enforces an optional bearer token check.
 *
 * Behaviour:
 *   - When `API_TOKEN` is NOT set in the environment, this is a no-op: `next()` is called
 *     unconditionally for every request.
 *   - When `API_TOKEN` IS set, the request must include the header
 *     `X-StuntCock-Token: <token>` whose value matches `API_TOKEN` exactly.
 *     If the header is missing or wrong, responds with HTTP 401 `{ error: "Unauthorized" }`.
 *
 * Apply to all `/api/*` routes EXCEPT `/api/health` (which must remain unauthenticated for
 * liveness probes).
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAuth(req, res, next) {
  const token = process.env.API_TOKEN;

  // No token configured — middleware is a no-op
  if (!token) {
    return next();
  }

  const provided = req.headers['x-stuntcock-token'];
  if (provided === token) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { requireAuth };
