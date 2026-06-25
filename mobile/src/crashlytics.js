// mobile/src/crashlytics.js
// Firebase Crashlytics wrapper — surfaces mobile crashes to Firebase Crashlytics
// and via the Firebase–GCP integration to Cloud Error Reporting.

/**
 * Lazily import @react-native-firebase/crashlytics so the module does not
 * hard-fail on platforms where native code is unavailable (e.g. Expo Go).
 * When running in an EAS production build, the native module will be present.
 */
let _crashlytics = null;

function getCrashlytics() {
  if (_crashlytics !== null) return _crashlytics;
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    _crashlytics = require('@react-native-firebase/crashlytics').default;
    return _crashlytics;
  } catch {
    // Native module unavailable (Expo Go, web, or missing native build)
    _crashlytics = undefined;
    return null;
  }
}

/**
 * Record a non-fatal error in Firebase Crashlytics.
 * Safe to call from any context — no-ops gracefully if Crashlytics is unavailable.
 *
 * @param {Error} error - The error to record
 * @param {string} [context] - Optional label (e.g. screen name or action)
 */
export async function recordError(error, context = 'unknown') {
  const crashlytics = getCrashlytics();
  if (!crashlytics) return;

  try {
    if (context) {
      await crashlytics().setAttribute('context', context);
    }
    await crashlytics().recordError(error);
  } catch (e) {
    // Never let the crash reporter itself crash the app
    if (__DEV__) {
      console.warn('[crashlytics] recordError failed:', e.message);
    }
  }
}

/**
 * Set a custom key/value attribute in Crashlytics for the current session.
 * Useful for attaching user ID or build info to crash reports.
 *
 * @param {string} key
 * @param {string} value
 */
export async function setAttribute(key, value) {
  const crashlytics = getCrashlytics();
  if (!crashlytics) return;
  try {
    await crashlytics().setAttribute(key, String(value));
  } catch {}
}

/**
 * Set the Crashlytics user ID for the current session.
 * Use an opaque ID (not email/phone) to avoid PII in crash reports.
 *
 * @param {string} userId - An opaque user identifier (e.g. Firebase Auth UID)
 */
export async function setUserId(userId) {
  const crashlytics = getCrashlytics();
  if (!crashlytics) return;
  try {
    await crashlytics().setUserId(userId);
  } catch {}
}

/**
 * Log a breadcrumb message to Crashlytics (visible in crash reports).
 * Does NOT create a crash entry on its own.
 *
 * @param {string} message - Breadcrumb label (max 64 kB per session)
 */
export async function log(message) {
  const crashlytics = getCrashlytics();
  if (!crashlytics) return;
  try {
    await crashlytics().log(message);
  } catch {}
}
