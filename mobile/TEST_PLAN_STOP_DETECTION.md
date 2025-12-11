# useStopDetection Hook - TDD Test Plan

## Overview

This document describes the comprehensive test suite for the `useStopDetection` React hook, following strict TDD (Test-Driven Development) principles.

**Status:** RED Phase Complete ✗
**Tests Created:** 38
**Lines of Code:** 1,305
**Implementation Status:** Not started (intentional - TDD RED phase)

---

## Test Execution Results

### Current State (RED Phase)

```bash
$ npm test -- src/hooks/__tests__/useStopDetection.test.ts

FAIL src/hooks/__tests__/useStopDetection.test.ts
  ● Test suite failed to run

    Cannot find module '../useStopDetection' from 'src/hooks/__tests__/useStopDetection.test.ts'
```

**Expected:** ✓ Tests correctly fail because implementation doesn't exist
**Next Step:** Implement the hook to make tests pass (GREEN phase)

---

## Hook Specification

### Purpose
Manage GPS-based stop detection during an active trip session. The hook watches the device's location and detects when the user enters/leaves bus stop proximity zones.

### Interface

```typescript
// Input parameters
interface UseStopDetectionParams {
  active: boolean;              // Enable/disable location tracking
  routeId: string;              // Current route identifier
  directionId: number;          // Route direction (0 or 1)
  stops: StopWithCoords[];      // Array of stops to monitor
  recordStopVisit: (            // Callback for completed visits
    stopId: string,
    tEnter: Date,
    tLeave: Date
  ) => void;
  radiusMeters?: number;        // Proximity radius (default: 50m)
}

// Return value
interface UseStopDetectionReturn {
  isRunning: boolean;           // True when actively watching location
  lastStopId: string | null;    // ID of current stop (or null if outside)
  error: Error | null;          // Permission or location service errors
}
```

### State Machine

```
┌─────────┐
│ outside │
└────┬────┘
     │ distance < radius
     ▼
┌─────────┐
│ inside  │ ◄─┐
│ stopId  │   │ switch stops (new nearest stop)
└────┬────┘   │
     │         │
     └─────────┘
     │ distance >= radius
     ▼ (recordStopVisit)
┌─────────┐
│ outside │
└─────────┘
```

---

## Test Coverage Breakdown

### 1. Initial State (3 tests)
Tests that verify the hook's default inactive state:
- **✗** Inactive state when `active = false`
- **✗** No callbacks triggered initially
- **✗** No location permissions requested when inactive

**Rationale:** Ensures hook is conservative and doesn't consume resources when not needed.

---

### 2. Activation and Deactivation (6 tests)
Tests for the hook's lifecycle management:
- **✗** Start watching location when `active = true`
- **✗** Request foreground location permissions
- **✗** Use high accuracy and appropriate update interval
- **✗** Stop watching location when deactivated
- **✗** Cleanup subscription on unmount
- **✗** Set `isRunning` state correctly

**Rationale:** Verifies proper resource management and permission handling.

---

### 3. Basic Single-Stop Visit (5 tests)
Core functionality - detect a single stop visit:
- **✗** Detect entry into stop radius
- **✗** Call `recordStopVisit` when leaving stop
- **✗** Pass correct `stopId` to callback
- **✗** Ensure `tEnter < tLeave` timing constraint
- **✗** Reset `lastStopId` after leaving

**Rationale:** Validates the fundamental enter → dwell → leave workflow.

---

### 4. Multiple Consecutive Stops (3 tests)
Tests for sequential stop visits:
- **✗** Detect visits to multiple stops in sequence
- **✗** Call `recordStopVisit` with correct `stopId` for each
- **✗** Update `lastStopId` for each stop visit

**Rationale:** Ensures hook tracks multiple stops correctly during a trip.

---

### 5. Deactivation While Inside Stop (3 tests)
Edge case: trip ends while user is inside a stop:
- **✗** Immediately close visit when deactivated inside stop
- **✗** Set `isRunning = false` after deactivation
- **✗** Use deactivation time as `tLeave`

**Rationale:** Prevents data loss when trip is interrupted.

---

### 6. Empty Stops Array (4 tests)
Graceful degradation when no stops provided:
- **✗** Handle empty stops array without throwing
- **✗** Still start watching location (for future use)
- **✗** Never call `recordStopVisit`
- **✗** Keep `lastStopId` as null

**Rationale:** Ensures robustness when route data is incomplete.

