/* eslint-disable arrow-body-style, no-bitwise */
/**
 * Utility Functions
 * Common utility functions used across BMTC Transit App services
 */

/**
 * Validates if a string is a valid email address
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates if coordinates are within Bengaluru bounds
 */
export const isWithinBengaluruBounds = (latitude: number, longitude: number): boolean => {
  // Approximate bounds for Bengaluru
  const bounds = {
    north: 13.2,
    south: 12.7,
    east: 77.9,
    west: 77.3,
  };

  return (
    latitude >= bounds.south &&
    latitude <= bounds.north &&
    longitude >= bounds.west &&
    longitude <= bounds.east
  );
};

/**
 * Generates a UUID v4 string
 */
export const generateUuid = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
