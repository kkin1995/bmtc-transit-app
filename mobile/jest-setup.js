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

// Mock Tamagui components
jest.mock('tamagui', () => {
  const React = require('react');
  const RN = require('react-native');

  return {
    TamaguiProvider: ({ children }) => React.createElement(RN.View, {}, children),
    YStack: ({ children, testID, ...props }) =>
      React.createElement(RN.View, { testID: testID || 'tamagui-ystack', ...props }, children),
    XStack: ({ children, ...props }) =>
      React.createElement(RN.View, { ...props }, children),
    Stack: ({ children, ...props }) =>
      React.createElement(RN.View, { ...props }, children),
    Text: ({ children, ...props }) =>
      React.createElement(RN.Text, { ...props }, children),
    Button: ({ children, onPress, testID, ...props }) =>
      React.createElement(
        RN.TouchableOpacity,
        { onPress, testID, ...props },
        typeof children === 'function' ? children : React.createElement(RN.View, {}, children)
      ),
    ScrollView: ({ children, ...props }) =>
      React.createElement(RN.ScrollView, { ...props }, children),
    Pressable: RN.Pressable,
  };
});

// Mock useUserLocation hook with default return value (NO-OP for test file override)
// The actual mock is in the test file at line 27-30, this is just a fallback

// Silence console warnings in tests
global.console = {
  ...console,
  // Uncomment to suppress console.log/error/warn in tests
  // log: jest.fn(),
  // error: jest.fn(),
  // warn: jest.fn(),
};
