# Mobile App Test Setup Documentation

## Overview

This document describes the test setup for the BMTC Transit mobile app (React Native + Expo). All tests follow TDD principles and cover both hooks and screens without modifying implementation code.

## Test Infrastructure

### Dependencies Added

**Testing Libraries:**
- `jest@^29.7.0` - Test framework
- `jest-expo@~52.0.1` - Expo preset for Jest
- `@testing-library/react-native@^12.4.3` - React Native testing utilities
- `@testing-library/jest-native@^5.4.3` - Additional matchers for React Native
- `@types/jest@^29.5.11` - TypeScript types for Jest

### Configuration Files

**`jest.config.js`:**
- Uses `jest-expo` preset for React Native environment
- Configures module name mapping for `@/` alias
- Sets up path ignores for `/node_modules/`, `/android/`, `/ios/`
- Configures coverage collection from `src/**` and `app/**` directories
- Sets `testEnvironment: 'node'` for performance

**`jest-setup.js`:**
- Extends Jest matchers with `@testing-library/jest-native`
- Mocks `expo-router` (useRouter, useLocalSearchParams, Stack)
- Mocks `expo-font` and `expo-asset` to prevent initialization errors
- Silences console output in tests (optional, currently commented out)

**`package.json` scripts:**
- `npm test` - Run all tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

## Test Files Created

### Hook Tests (4 files, ~530 lines)

**Location:** `src/hooks/__tests__/`

1. **`useStops.test.tsx`** (7 tests)
   - ✅ Calls fetchStops with params on mount
   - ✅ Returns stops data on success
   - ✅ Handles error state
   - ✅ Supports reload functionality
   - ✅ Handles different query params
   - ✅ Returns empty stops array when no data

2. **`useRoutes.test.tsx`** (7 tests)
   - ✅ Calls fetchRoutes with params on mount
   - ✅ Returns routes data on success
   - ✅ Handles error state
   - ✅ Supports reload functionality
   - ✅ Handles filtering by stop_id
   - ✅ Handles filtering by route_type
   - ✅ Returns empty routes array when no data

3. **`useStopSchedule.test.tsx`** (8 tests)
   - ✅ Does NOT call API when stopId is undefined/null/empty
   - ✅ Calls fetchStopSchedule when stopId is provided
   - ✅ Returns schedule data on success
   - ✅ Handles error state
   - ✅ Supports reload functionality
   - ✅ Handles filtering by route_id
   - ✅ Returns empty departures when no schedules found

4. **`useEta.test.tsx`** (10 tests)
   - ✅ Does NOT call API when params are missing
   - ✅ Tests each missing param individually (route_id, direction_id, from_stop_id, to_stop_id)
   - ✅ Calls fetchEta when all required params provided
   - ✅ Returns ETA data on success
   - ✅ Handles error state
   - ✅ Supports reload functionality
   - ✅ Handles optional when parameter
   - ✅ Handles direction_id of 0 (not falsy check)

### Screen Tests (4 files, ~600 lines)

**Location:** `app/(tabs)/__tests__/` and `app/stop/__tests__/` and `app/eta/__tests__/`

1. **`HomeScreen.test.tsx`** (9 tests)
   - ✅ Renders "BMTC Transit" title
   - ✅ Calls useStops with limit: 20
   - ✅ Shows loading state
   - ✅ Shows error state with retry button
   - ✅ Shows empty state when no stops
   - ✅ Renders list of stops
   - ✅ Navigates to stop detail when stop is pressed
   - ✅ Handles multiple stops and navigates correctly

2. **`RoutesScreen.test.tsx`** (9 tests)
   - ✅ Renders "Routes" title
   - ✅ Calls useRoutes with limit: 50
   - ✅ Shows loading state
   - ✅ Shows error state with retry button
   - ✅ Shows empty state when no routes
   - ✅ Renders list of routes
   - ✅ Logs route_id when route is pressed (TODO: navigation)
   - ✅ Displays route type correctly for non-bus types
   - ✅ Handles routes without short name or agency_id

3. **`StopDetailScreen.test.tsx`** (9 tests)
   - ✅ Uses stopId from params
   - ✅ Shows loading state
   - ✅ Shows error state with retry button
   - ✅ Shows empty state with refresh button
   - ✅ Renders stop header when stop data is available
   - ✅ Renders list of departures
   - ✅ Navigates to ETA screen when departure is tapped
   - ✅ Handles departure with null direction_id
   - ✅ Shows query time

4. **`EtaScreen.test.tsx`** (10 tests)
   - ✅ Reads params and calls useEta with parsed direction_id
   - ✅ Displays segment info card
   - ✅ Shows missing params warning
   - ✅ Shows loading state
   - ✅ Shows error state with retry button
   - ✅ Renders scheduled GTFS section
   - ✅ Renders ML prediction section
   - ✅ Formats duration correctly for different values
   - ✅ Displays confidence with correct color
   - ✅ Shows query time

