/**
 * API Configuration
 *
 * Manages the base URL for the BMTC Transit API backend.
 * Reads from environment variables with a fallback for development.
 */

// TODO: Set up environment variable management with expo-constants or react-native-dotenv
// For now, using a hardcoded fallback for development
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';

/**
 * API configuration object
 */
export const apiConfig = {
  baseUrl: API_BASE_URL,
  version: 'v1',
  timeout: 30000, // 30 seconds
  routesListLimit: 1000, // Maximum number of routes to fetch
};

/**
 * Get the full URL for an API endpoint
 */
export function getApiUrl(path: string): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${apiConfig.baseUrl}/${cleanPath}`;
}
