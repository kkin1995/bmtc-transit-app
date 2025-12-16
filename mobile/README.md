# BMTC Transit Mobile App

React Native mobile application for the BMTC Transit API. Built with Expo and TypeScript.

## Features

- **Typed API Client**: Fully typed HTTP client for all backend endpoints
- **GTFS Discovery**: Browse stops and routes from GTFS data
- **Routes Search**: Client-side search to filter routes by number or name
- **Schedule Lookup**: View scheduled departures for any stop
- **ETA Predictions**: Get ML-powered travel time estimates
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Trip Planning Flow**: Map-first UX with destination selection sheet
- **Trip Tracking Screen**: Manual trip start/end interface for testing and QA
- **GPS Stop Detection**: Automatic stop visit detection using 50m geofencing
- **Ride Submission**: Automatic ride data submission to backend for ML learning
- **Trip Debug Screen** (dev-only): Developer tool for inspecting trip sessions, stop events, and API submissions

### Home Screen Flow

1. **Idle state**: User sees map with "Where to?" button
2. **Destination selection**: Tap "Where to?" → Bottom sheet with nearby stops appears → Select destination
3. **Journey selection** (coming soon): View suggested routes and journeys
4. **Active trip**: Real-time trip tracking with automatic ride data submission to backend

**Key hooks**: `useHomePlanningState` (trip planning state machine), `useTripSession` (active trip tracking with ride submission), `useStopDetection` (GPS-based stop visit detection), `useUserLocation` (location permissions)

### Trip Tracking Flow

User-facing screen for manually starting and ending trips, useful for testing and QA.

1. **Navigate to Trip Tracking**: Routes tab → Tap any route → Trip Tracking screen opens
2. **Start Trip**: Tap "Start Trip" button to begin session (creates TripSession with selected route)
3. **Active Trip**: View trip details (route, direction, started time, stop events count)
4. **End Trip**: Tap "End Trip" to submit ride data to backend
5. **Result**: Success message or error with retry option
6. **Debug**: Tap bug button on Home screen → Trip Debug shows last submission

**Navigation:**
- Route: `/trip/[routeId]`
- Params: `route_id`, `route_short_name`, `direction_id` (required), `route_long_name`, `headsign` (optional)
- Entry point: Routes tab item press handler

**States:**
- **Initial**: No session, "Ready to start trip", Start button enabled
- **Active**: Session exists, "Trip in progress", End button enabled
- **Post-submission**: Success message (2s) or error banner with retry

**Integration:**
- Uses `useTripSession()` for trip lifecycle management
- Trip data automatically flows to `TripDebugScreen` via `lastRequest`/`lastResponse`
- GPS stop detection can run during active trip (via `useStopDetection`)

**Implementation:**
- Component: `app/trip/[routeId].tsx`
- Tests: `app/trip/__tests__/TripTrackingScreen.test.tsx` (38 tests)
- Related: `app/(tabs)/routes.tsx` (navigation entry point)

### Routes Search

Client-side search feature on the Routes tab for quick route lookup during field testing.

**Features:**
- Search box at top of Routes list
- Real-time filtering as you type
- Case-insensitive partial matching
- Searches both route number (e.g., "335E") and name (e.g., "Electronic City")
- Shows count of filtered results
- Displays "No routes found" with helpful message when no matches

**Usage:**
1. Navigate to Routes tab
2. Type in search box (e.g., "335" or "electronic")
3. List filters instantly to matching routes
4. Tap any route to navigate to Trip Tracking
5. Clear search to see all routes again

**Performance:**
- Pure client-side filtering (no backend requests)
- useMemo optimization prevents unnecessary re-filtering
- Instant results for 50-100 routes

**Implementation:**
- Component: `app/(tabs)/routes.tsx` (useState for query, useMemo for filtering)
- Tests: `app/(tabs)/__tests__/RoutesScreen.test.tsx` (27 tests, including 13 search tests)
- Algorithm: Case-insensitive `.includes()` on both route_short_name and route_long_name