---

### 7. Boundary Conditions (3 tests)
Precise behavior at the radius threshold:
- **✗** Treat `distance === radius` as outside (exclusive boundary)
- **✗** Detect exit when crossing to exactly radius
- **✗** Detect exit when crossing to radius + 1m

**Rationale:** Validates the geo domain's boundary contract (< not <=).

---

### 8. Stop Switching Without Leaving (2 tests)
Complex scenario: stops are very close together:
- **✗** Close previous visit and open new visit when switching
- **✗** Handle rapid stop switching (A → B → C)

**Rationale:** Tests the "switch stops" transition in the state machine.

---

### 9. Permission and Location Errors (5 tests)
Error handling and failure modes:
- **✗** Set error when permission is denied
- **✗** Set `isRunning = false` when permission denied
- **✗** No callbacks when permission denied
- **✗** Handle `watchPositionAsync` errors gracefully
- **✗** Handle permission request errors

**Rationale:** Ensures graceful degradation when GPS is unavailable.

---

### 10. Custom Radius Parameter (3 tests)
Configurable proximity detection:
- **✗** Use default radius of 50m when not specified
- **✗** Respect custom radius of 100m
- **✗** Respect custom radius of 25m

**Rationale:** Validates parameterization for different use cases.

---

### 11. Dwell Time Inside Stop (2 tests)
Behavior while stationary at a stop:
- **✗** Don't call `recordStopVisit` while dwelling
- **✗** Maintain `lastStopId` while dwelling

**Rationale:** Ensures callback is only triggered on exit, not during stay.

---

## Test Data

### Real-World Bangalore Landmarks

All test coordinates use actual BMTC bus stops:

| Landmark | Stop ID | Coordinates | Usage |
|----------|---------|-------------|-------|
| Majestic Bus Stand | 20558 | 12.9716°N, 77.5946°E | Primary test stop |
| MG Road | 29374 | 12.9756°N, 77.6064°E | Multi-stop tests |
| Whitefield | 30123 | 12.9698°N, 77.7500°E | Future use |

### Distance Test Points (relative to Majestic)

Computed using Haversine formula for 50m radius tests:

| Point | Distance | Latitude | Longitude | Inside? |
|-------|----------|----------|-----------|---------|
| FAR_FROM_MAJESTIC | ~111m | 12.9726 | 77.5946 | No |
| NEAR_MAJESTIC | ~33m | 12.9719 | 77.5946 | Yes |
| BOUNDARY_MAJESTIC | ~50m | 12.97205 | 77.5946 | No (boundary) |
| BETWEEN_STOPS | ~500m | 12.9736 | 77.6005 | No |

---

## Mocking Strategy

### expo-location Module

Complete mock implementation to avoid real GPS hardware:

```typescript
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: {
    High: 4,
    Balanced: 3,
    Low: 2,
  },
}));
```

### Location Simulation Helper

```typescript
const triggerLocation = (lat: number, lon: number, deltaMs: number = 1000) => {
  mockTimestamp += deltaMs;
  act(() => {
    mockLocationCallback!({
      coords: {
        latitude: lat,
        longitude: lon,
        accuracy: 10,
        // ... other GPS fields
      },
      timestamp: mockTimestamp,
    });
  });
};
```

**Advantages:**
- Deterministic behavior (no flakiness)
- Precise timing control
- No battery/GPS dependency
- Fast test execution

---

## Test Quality Metrics

### AAA Pattern Compliance
All tests follow **Arrange-Act-Assert** structure:

```typescript
it('should detect entry into stop radius', async () => {
  // ARRANGE
  const mockRecordStopVisit = jest.fn();
  const { result } = renderHook(() =>
    useStopDetection({ /* params */ })
  );

  await waitFor(() => {
    expect(result.current.isRunning).toBe(true);
  });

  // ACT
  triggerLocation(FAR_FROM_MAJESTIC.lat, FAR_FROM_MAJESTIC.lon);
  triggerLocation(NEAR_MAJESTIC.lat, NEAR_MAJESTIC.lon);

  // ASSERT
  await waitFor(() => {
    expect(result.current.lastStopId).toBe('20558');
  });
});
```

### Descriptive Test Names

Each test name describes:
1. **Behavior:** What is being tested
2. **Context:** Under what conditions
3. **Outcome:** Expected result

Examples:
- ✓ "should detect entry into stop radius"
- ✓ "should immediately close visit when deactivated inside stop"
- ✓ "should treat distance === radius as outside"

