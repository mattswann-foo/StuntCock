// StuntCock — Structured logging + PII-redaction middleware
// Emits one JSON log line per request to stdout.
// Cloud Run / Cloud Logging ingests stdout automatically.
// PII fields (email, phone_number, anthropic_api_key, payment fields) are
// redacted before any logging occurs.

// PII field names to redact from request/response bodies (case-insensitive).
const PII_FIELDS = new Set([
  'email',
  'phone_number',
  'anthropic_api_key',
  'card_number',
  'cvv',
  'ssn',
  'password',
  'credit_card',
  'payment',
  'billing',
]);

/**
 * Recursively redact PII fields from an object, returning a safe copy.
 * Non-object values are returned as-is.
 * @param {*} obj
 * @returns {*}
 */
function redactPII(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactPII);

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_FIELDS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactPII(v);
    }
  }
  return out;
}

/**
 * Extract the Cloud Trace trace ID from the X-Cloud-Trace-Context header.
 * Header format: TRACE_ID/SPAN_ID;o=TRACE_TRUE
 * Returns the traceId string, or a fallback uuid if header is absent.
 * @param {import('express').Request} req
 * @returns {string}
 */
function extractTraceId(req) {
  const header = req.headers['x-cloud-trace-context'];
  if (header) {
    return header.split('/')[0];
  }
  // Fall back to any x-request-id the caller supplies
  return req.headers['x-request-id'] || require('crypto').randomUUID();
}

/**
 * Express middleware that logs a structured JSON line to stdout after
 * each response is finished.
 *
 * Log line fields:
 *   severity, timestamp, method, path, status, durationMs, traceId, userId
 *
 * Does NOT log: email, phone_number, anthropic_api_key, payment fields.
 */
function loggingMiddleware(req, res, next) {
  const startMs = Date.now();
  const traceId = extractTraceId(req);

  res.on('finish', () => {
    const durationMs = Date.now() - startMs;
    const userId = req.uid || null;
    const status = res.statusCode;

    const logLine = {
      severity: status >= 500 ? 'ERROR' : status >= 400 ? 'WARNING' : 'INFO',
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status,
      durationMs,
      traceId,
      userId,
    };

    // Output as single-line JSON so Cloud Logging parses it correctly.
    process.stdout.write(JSON.stringify(logLine) + '\n');
  });

  next();
}

module.exports = { loggingMiddleware, redactPII };