## Tech Stack

- **React Native** - Cross-platform mobile framework
- **Expo** - Development tooling and managed workflow
- **TypeScript** - Type-safe development
- **Expo Router** - File-based navigation

## Project Structure

```
mobile/
├── app/                      # Expo Router app directory
│   ├── (tabs)/              # Tab-based navigation
│   │   ├── index.tsx        # Home screen (map-first UX with debug button)
│   │   ├── routes.tsx       # Routes screen (list of GTFS routes)
│   │   └── _layout.tsx      # Tab layout configuration
│   ├── trip/                # Trip tracking feature
│   │   ├── [routeId].tsx    # Trip tracking screen (start/end trips)
│   │   └── __tests__/       # Trip tracking tests (38 tests)
│   ├── trip-debug.tsx       # Trip debug screen (dev-only)
│   ├── _layout.tsx          # Root layout
│   └── +html.tsx            # HTML template
├── src/
│   ├── api/
│   │   ├── client.ts        # API client functions (includes ride submission)
│   │   ├── types.ts         # TypeScript type definitions
│   │   ├── errors.ts        # Error classes and utilities
│   │   └── index.ts         # Public exports
│   ├── config/
│   │   ├── api.ts           # API configuration
│   │   └── ride.ts          # Ride tracking configuration (API keys, device bucket)
│   ├── domain/
│   │   ├── segments.ts      # GPS event to ride segment conversion
│   │   └── geo.ts           # Geospatial utilities (haversine, proximity detection)
│   ├── hooks/
│   │   ├── useTripSession.ts    # Trip session management with debug state
│   │   ├── useStopDetection.ts  # GPS-based stop visit detection
│   │   └── useUserLocation.ts   # Location permissions and tracking
│   ├── screens/
│   │   └── TripDebugScreen.tsx  # Developer debug UI (dev-only)
│   ├── types/
│   │   └── tripSession.ts   # TripSession type definitions
│   ├── components/          # Shared components
│   └── utils/               # Utility functions
├── __mocks__/               # Jest mocks
│   ├── expo-crypto.js       # Crypto mock for tests
│   └── fileMock.js          # Asset mock for tests
├── assets/                  # Images, fonts, etc.
├── .env.example             # Environment variables template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md                # This file
```

## Prerequisites

- **Node.js** (v18 or later recommended)
- **npm** or **yarn** or **pnpm**
- **Expo CLI** (installed automatically with `npx`)
- **BMTC Transit Backend** running (see instructions below)

## Quick Start

### 1. Start the Backend Server

Open a terminal and start the backend API server:

```bash
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend will start at `http://localhost:8000`. Keep this terminal running.

**Note:** If the database doesn't exist or has schema issues, bootstrap it first:
```bash
cd backend
uv run python -m app.bootstrap
```

### 2. Start the Mobile App

Open a **new terminal** and start the mobile app:

```bash
cd mobile
npm install  # First time only
npm start
```

Press `w` to open in web browser, or scan the QR code with Expo Go app on your phone.

## Detailed Setup

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your API base URL and API key:

```bash
# Development (local backend)
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000

# API key for ride submission (required for POST /v1/ride_summary)
EXPO_PUBLIC_BMTC_API_KEY=dev-api-key-placeholder

# Production
# EXPO_PUBLIC_API_BASE_URL=https://api.bmtc-transit.example.com
# EXPO_PUBLIC_BMTC_API_KEY=your-production-api-key
```

**Note:** Expo requires environment variables to be prefixed with `EXPO_PUBLIC_` to be accessible in client-side code.

### 3. Start the Development Server

```bash
npm start
```

This will start the Expo development server. You'll see a QR code in your terminal.

### 4. Run the App

You have several options:

**On iOS Simulator (macOS only):**
```bash
npm run ios
```

**On Android Emulator:**
```bash
npm run android
```