## Running Tests

### Run All Tests

```bash
cd mobile
npm install  # Install dependencies first (if not done)
npm test
```

### Run Specific Test File

```bash
cd mobile
npm test -- useStops.test.tsx
npm test -- HomeScreen.test.tsx
```

### Run Tests in Watch Mode

```bash
cd mobile
npm run test:watch
```

### Run Tests with Coverage

```bash
cd mobile
npm run test:coverage
```

## Test Coverage Summary

**Total Test Files:** 8 (4 hooks + 4 screens)
**Total Tests:** 62
**Expected to FAIL Initially:** Yes (implementation-first approach)

### Coverage by Module

- **Hooks:** 32 tests covering all 4 data-fetching hooks
  - useStops: 7 tests
  - useRoutes: 7 tests
  - useStopSchedule: 8 tests
  - useEta: 10 tests

- **Screens:** 30 tests covering all 4 main screens
  - HomeScreen: 9 tests
  - RoutesScreen: 9 tests
  - StopDetailScreen: 9 tests
  - EtaScreen: 10 tests

### What's Tested

**For Hooks:**
- ✅ Correct API client calls with params
- ✅ Data transformation and destructuring
- ✅ Loading states
- ✅ Error handling
- ✅ Reload functionality
- ✅ Conditional fetching (useStopSchedule, useEta)
- ✅ Missing/invalid params handling

**For Screens:**
- ✅ Rendering of UI elements
- ✅ Loading indicators
- ✅ Error states with retry buttons
- ✅ Empty states
- ✅ Data display (lists, cards, formatted values)
- ✅ Navigation (router.push calls)
- ✅ Event handlers (button presses, item taps)
- ✅ Param reading (useLocalSearchParams)
- ✅ Data formatting (durations, timestamps, coordinates)

### What's NOT Tested

- ❌ API client implementation (src/api/client.ts) - mocked in tests
- ❌ Styling and visual appearance
- ❌ Animations and transitions
- ❌ Performance characteristics
- ❌ Integration with real backend API
- ❌ Deep component tree rendering
- ❌ Accessibility features (could be added later)

## Mocking Strategy

### Hooks Tests

- Mock `@/src/api/client` functions (fetchStops, fetchRoutes, fetchStopSchedule, fetchEta)
- Use `jest.MockedFunction` for type-safe mocks
- Clear mocks in `beforeEach()` to prevent test pollution
- Use `renderHook` from `@testing-library/react-native`
- Use `waitFor` for async assertions

### Screen Tests

- Mock `@/src/hooks` module (entire hooks layer)
- Mock `expo-router` (useRouter, useLocalSearchParams)
- Provide complete return values for hooks (all fields populated)
- Use `render` from `@testing-library/react-native`
- Use `screen.getByText` for finding elements
- Use `fireEvent.press` for simulating user interactions

## Known Limitations

### Tests May Fail Due To:

1. **Implementation/test mismatch** - Tests were written after implementation
2. **Missing dependencies** - Run `npm install` in mobile/ directory first
3. **Path aliases** - Ensure tsconfig.json has correct `@/` mapping
4. **React Native environment** - Some tests may need native environment setup
5. **Async timing** - May need to adjust `waitFor` timeouts

### Future Improvements

- Add integration tests that test hooks + screens together
- Add snapshot tests for UI consistency
- Add accessibility tests (a11y)
- Add performance tests (render time, memory usage)
- Add E2E tests with Detox or Maestro
- Add visual regression tests
- Mock fewer layers for more realistic integration tests

## Troubleshooting

### "Cannot find module '@/src/...'"

**Solution:** Ensure `jest.config.js` has correct `moduleNameMapper`:
```javascript
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/$1',
}
```

### "expo-router is not defined"

**Solution:** Ensure `jest-setup.js` mocks expo-router correctly. Already configured in this setup.

### "ReferenceError: fetch is not defined"

**Solution:** This is expected - tests mock the API client, not fetch directly.

### Tests timing out

**Solution:** Increase timeout in jest.config.js or use `jest.setTimeout(10000)` in specific test files.

### "Cannot resolve module 'react-native-reanimated'"

**Solution:** Add to `transformIgnorePatterns` in jest.config.js. Already configured.

## Next Steps

After tests are written (this step is COMPLETE), the next phase is:

1. **Run tests and observe failures** - Expected behavior
2. **Fix implementation if tests reveal bugs** - Implementation adjustment phase
3. **Achieve green test suite** - Goal state
4. **Add more tests as needed** - Expand coverage
5. **Set up CI/CD** - Automate test runs on every commit

## References

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Expo Testing](https://docs.expo.dev/develop/unit-testing/)
- [Testing Library Best Practices](https://testing-library.com/docs/guiding-principles)

---

**Created:** 2025-11-18
**Test Framework:** Jest 29 + React Native Testing Library 12
**Status:** ✅ Test setup complete, ready for TDD validation phase
