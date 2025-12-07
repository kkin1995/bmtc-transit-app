# BMTC Transit Mobile App

React Native mobile application for the BMTC Transit API. Built with Expo and TypeScript.

## Features

- **Typed API Client**: Fully typed HTTP client for all backend endpoints
- **GTFS Discovery**: Browse stops and routes from GTFS data
- **Schedule Lookup**: View scheduled departures for any stop
- **ETA Predictions**: Get ML-powered travel time estimates
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Trip Planning Flow**: Map-first UX with destination selection sheet

### Home Screen Flow

1. **Idle state**: User sees map with "Where to?" button
2. **Destination selection**: Tap "Where to?" → Bottom sheet with nearby stops appears → Select destination
3. **Journey selection** (coming soon): View suggested routes and journeys
4. **Active trip** (coming soon): Real-time trip tracking and ride submission

**Key hooks**: `useHomePlanningState` (trip planning state machine), `useTripSession` (active trip tracking), `useUserLocation` (location permissions)

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
│   │   ├── index.tsx        # Home screen (stops example)
│   │   ├── two.tsx          # Routes screen (placeholder)
│   │   └── _layout.tsx      # Tab layout configuration
│   ├── _layout.tsx          # Root layout
│   └── +html.tsx            # HTML template
├── src/
│   ├── api/
│   │   ├── client.ts        # API client functions
│   │   ├── types.ts         # TypeScript type definitions
│   │   ├── errors.ts        # Error classes and utilities
│   │   └── index.ts         # Public exports
│   ├── config/
│   │   └── api.ts           # API configuration
│   ├── components/          # Shared components
│   └── utils/               # Utility functions
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

Edit `.env` and set your API base URL:

```bash
# Development (local backend)
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000

# Production
# EXPO_PUBLIC_API_BASE_URL=https://api.bmtc-transit.example.com
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

## Development

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
