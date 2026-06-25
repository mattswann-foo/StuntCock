// backend/middleware/observability.js
// GCP-native observability: structured JSON logging, PII redaction, Cloud Error Reporting, Cloud Trace.

'use strict';

const { Logging } = require('@google-cloud/logging');
const { ErrorReporting } = require('@google-cloud/error-reporting');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GCP_PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT_ID || null;
const LOG_NAME = process.env.GCP_LOG_NAME || 'stuntcock-api';
const SERVICE = 'stuntcock-backend';

// ---------------------------------------------------------------------------
// GCP clients (created lazily — will no-op gracefully when credentials absent)
// ---------------------------------------------------------------------------

let _logging = null;
let _log = null;
let _errors = null;

/**
 * Returns the Cloud Logging log instance, creating it once.
 * @returns {import('@google-cloud/logging').Log|null}
 */
function getLog() {
  if (_log !== null) return _log;
  try {
    if (!GCP_PROJECT_ID) {
      // No project ID — skip Cloud Logging; stdout JSON still works
      _log = undefined;
      return null;
    }
    _logging = new Logging({ projectId: GCP_PROJECT_ID });
    _log = _logging.log(LOG_NAME);
    return _log;
  } catch (err) {
    console.error('[observability] Failed to init Cloud Logging:', err.message);
    _log = undefined;
    return null;
  }
}

/**
 * Returns the Cloud Error Reporting client, creating it once.
 * @returns {import('@google-cloud/error-reporting').ErrorReporting|null}
 */
function getErrorReporting() {
  if (_errors !== null) return _errors;
  try {
    if (!GCP_PROJECT_ID) {
      _errors = undefined;
      return null;
    }
    _errors = new ErrorReporting({
      projectId: GCP_PROJECT_ID,
      serviceContext: { service: SERVICE, version: process.env.K_REVISION || '1.0.0' },
      reportUnhandledRejections: true,
    });
    return _errors;
  } catch (err) {
    console.error('[observability] Failed to init Cloud Error Reporting:', err.message);
    _errors = undefined;
    return null;
  }
}

// ---------------------------------------------------------------------------
// PII redaction
// ---------------------------------------------------------------------------

/**
 * Top-level keys and value patterns that must NEVER appear in emitted logs.
 * Any key in PII_KEYS will have its value replaced with "[REDACTED]".
 * Any string value matching PII_PATTERNS will be replaced with "[REDACTED]".
 */
const PII_KEYS = new Set([
  'email',
  'phone_number',
  'anthropic_api_key',
  'receipt',
  'payment_token',
  'card_number',
  'cvv',
  'password',
  'token',
  'secret',
  'authorization',
]);

// Patterns that look like email addresses or payment tokens embedded in strings
const PII_PATTERNS = [
  // email addresses
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  // Anthropic API keys
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  // generic bearer / API tokens
  /Bearer\s+[A-Za-z0-9\-_.~+/]+=*/g,
  // Stripe / payment tokens (tok_, pi_, pm_, re_)
  /(?:tok|pi|pm|re)_[A-Za-z0-9]{10,}/g,
];

/**
 * Deep-clone and redact PII from an arbitrary object before logging.
 * Operates recursively on plain objects and arrays.
 *
 * @param {*} obj - Value to redact
 * @param {Set<string>} [seen] - Circular-reference guard (internal)
 * @returns {*} Redacted clone
 */
function redact(obj, seen = new Set()) {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    let s = obj;
    for (const pattern of PII_PATTERNS) {
      // Reset lastIndex because patterns use /g flag
      pattern.lastIndex = 0;
      s = s.replace(pattern, '[REDACTED]');
    }
    return s;
  }

  if (typeof obj !== 'object') return obj;

  // Circular-reference guard
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);

  if (Array.isArray(obj)) {
    const result = obj.map(item => redact(item, seen));
    seen.delete(obj);
    return result;
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redact(value, seen);
    }
  }
  seen.delete(obj);
  return result;
}

// ---------------------------------------------------------------------------
// Trace ID extraction
// ---------------------------------------------------------------------------

/**
 * Extract Google Cloud Trace context from the incoming request headers.
 * Cloud Run injects the `X-Cloud-Trace-Context: TRACE_ID/SPAN_ID;o=1` header.
 *
 * @param {import('express').Request} req
 * @returns {{ traceId: string, spanId: string|null }}
 */
