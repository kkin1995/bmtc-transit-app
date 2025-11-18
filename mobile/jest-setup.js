/**
 * Jest setup file for React Native Testing Library
 */

// Note: @testing-library/jest-native is deprecated
// Matchers are now built into @testing-library/react-native v12.4+
// import '@testing-library/jest-native/extend-expect';

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
  Stack: {
    Screen: () => null,
  },
  Link: 'Link',
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
}));

// Mock expo modules
jest.mock('expo-font', () => ({
  loadAsync: jest.fn(),
  isLoaded: jest.fn(() => true),
}));

jest.mock('expo-asset', () => ({
  Asset: {
    loadAsync: jest.fn(),
  },
}));

// Silence console warnings in tests
global.console = {
  ...console,
  // Uncomment to suppress console.log/error/warn in tests
  // log: jest.fn(),
  // error: jest.fn(),
  // warn: jest.fn(),
};
