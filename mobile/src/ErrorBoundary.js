// mobile/src/ErrorBoundary.js
// Global React error boundary — catches unhandled render errors and reports
// them to Firebase Crashlytics (and via GCP integration to Cloud Error Reporting).

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { recordError } from './crashlytics';

/**
 * ErrorBoundary wraps the entire app tree. Any unhandled render error or
 * lifecycle error that reaches this boundary is:
 * 1. Reported to Firebase Crashlytics via recordError()
 * 2. Shown to the user as a friendly recovery screen
 *
 * Native crashes (force-kill, OOM, signal) are caught automatically by the
 * Crashlytics native SDK without requiring this boundary.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Report to Crashlytics — this surfaces in Cloud Error Reporting via the
    // Firebase–GCP integration enabled in the Firebase console.
    recordError(error, info?.componentStack ? 'render' : 'unknown').catch(() => {});

    if (__DEV__) {
      console.error('[ErrorBoundary] Caught render error:', error, info);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>🐓</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            The error has been reported. Please try again.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e0e0e0',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#3a86ff',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
});