**On Physical Device:**
1. Install **Expo Go** app from App Store (iOS) or Play Store (Android)
2. Scan the QR code from the terminal with your camera (iOS) or Expo Go app (Android)

**On Web (for testing):**
```bash
npm run web
```

## API Client Usage

The app includes a fully typed API client for the BMTC Transit backend.

### Import the Client

```typescript
import { fetchStops, fetchRoutes, fetchStopSchedule, fetchEta } from '@/src/api';
import type { Stop, Route, ScheduleResponse, ETAResponseV11 } from '@/src/api';
```

### Example: Fetch Stops

```typescript
try {
  const response = await fetchStops({
    limit: 10,
    bbox: '12.9,77.5,13.1,77.7'
  });

  console.log(`Found ${response.total} stops`);
  response.stops.forEach(stop => {
    console.log(`${stop.stop_name} (${stop.stop_id})`);
  });
} catch (error) {
  if (isBMTCApiError(error)) {
    console.error(`API Error: ${error.getUserMessage()}`);
  }
}
```

### Example: Fetch Routes

```typescript
const response = await fetchRoutes({
  stop_id: '20558',
  limit: 20
});
```

### Example: Get Stop Schedule

```typescript
const response = await fetchStopSchedule('20558', {
  time_window_minutes: 60,
  route_id: '335E'
});
```

### Example: Get ETA Prediction

```typescript
const response = await fetchEta({
  route_id: '335E',
  direction_id: 0,
  from_stop_id: '20558',
  to_stop_id: '29374',
  when: '2025-11-18T14:30:00Z' // Optional, defaults to now
});

console.log(`Predicted duration: ${response.prediction.predicted_duration_sec}s`);
console.log(`Confidence: ${response.prediction.confidence}`);
```

### Error Handling

The API client includes custom error types:

```typescript
import {
  isBMTCApiError,
  isNetworkError,
  isTimeoutError,
  getUserErrorMessage
} from '@/src/api';

try {
  const response = await fetchStops();
} catch (error) {
  if (isBMTCApiError(error)) {
    // Handle API errors (400, 404, 500, etc.)
    if (error.is('not_found')) {
      console.log('Resource not found');
    }
    console.error(error.getUserMessage());
  } else if (isNetworkError(error)) {
    // Handle network failures
    console.error('Check your internet connection');
  } else if (isTimeoutError(error)) {
    // Handle timeouts
    console.error('Request timed out');
  }
}
```

## Available API Functions

### `fetchStops(params?)`
Query GTFS stops with filtering and pagination.

**Parameters:**
- `bbox?: string` - Bounding box filter (min_lat,min_lon,max_lat,max_lon)
- `route_id?: string` - Filter stops served by this route
- `limit?: number` - Max results per page (default 100, max 1000)
- `offset?: number` - Pagination offset (default 0)

**Returns:** `Promise<StopsListResponse>`

### `fetchRoutes(params?)`
Query GTFS routes with filtering and pagination.

**Parameters:**
- `stop_id?: string` - Filter routes serving this stop
- `route_type?: number` - Filter by GTFS route type (3 = bus)
- `limit?: number` - Max results per page (default 100, max 1000)
- `offset?: number` - Pagination offset (default 0)

**Returns:** `Promise<RoutesListResponse>`

### `fetchStopSchedule(stopId, params?)`
Get scheduled departures for a stop from GTFS data.

**Parameters:**
- `stopId: string` - GTFS stop identifier (required)
- `when?: string` - ISO-8601 UTC timestamp (defaults to server "now")
- `time_window_minutes?: number` - Look-ahead window (default 60, max 180)
- `route_id?: string` - Filter departures by route

**Returns:** `Promise<ScheduleResponse>`

### `fetchEta(params)`
Query ETA with ML predictions.

**Parameters:**
- `route_id: string` - GTFS route identifier (required)
- `direction_id: number` - Direction ID: 0 or 1 (required)
- `from_stop_id: string` - Origin stop ID (required)
- `to_stop_id: string` - Destination stop ID (required)
- `when?: string` - ISO-8601 UTC timestamp (optional)

