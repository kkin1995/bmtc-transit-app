/**
 * Ride Configuration
 *
 * Configuration for ride tracking and submission functionality.
 * Manages API authentication and device identification.
 */

import * as Crypto from 'expo-crypto';

/**
 * Get the API key for backend authentication
 *
 * TODO: In production, this should be securely stored and retrieved
 * from a secure storage mechanism (e.g., SecureStore).
 * For now, using environment variable with fallback for development.
 */
export function getApiKey(): string {
  const apiKey = process.env.EXPO_PUBLIC_BMTC_API_KEY || 'dev-api-key-placeholder';
  return apiKey;
}

/**
 * Get or generate a stable device bucket identifier
 *
 * The device bucket is a privacy-preserving identifier used for:
 * - Rate limiting ride submissions
 * - Abuse detection
 * - NOT for user tracking (no PII)
 *
 * In production, this should be:
 * 1. Generated once per app install
 * 2. Stored in persistent storage (e.g., AsyncStorage or SecureStore)
 * 3. Regenerated periodically (e.g., every 90 days) for privacy
 *
 * For now, we generate a deterministic ID based on a stored seed.
 *
 * TODO: Implement proper device bucket rotation strategy per backend specs.
 */
export async function getDeviceBucket(): Promise<string> {
  // For development/testing: return a fixed value
  // In production: implement proper generation + storage + rotation

  // Check if we have a stored device bucket
  // TODO: Use AsyncStorage to persist this across app sessions
  // const storedBucket = await AsyncStorage.getItem('@device_bucket');
  // if (storedBucket) return storedBucket;

  // Generate a new device bucket (salted hash of a random seed)
  // This should be done ONCE per install and persisted
  const randomBytes = await Crypto.getRandomBytesAsync(16);
  const deviceBucket = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // TODO: Store for future use
  // await AsyncStorage.setItem('@device_bucket', deviceBucket);

  return deviceBucket;
}

/**
 * Generate a UUID v4 for idempotency keys
 *
 * Used to ensure ride submissions are idempotent (can be safely retried).
 */
export function generateIdempotencyKey(): string {
  return Crypto.randomUUID();
}

/**
 * Default map-matching confidence for recorded stops
 *
 * TODO: In production, calculate this based on GPS quality indicators:
 * - GPS accuracy (meters)
 * - Number of satellites
 * - Speed consistency
 * - Distance from expected route
 *
 * For now, using a conservative default value.
 */
export const DEFAULT_MAPMATCH_CONFIDENCE = 0.9;
