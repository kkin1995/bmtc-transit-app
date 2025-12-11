# useStopDetection Test Suite - TDD RED Phase

## Test Plan Summary

Comprehensive test suite for the `useStopDetection` React hook following TDD principles. This hook manages GPS-based stop detection during active trips.

## Test Coverage

### 1. Initial State (3 tests)
- ✗ Hook starts with inactive state when `active = false`
- ✗ No callbacks triggered initially
- ✗ No location permissions requested when inactive

### 2. Activation and Deactivation (6 tests)
- ✗ Start watching location when `active = true`
- ✗ Request foreground location permissions
- ✗ Use high accuracy and fast update interval
- ✗ Stop watching location when deactivated
- ✗ Cleanup subscription on unmount
- ✗ Set `isRunning` state correctly

### 3. Basic Single-Stop Visit (5 tests)
- ✗ Detect entry into stop radius (distance < 50m)
- ✗ Call `recordStopVisit` when leaving stop (distance >= 50m)
- ✗ Pass correct `stopId` to callback
- ✗ Ensure `tEnter < tLeave` timing constraint
- ✗ Reset `lastStopId` after leaving stop

### 4. Multiple Consecutive Stops (3 tests)
- ✗ Detect visits to multiple stops in sequence
- ✗ Call `recordStopVisit` with correct `stopId` for each visit
- ✗ Update `lastStopId` for each stop visit

### 5. Deactivation While Inside Stop (3 tests)
- ✗ Immediately close visit when deactivated inside stop
- ✗ Set `isRunning = false` after deactivation
- ✗ Use deactivation time as `tLeave`

### 6. Empty Stops Array (4 tests)
- ✗ Handle empty stops array without throwing
- ✗ Still start watching location with empty stops
- ✗ Never call `recordStopVisit` with empty stops
- ✗ Keep `lastStopId` as null

### 7. Boundary Conditions (3 tests)
- ✗ Treat `distance === radius` as outside (boundary is exclusive)
- ✗ Detect exit when crossing from inside to exactly radius
- ✗ Detect exit when crossing from inside to radius + 1m

### 8. Stop Switching Without Leaving (2 tests)
- ✗ Close previous visit and open new visit when switching stops
- ✗ Handle rapid stop switching (A → B → C)

### 9. Permission and Location Errors (5 tests)
- ✗ Set error when permission is denied
- ✗ Set `isRunning = false` when permission denied
- ✗ No callbacks when permission denied
- ✗ Handle `watchPositionAsync` errors gracefully
- ✗ Handle permission request errors

### 10. Custom Radius Parameter (3 tests)
- ✗ Use default radius of 50m when not specified
- ✗ Respect custom radius of 100m
- ✗ Respect custom radius of 25m

### 11. Dwell Time Inside Stop (2 tests)
- ✗ Don't call `recordStopVisit` while dwelling inside stop
- ✗ Maintain `lastStopId` while dwelling

## Total Test Count: 42 tests

## Hook Interface

```typescript
interface UseStopDetectionParams {
  active: boolean;
  routeId: string;
  directionId: number;
  stops: StopWithCoords[];
  recordStopVisit: (stopId: string, tEnter: Date, tLeave: Date) => void;
  radiusMeters?: number; // default 50
}

interface UseStopDetectionReturn {
  isRunning: boolean;
  lastStopId: string | null;
  error: Error | null;
}
```

## Test Data

Uses real Bangalore landmarks:
- **STOP_MAJESTIC** (20558): 12.9716°N, 77.5946°E
- **STOP_MG_ROAD** (29374): 12.9756°N, 77.6064°E
- **STOP_WHITEFIELD** (30123): 12.9698°N, 77.7500°E

Distance helpers computed using Haversine formula:
- FAR_FROM_MAJESTIC: ~111m (outside 50m radius)
- NEAR_MAJESTIC: ~33m (inside 50m radius)
- BOUNDARY_MAJESTIC: ~50m (exactly at boundary)

## Mocking Strategy

Complete mock of `expo-location`:
- `requestForegroundPermissionsAsync`: Mock permission grant/denial
- `watchPositionAsync`: Capture callback and return mock subscription
- `Accuracy`: Mock accuracy constants

Helper function `triggerLocation(lat, lon, deltaMs)` simulates GPS updates.

## Current Status: RED Phase ✗

All tests fail as expected - implementation file does not exist:

```
FAIL src/hooks/__tests__/useStopDetection.test.ts
  ● Test suite failed to run

    Cannot find module '../useStopDetection' from 'src/hooks/__tests__/useStopDetection.test.ts'
```

## Next Steps (GREEN Phase)

1. Create `src/hooks/useStopDetection.ts`
2. Implement state machine:
   - `outside` → `inside` (enter stop)
   - `inside` → `outside` (leave stop)
   - `inside` → `inside` (switch stops)
3. Use `findNearestStop` from `@/src/domain/geo`
4. Use `updateStopProximityState` for state transitions
5. Watch location with `expo-location`
6. Handle permissions and errors
7. Close visit on deactivation

## Test Execution

```bash
# Run full test suite
npm test -- src/hooks/__tests__/useStopDetection.test.ts

# Run with watch mode
npm test -- src/hooks/__tests__/useStopDetection.test.ts --watch

# Run with coverage
npm test -- src/hooks/__tests__/useStopDetection.test.ts --coverage
```

## Coverage Targets

- Happy paths: 100%
- Error handling: 100%
- Edge cases: 100%
- State transitions: 100%

## Dependencies

- `expo-location`: GPS location services
- `@testing-library/react-native`: Hook testing
- `@/src/domain/geo`: Distance and proximity utilities

## Notes

- Tests use AAA pattern (Arrange-Act-Assert)
- Complete isolation from real GPS hardware
- All location updates are deterministic
- Tests verify both state changes and callback invocations
- Error states are explicitly tested
- Boundary conditions are thoroughly covered