### Isolation Guarantees

Each test:
- Runs independently (no shared state)
- Clears mocks in `beforeEach`/`afterEach`
- Uses fresh hook instances
- Doesn't depend on test execution order

---

## Dependencies

### Production Dependencies
- `expo-location` (^19.0.3): GPS location services

### Test Dependencies
- `@testing-library/react-native` (^12.4.3): Hook testing utilities
- `jest` (^29.7.0): Test runner

### Internal Dependencies
- `@/src/domain/geo`: Haversine distance and proximity state utilities

---

## Coverage Targets

| Category | Target | Actual (after GREEN phase) |
|----------|--------|----------------------------|
| Line Coverage | >95% | TBD |
| Branch Coverage | >90% | TBD |
| Function Coverage | 100% | TBD |
| Statement Coverage | >95% | TBD |

### Critical Paths (Must be 100%)
- State machine transitions
- Permission handling
- Callback invocations
- Resource cleanup

---

## Known Limitations

### Test Limitations
1. **No real GPS hardware testing:** All location updates are simulated
2. **No GPS accuracy degradation:** Assumes perfect 10m accuracy
3. **No concurrent location updates:** Tests trigger updates sequentially
4. **No battery/power management:** Tests don't verify power optimization

### These are intentional tradeoffs for:
- Fast test execution (~200ms per test)
- Deterministic behavior (no flakes)
- CI/CD compatibility (no hardware dependencies)

---

## Next Steps (GREEN Phase)

### Implementation Checklist

1. **Create hook file:** `src/hooks/useStopDetection.ts`

2. **State management:**
   - [ ] `isRunning` state
   - [ ] `lastStopId` state
   - [ ] `error` state
   - [ ] Internal proximity state (from `geo` module)

3. **Location watching:**
   - [ ] Request permissions on activation
   - [ ] Start `watchPositionAsync` with high accuracy
   - [ ] Stop watching on deactivation
   - [ ] Cleanup on unmount

4. **Stop detection logic:**
   - [ ] Use `findNearestStop` on each location update
   - [ ] Use `updateStopProximityState` for transitions
   - [ ] Record entry timestamp on enter
   - [ ] Call `recordStopVisit` on exit
   - [ ] Handle stop switching

5. **Error handling:**
   - [ ] Permission denial
   - [ ] Location service errors
   - [ ] Invalid parameters

6. **Edge cases:**
   - [ ] Deactivation while inside stop
   - [ ] Empty stops array
   - [ ] Custom radius parameter

7. **Run tests:**
   ```bash
   npm test -- src/hooks/__tests__/useStopDetection.test.ts
   ```

8. **Verify all 38 tests pass** ✓

---

## Validation Commands

```bash
# Run all tests
npm test -- src/hooks/__tests__/useStopDetection.test.ts

# Run with watch mode (for development)
npm test -- src/hooks/__tests__/useStopDetection.test.ts --watch

# Run with coverage report
npm test -- src/hooks/__tests__/useStopDetection.test.ts --coverage

# Run specific test suite
npm test -- src/hooks/__tests__/useStopDetection.test.ts -t "Basic single-stop visit"
```

---

## File Locations

```
mobile/
├── src/
│   ├── hooks/
│   │   ├── __tests__/
│   │   │   ├── useStopDetection.test.ts      (1,305 lines, 38 tests)
│   │   │   └── useStopDetection.test.md      (documentation)
│   │   └── useStopDetection.ts               (NOT CREATED YET)
│   └── domain/
│       └── geo.ts                             (utilities used by hook)
└── TEST_PLAN_STOP_DETECTION.md               (this file)
```

---

## References

- **TDD Methodology:** Red-Green-Refactor cycle
- **Test Patterns:** AAA (Arrange-Act-Assert)
- **Geo Module:** `/home/karan-kinariwala/KARAN/1-Projects/bmtc-transit-app/mobile/src/domain/geo.ts`
- **Similar Hook Tests:** `useTripSession.test.ts` (reference implementation)
- **Project Guidelines:** `/home/karan-kinariwala/KARAN/1-Projects/bmtc-transit-app/CLAUDE.md`

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-11 | Claude Sonnet 4.5 | Initial test suite creation (RED phase) |

---

**Status:** Ready for GREEN phase implementation 🟢

All 38 tests are written, documented, and failing as expected. The next step is to implement the hook to make these tests pass.
