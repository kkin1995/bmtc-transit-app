/* eslint-disable no-console, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
/**
 * Mobile App Entry Point
 * React Native mobile application for BMTC Transit App
 */

/**
 * App configuration constants
 */
export const MOBILE_APP_CONFIG = {
  name: 'BMTC Transit App',
  version: '1.0.0',
  apiBaseUrl: 'http://localhost:3000/api/v1',
} as const;

/**
 * Screen names for navigation
 */
export const SCREEN_NAMES = {
  HOME: 'Home',
  MAP: 'Map',
  PROFILE: 'Profile',
  SETTINGS: 'Settings',
} as const;

/**
 * Placeholder app initialization
 */
export const initializeMobileApp = (): void => {
  // eslint-disable-next-line no-console
  console.warn('Mobile app initialization - placeholder implementation');
};