**Returns:** `Promise<ETAResponseV11>`

### `postRideSummary(request, apiKey, idempotencyKey)`
Submit ride data for ML learning (requires authentication).

**Parameters:**
- `request: PostRideSummaryRequest` - Ride data with segments
- `apiKey: string` - Backend API key
- `idempotencyKey: string` - UUIDv4 for idempotency

**Returns:** `Promise<PostRideSummaryResponse>`

**Example:**
```typescript
import { postRideSummary, buildSegmentsFromStopEvents } from '@/src/api';
import { getApiKey, getDeviceBucket, generateIdempotencyKey, DEFAULT_MAPMATCH_CONFIDENCE } from '@/src/config/ride';

// Build segments from GPS stop events
const segments = buildSegmentsFromStopEvents(stopEvents, DEFAULT_MAPMATCH_CONFIDENCE);

// Submit to backend
const response = await postRideSummary(
  {
    route_id: '335E',
    direction_id: 0,
    device_bucket: await getDeviceBucket(),
    segments: segments,
  },
  getApiKey(),
  generateIdempotencyKey()
);

console.log(`Accepted: ${response.accepted_segments}, Rejected: ${response.rejected_segments}`);
```

## GPS Stop Detection

The app includes automatic stop visit detection using GPS geofencing (50m radius).

### Geospatial Utilities

Pure functions for distance calculation and proximity detection:

```typescript
import {
  haversineDistanceMeters,
  findNearestStop,
  updateStopProximityState
} from '@/src/domain/geo';
import type { LatLon, StopWithCoords, ProximityState } from '@/src/domain/geo';

// Calculate distance between two coordinates
const distance = haversineDistanceMeters(
  { lat: 12.9716, lon: 77.5946 },  // Position A
  { lat: 12.9756, lon: 77.6064 }   // Position B
);
// Returns: 3769 meters

// Find nearest stop from current position
const nearest = findNearestStop(
  { lat: 12.9720, lon: 77.5950 },  // Current position
  stops  // Array of StopWithCoords
);
// Returns: { stopId: '20558', distanceMeters: 33.4 }

// Track proximity state for geofencing
const newState = updateStopProximityState(
  { kind: 'outside' },           // Previous state
  '20558',                       // Nearest stop ID
  45,                            // Distance in meters
  50                             // Radius threshold
);
// Returns: { kind: 'inside', stopId: '20558' } (entered stop)
```

### useStopDetection Hook

Automatically detects and records stop visits during an active trip:

```typescript
import { useStopDetection } from '@/src/hooks';

function TripScreen() {
  const { session, recordStopVisit } = useTripSession();
  const routeStops = useRouteStops(session?.route_id, session?.direction_id);

  // Automatically detect and record stop visits
  const { isRunning, lastStopId, error } = useStopDetection({
    active: !!session,                    // Only active during trip
    routeId: session?.route_id || '',
    directionId: session?.direction_id || 0,
    stops: routeStops.map(s => ({
      stopId: s.stop_id,
      coords: { lat: s.stop_lat, lon: s.stop_lon }
    })),
    recordStopVisit,                      // Callback from useTripSession
    radiusMeters: 50,                     // Optional, default 50m
  });

  return (
    <View>
      {isRunning && <Text>GPS Tracking: Active</Text>}
      {lastStopId && <Text>Last Stop: {lastStopId}</Text>}
      {error && <Text>Error: {error.message}</Text>}
    </View>
  );
}
```

**Features:**
- 50m proximity radius (configurable)
- Automatic enter/exit detection
- Handles stop switching without leaving radius
- Graceful permission error handling
- Battery-efficient (only active during trips)

## Developer Tools

### Trip Debug Screen (Dev-only)

Developer-focused screen for inspecting trip session data and API submissions. Only visible in `__DEV__` mode.