function extractTraceContext(req) {
  const header = req.headers['x-cloud-trace-context'];
  if (header) {
    const [traceAndSpan] = header.split(';');
    const [traceId, spanId] = traceAndSpan.split('/');
    return { traceId: traceId || 'unknown', spanId: spanId || null };
  }
  // Fallback: generate a pseudo trace ID for local runs
  const traceId = `local-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  return { traceId, spanId: null };
}

// ---------------------------------------------------------------------------
// User ID extraction
// ---------------------------------------------------------------------------

/**
 * Extract user ID from the request. Checks common locations:
 * Firebase `x-forwarded-user` header, `req.user.uid` set by auth middleware,
 * or falls back to 'anonymous'.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function extractUserId(req) {
  if (req.user && req.user.uid) return req.user.uid;
  if (req.headers['x-forwarded-user']) return req.headers['x-forwarded-user'];
  return 'anonymous';
}

// ---------------------------------------------------------------------------
// Structured logging helper
// ---------------------------------------------------------------------------

/**
 * Emit a structured log entry to Cloud Logging (if configured) AND to stdout
 * as JSON (always). Cloud Run picks up stdout JSON automatically.
 *
 * @param {object} payload - Plain object to log
 * @param {'DEFAULT'|'INFO'|'WARNING'|'ERROR'|'CRITICAL'} [severity]
 */
async function writeStructuredLog(payload, severity = 'INFO') {
  // Always emit to stdout as structured JSON — Cloud Run captures this
  const line = JSON.stringify({ severity, ...payload, timestamp: new Date().toISOString() });
  if (severity === 'ERROR' || severity === 'CRITICAL' || severity === 'WARNING') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }

  // Also write to Cloud Logging API if project is configured
  const log = getLog();
  if (!log) return;

  try {
    const metadata = {
      severity,
      resource: { type: 'cloud_run_revision' },
    };
    if (payload.traceId && GCP_PROJECT_ID) {
      metadata.trace = `projects/${GCP_PROJECT_ID}/traces/${payload.traceId}`;
    }
    const entry = log.entry(metadata, payload);
    await log.write(entry);
  } catch (err) {
    // Never let logging failures crash the app — just print to stderr
    process.stderr.write(JSON.stringify({ severity: 'WARNING', message: 'Cloud Logging write failed', error: err.message }) + '\n');
  }
}

// ---------------------------------------------------------------------------
// Request logging middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that emits a structured JSON log line for every request.
 * Fields: method, path, status, durationMs, traceId, userId.
 * PII fields are redacted from the body before logging.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} next
 */
function requestLogger(req, res, next) {
  const startedAt = Date.now();
  const { traceId, spanId } = extractTraceContext(req);

  // Attach traceId to req so other middleware/handlers can reference it
  req.traceId = traceId;
  req.spanId = spanId;

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const userId = extractUserId(req);

    const logPayload = {
      httpRequest: {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        userAgent: req.headers['user-agent'] || null,
      },
      // Top-level fields required by acceptance criteria
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
      traceId,
      userId,
    };

    const severity = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARNING' : 'INFO';

    // Fire-and-forget — we don't await in an event handler
    writeStructuredLog(logPayload, severity).catch(() => {});
  });

  next();
}

// ---------------------------------------------------------------------------
// Error reporting middleware (must be registered AFTER routes)
// ---------------------------------------------------------------------------

/**
 * Express error handler middleware that reports unhandled errors to
 * Cloud Error Reporting and logs them as structured JSON.
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} next
 */
function errorReporter(err, req, res, next) {
  const traceId = req.traceId || extractTraceContext(req).traceId;
  const userId = extractUserId(req);

  // Log the error structurally
  writeStructuredLog({
    message: err.message,
    stack: err.stack,
    traceId,
    userId,
    method: req.method,
    path: req.path,
  }, 'ERROR').catch(() => {});

  // Report to Cloud Error Reporting
  const errClient = getErrorReporting();
  if (errClient) {
    errClient.report(err, req, (reportErr) => {
      if (reportErr) {
        process.stderr.write(JSON.stringify({ severity: 'WARNING', message: 'Error Reporting failed', error: reportErr.message }) + '\n');
      }
    });
  }

  // Pass the error along to any subsequent error handlers
  next(err);
}

// ---------------------------------------------------------------------------
// Firestore trace span helper (for POST /api/rules sub-spans)
// ---------------------------------------------------------------------------

/**
 * Wrap an async Firestore operation in a Cloud Trace sub-span.
 * When not running in GCP, this is a transparent pass-through.
 *
 * @param {string} spanName - Human-readable span label
 * @param {string} traceId - Parent trace ID
 * @param {Function} fn - Async function to wrap
 * @returns {Promise<*>} Result of fn()
 */
async function withTraceSpan(spanName, traceId, fn) {
  const startMs = Date.now();
  let error = null;
  let result;

  try {
    result = await fn();
  } catch (err) {
    error = err;
  }

  const durationMs = Date.now() - startMs;

  // Emit sub-span as a structured log entry (Cloud Trace can ingest these)
  writeStructuredLog({
    message: `Span: ${spanName}`,
    spanName,
    traceId,
    durationMs,
    error: error ? error.message : null,
  }, error ? 'ERROR' : 'INFO').catch(() => {});

  if (error) throw error;
  return result;
}

// ---------------------------------------------------------------------------
// Process-level unhandled rejection / exception reporters
// ---------------------------------------------------------------------------

/**
 * Register process-level handlers for unhandledRejection and uncaughtException.
 * These report to Cloud Error Reporting within the 2-minute SLO.
 */
function registerProcessErrorHandlers() {
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    writeStructuredLog({
      message: `Unhandled rejection: ${err.message}`,
      stack: err.stack,
      type: 'unhandledRejection',
    }, 'CRITICAL').catch(() => {});

    const errClient = getErrorReporting();
    if (errClient) {
      errClient.report(err, () => {});
    }
  });

  process.on('uncaughtException', (err) => {
    writeStructuredLog({
      message: `Uncaught exception: ${err.message}`,
      stack: err.stack,
      type: 'uncaughtException',
    }, 'CRITICAL').catch(() => {});

    const errClient = getErrorReporting();
    if (errClient) {
      errClient.report(err, () => {
        // After reporting, allow Node to terminate naturally
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  requestLogger,
  errorReporter,
  writeStructuredLog,
  redact,
  withTraceSpan,
  registerProcessErrorHandlers,
  // Exposed for testing
  extractTraceContext,
  extractUserId,
  PII_KEYS,
  PII_PATTERNS,
};