**Access:** Tap the red bug button (bottom-right) on the Home screen.

**Features:**
- View current/last trip session (route_id, direction_id)
- Inspect recorded stop events with timestamps
- See segments sent in ride summary requests
- View API response (accepted/rejected counts)
- Raw JSON view for detailed inspection

**Hook Integration:**
```typescript
import { useTripSession } from '@/src/hooks';

const { lastRequest, lastResponse } = useTripSession();
// lastRequest: PostRideSummaryRequest | undefined
// lastResponse: PostRideSummaryResponse | undefined
```

Debug state persists after trip ends and clears when a new trip starts.

## Development

### Run Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/domain/geo.test.ts

# Run tests with coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

**Test Coverage:**
- Domain utilities: `geo.test.ts` (41 tests), `segments.test.ts`
- React hooks: `useStopDetection.test.ts` (38 tests), `useTripSession.test.ts` (47 tests, including debug state)
- Screens: `TripTrackingScreen.test.tsx` (38 tests), `TripDebugScreen.test.tsx` (16 tests), `HomeScreen.test.tsx`
- Navigation: `RoutesScreen.test.tsx` (27 tests, including 13 search tests and 5 Trip Tracking navigation tests)
- API client: `client.test.ts`
- Components: Various component tests
- **Total:** 393 tests (384 passed, 6 skipped, 3 pre-existing failures)

### Run TypeScript Checks

```bash
npm run tsc
```

### Linting

```bash
npm run lint
```

### Clear Cache

If you encounter build issues:

```bash
npm start -- --clear
```

## Building for Production

### iOS

```bash
npx expo build:ios
```

### Android

```bash
npx expo build:android
```

Refer to [Expo documentation](https://docs.expo.dev/build/introduction/) for detailed build instructions.

## Connecting to Backend

### Local Development

1. Ensure the backend is running:
   ```bash
   cd ../backend
   uv run uvicorn app.main:app --reload
   ```

2. The app will connect to `http://localhost:8000` by default

### iOS Simulator Gotcha

iOS Simulator can access `localhost` directly. No special configuration needed.

### Android Emulator Gotcha

Android Emulator cannot access `localhost` directly. You need to use `10.0.2.2` instead:

```bash
# In .env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
```

Or use your machine's local network IP address:
```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:8000
```

### Physical Device

When testing on a physical device, use your machine's local network IP:

```bash
# Find your IP address
# macOS/Linux: ifconfig | grep "inet "
# Windows: ipconfig

# In .env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:8000
```

**Important:** Ensure your phone and development machine are on the same WiFi network.

## Troubleshooting

### "ENOSPC: System limit for number of file watchers reached" (Linux)

This error occurs on Linux systems when the inotify watch limit is too low for Metro bundler.

**Temporary fix (until next reboot):**
```bash
sudo sysctl fs.inotify.max_user_watches=524288
sudo sysctl fs.inotify.max_queued_events=16384
sudo sysctl fs.inotify.max_user_instances=8192
```

**Permanent fix:**
```bash
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
echo "fs.inotify.max_queued_events=16384" | sudo tee -a /etc/sysctl.conf
echo "fs.inotify.max_user_instances=8192" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

After applying the fix, run `npm start` again.

### "Network request failed" Error

1. Check that the backend is running
2. Verify the `EXPO_PUBLIC_API_BASE_URL` in `.env`
3. For Android Emulator, use `10.0.2.2` instead of `localhost`
4. For physical devices, use your machine's local network IP

### "Cannot find module" Errors

1. Clear cache: `npm start -- --clear`
2. Reinstall dependencies: `rm -rf node_modules && npm install`
3. Restart Metro bundler

### TypeScript Errors

1. Run `npm run tsc` to see detailed type errors
2. Check that all imports use the correct paths
3. Ensure `tsconfig.json` is properly configured

## Learn More

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [BMTC Transit API Documentation](../docs/api.md)

## License

See the main project README for license information.
