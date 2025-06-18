# Mobile App Architecture - BMTC Transit App

## Overview

The mobile app architecture is designed for React Native to support both Android
and iOS platforms with offline-first capabilities, efficient background location
tracking, and optimized battery usage. The architecture prioritizes user
experience, data privacy, and system reliability.

## Application Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        UI Components                                    │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │     Home        │  │      Map        │  │     Profile     │          │  │
│  │  │   Dashboard     │  │     View        │  │   Management    │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Route Search  │  │ • Real-time     │  │ • Privacy       │          │  │
│  │  │ • Quick Access  │  │   Vehicle       │  │   Settings      │          │  │
│  │  │ • Notifications │  │   Tracking      │  │ • Achievements  │          │  │
│  │  │ • Leaderboards  │  │ • Stop Info     │  │ • Statistics    │          │  │
│  │  └─────────────────┘  │ • Route Paths   │  └─────────────────┘          │  │
│  │                       │ • User Location │                               │  │
│  │  ┌─────────────────┐  │ • Smooth        │  ┌─────────────────┐          │  │
│  │  │     Trip        │  │   Animations    │  │   Settings      │          │  │
│  │  │   Planning      │  └─────────────────┘  │    Screen       │          │  │
│  │  │                 │                       │                 │          │  │
│  │  │ • Route Options │  ┌─────────────────┐  │ • App Prefs     │          │  │
│  │  │ • ETA Display   │  │   Reporting     │  │ • Location      │          │  │
│  │  │ • Navigation    │  │     Screen      │  │   Permissions   │          │  │
│  │  │ • Alternatives  │  │                 │  │ • Data Usage    │          │  │
│  │  └─────────────────┘  │ • Service       │  │ • Accessibility │          │  │
│  │                       │   Issues        │  └─────────────────┘          │  │
│  │                       │ • Crowding      │                               │  │
│  │                       │ • Vehicle       │                               │  │
│  │                       │   Condition     │                               │  │
│  │                       └─────────────────┘                               │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Navigation & Routing                               │  │
│  │                                                                         │  │
│  │  • React Navigation 6                                                   │  │
│  │  • Deep Linking Support                                                 │  │
│  │  • Tab-based Navigation                                                 │  │
│  │  • Modal Overlays                                                       │  │
│  │  • Screen State Management                                              │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                         STATE MANAGEMENT LAYER                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Redux Toolkit Store                             │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │     User        │  │     Routes      │  │   Real-time     │          │  │
│  │  │     Slice       │  │     Slice       │  │     Slice       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Profile Data  │  │ • Route Info    │  │ • Vehicle       │          │  │
│  │  │ • Preferences   │  │ • Stop Details  │  │   Locations     │          │  │
│  │  │ • Auth Status   │  │ • Trip Plans    │  │ • Live Updates  │          │  │
│  │  │ • Privacy       │  │ • Favorites     │  │ • Connection    │          │  │
│  │  │   Settings      │  │ • History       │  │   Status        │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Location      │  │  Gamification   │  │    Offline      │          │  │
│  │  │     Slice       │  │     Slice       │  │     Slice       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • GPS Status    │  │ • Points/Level  │  │ • Cached Data   │          │  │
│  │  │ • Sharing State │  │ • Achievements  │  │ • Sync Queue    │          │  │
│  │  │ • Background    │  │ • Leaderboards  │  │ • Offline Mode  │          │  │
│  │  │   Tracking      │  │ • Streaks       │  │ • Pending       │          │  │
│  │  │ • Permission    │  │ • Progress      │  │   Actions       │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                     Middleware & Enhancers                             │  │
│  │                                                                         │  │
│  │  • Redux Persist (for offline data)                                     │  │
│  │  • Redux Thunk (for async actions)                                      │  │
│  │  • Custom Location Middleware                                           │  │
│  │  • Real-time Sync Middleware                                            │  │
│  │  • Privacy Filtering Middleware                                         │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                        BUSINESS LOGIC LAYER                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                         Service Layer                                   │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Location      │  │   Real-time     │  │     Route       │          │  │
│  │  │   Service       │  │   Service       │  │    Service      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • GPS Manager   │  │ • WebSocket     │  │ • Route Search  │          │  │
│  │  │ • Background    │  │   Connection    │  │ • Stop Lookup   │          │  │
│  │  │   Tracking      │  │ • Live Updates  │  │ • Trip Planning │          │  │
│  │  │ • Geofencing    │  │ • Notifications │  │ • Favorites     │          │  │
│  │  │ • Privacy       │  │ • Reconnection  │  │ • History       │          │  │
│  │  │   Protection    │  │   Logic         │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Offline       │  │   Analytics     │  │   Notification  │          │  │
│  │  │   Service       │  │   Service       │  │    Service      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Data Sync     │  │ • Usage         │  │ • Push Notifs   │          │  │
│  │  │ • Cache Mgmt    │  │   Tracking      │  │ • Local Alerts  │          │  │
│  │  │ • Conflict      │  │ • Performance   │  │ • Deep Links    │          │  │
│  │  │   Resolution    │  │   Metrics       │  │ • Scheduling    │          │  │
│  │  │ • Queue Mgmt    │  │ • Error         │  │ • User Prefs    │          │  │
│  │  │                 │  │   Reporting     │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                         DATA ACCESS LAYER                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        API & Network Layer                             │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │    REST API     │  │   WebSocket     │  │   Background    │          │  │
│  │  │    Client       │  │    Client       │  │     Sync        │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • HTTP Client   │  │ • Socket.IO     │  │ • Queue Mgmt    │          │  │
│  │  │ • Auth          │  │ • Auto-reconnect│  │ • Retry Logic   │          │  │
│  │  │   Interceptors  │  │ • Event         │  │ • Conflict      │          │  │
│  │  │ • Rate Limiting │  │   Handling      │  │   Resolution    │          │  │
│  │  │ • Error         │  │ • Channel       │  │ • Data Merging  │          │  │
│  │  │   Handling      │  │   Management    │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Local Storage Layer                             │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │    SQLite       │  │   AsyncStorage  │  │     Secure      │          │  │
│  │  │   Database      │  │     (Redux      │  │    Storage      │          │  │
│  │  │                 │  │   Persist)      │  │                 │          │  │
│  │  │ • Route Data    │  │                 │  │ • Auth Tokens   │          │  │
│  │  │ • Stop Info     │  │ • App State     │  │ • User Prefs    │          │  │
│  │  │ • Offline       │  │ • Preferences   │  │ • Privacy       │          │  │
│  │  │   Cache         │  │ • Settings      │  │   Settings      │          │  │
│  │  │ • Trip History  │  │ • Cache Meta    │  │ • Biometric     │          │  │
│  │  │ • User Data     │  │                 │  │   Keys          │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                       PLATFORM INTEGRATION LAYER                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Native Modules & Services                         │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Location      │  │    Battery      │  │   Permissions   │          │  │
│  │  │   Services      │  │  Optimization   │  │    Manager      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • GPS/GNSS      │  │ • Background    │  │ • Location      │          │  │
│  │  │ • Background    │  │   Tasks         │  │ • Storage       │          │  │
│  │  │   Location      │  │ • Wake Locks    │  │ • Notifications │          │  │
│  │  │ • Geofencing    │  │ • Power Mgmt    │  │ • Camera        │          │  │
│  │  │ • Movement      │  │ • CPU          │  │ • Network       │          │  │
│  │  │   Detection     │  │   Throttling    │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Push          │  │   Accessibility │  │   Analytics     │          │  │
│  │  │ Notifications   │  │   Services      │  │   & Crash       │          │  │
│  │  │                 │  │                 │  │   Reporting     │          │  │
│  │  │ • FCM/APNS      │  │ • Screen        │  │                 │          │  │
│  │  │ • Local Notifs  │  │   Reader        │  │ • Performance   │          │  │
│  │  │ • Scheduling    │  │ • Voice         │  │   Monitoring    │          │  │
│  │  │ • Deep Links    │  │   Guidance      │  │ • Error         │          │  │
│  │  │ • Badge         │  │ • Haptic        │  │   Tracking      │          │  │
│  │  │   Management    │  │   Feedback      │  │ • User          │          │  │
│  │  └─────────────────┘  └─────────────────┘  │   Analytics     │          │  │
│  │                                            └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Location Service Architecture

```typescript
interface LocationService {
  startTracking(options: LocationTrackingOptions): Promise<TrackingSession>;
  stopTracking(sessionId: string): Promise<void>;
  getCurrentLocation(): Promise<LocationData>;
  enableBackgroundTracking(): Promise<void>;
  optimizeBatteryUsage(): Promise<void>;
}

interface LocationTrackingOptions {
  accuracy: 'high' | 'medium' | 'low';
  intervalMs: number;
  distanceFilter: number; // meters
  backgroundMode: boolean;
  privacyLevel: 'high' | 'medium' | 'low';
  routeId?: string;
  direction?: string;
}

class LocationService implements LocationService {
  private geolocation: Geolocation;
  private backgroundJob: BackgroundJob;
  private batteryOptimizer: BatteryOptimizer;
  private privacyFilter: PrivacyFilter;

  async startTracking(
    options: LocationTrackingOptions
  ): Promise<TrackingSession> {
    // Request necessary permissions
    const permissions = await this.requestLocationPermissions();
    if (!permissions.granted) {
      throw new LocationPermissionError('Location permission required');
    }

    // Configure tracking parameters based on options
    const trackingConfig = this.optimizeTrackingConfig(options);

    // Start location updates
    const sessionId = await this.startLocationUpdates(trackingConfig);

    // Enable background tracking if requested
    if (options.backgroundMode) {
      await this.enableBackgroundTracking();
    }

    return {
      sessionId,
      startedAt: new Date(),
      config: trackingConfig,
    };
  }

  private optimizeTrackingConfig(
    options: LocationTrackingOptions
  ): LocationConfig {
    // Battery-optimized configuration
    let config: LocationConfig = {
      accuracy: this.mapAccuracyToPlatform(options.accuracy),
      interval: options.intervalMs,
      fastestInterval: options.intervalMs / 2,
      displacement: options.distanceFilter,
      showLocationDialog: false,
      enableHighAccuracy: options.accuracy === 'high',
    };

    // Adjust for battery optimization
    if (this.batteryOptimizer.isLowBattery()) {
      config = this.batteryOptimizer.adjustConfigForLowBattery(config);
    }

    return config;
  }

  async enableBackgroundTracking(): Promise<void> {
    // Platform-specific background setup
    if (Platform.OS === 'android') {
      await this.setupAndroidBackgroundTracking();
    } else {
      await this.setupiOSBackgroundTracking();
    }
  }

  private async setupAndroidBackgroundTracking(): Promise<void> {
    // Request background location permission
    const backgroundPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
    );

    if (backgroundPermission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Background location permission required');
    }

    // Start foreground service with notification
    await BackgroundJob.start({
      taskName: 'LocationTracking',
      taskTitle: 'BMTC Transit - Sharing Location',
      taskDesc: 'Helping fellow commuters with real-time transit info',
      taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
      },
      color: '#0066cc',
      linkingURI: 'bmtctransit://location-sharing',
      parameters: {
        delay: 5000,
      },
    });
  }

  private async setupiOSBackgroundTracking(): Promise<void> {
    // Configure background modes in Info.plist required:
    // - location
    // - background-app-refresh

    const backgroundRefresh = await BackgroundAppRefresh.requestPermission();
    if (backgroundRefresh !== 'authorized') {
      throw new Error('Background app refresh permission required');
    }

    // Register background task
    await BackgroundTask.define(() => {
      console.log('Running background location task');
      this.processQueuedLocationUpdates();
    });
  }
}
```

### 2. Battery Optimization System

```typescript
interface BatteryOptimizer {
  isLowBattery(): boolean;
  adjustTrackingFrequency(): LocationConfig;
  enablePowerSavingMode(): Promise<void>;
  optimizeNetworkUsage(): NetworkConfig;
  scheduleSync(): SyncSchedule;
}

class BatteryOptimizer implements BatteryOptimizer {
  private batteryLevel: number = 100;
  private isCharging: boolean = false;
  private powerMode: 'normal' | 'low_power' | 'ultra_low_power' = 'normal';

  constructor() {
    this.initializeBatteryMonitoring();
  }

  private initializeBatteryMonitoring(): void {
    DeviceInfo.getBatteryLevel().then(level => {
      this.batteryLevel = level * 100;
    });

    DeviceInfo.isCharging().then(charging => {
      this.isCharging = charging;
    });

    // Monitor battery changes
    const batteryEventEmitter = new NativeEventEmitter(
      NativeModules.BatteryManager
    );
    batteryEventEmitter.addListener('BatteryLevelDidChange', batteryInfo => {
      this.batteryLevel = batteryInfo.level * 100;
      this.adjustPowerMode();
    });
  }

  isLowBattery(): boolean {
    return this.batteryLevel < 20 && !this.isCharging;
  }

  adjustTrackingFrequency(): LocationConfig {
    let baseConfig: LocationConfig = {
      interval: 5000, // 5 seconds
      displacement: 10, // 10 meters
      accuracy: 'high',
    };

    if (this.batteryLevel < 15) {
      // Ultra low power mode
      return {
        ...baseConfig,
        interval: 30000, // 30 seconds
        displacement: 50, // 50 meters
        accuracy: 'low',
      };
    } else if (this.batteryLevel < 30) {
      // Low power mode
      return {
        ...baseConfig,
        interval: 15000, // 15 seconds
        displacement: 25, // 25 meters
        accuracy: 'medium',
      };
    }

    return baseConfig;
  }

  optimizeNetworkUsage(): NetworkConfig {
    return {
      batchSize: this.isLowBattery() ? 10 : 5,
      compressionEnabled: this.isLowBattery(),
      wifiOnlySync: this.batteryLevel < 10,
      retryBackoffMultiplier: this.isLowBattery() ? 2.0 : 1.5,
    };
  }

  private adjustPowerMode(): void {
    if (this.batteryLevel < 10 && !this.isCharging) {
      this.powerMode = 'ultra_low_power';
      this.enableUltraLowPowerMode();
    } else if (this.batteryLevel < 20 && !this.isCharging) {
      this.powerMode = 'low_power';
      this.enableLowPowerMode();
    } else {
      this.powerMode = 'normal';
    }
  }

  private async enableUltraLowPowerMode(): Promise<void> {
    // Reduce location update frequency
    LocationService.updateConfig({
      interval: 60000, // 1 minute
      displacement: 100, // 100 meters
      accuracy: 'low',
    });

    // Reduce network activity
    NetworkManager.setBatchSize(20);
    NetworkManager.enableWifiOnlyMode();

    // Disable animations and visual effects
    UIManager.setLayoutAnimationEnabledExperimental(false);

    // Show power saving notification
    NotificationService.showPowerSavingNotification();
  }
}
```

### 3. Offline Data Management

```typescript
interface OfflineManager {
  enableOfflineMode(): Promise<void>;
  syncPendingData(): Promise<SyncResult>;
  cacheEssentialData(): Promise<void>;
  handleConflictResolution(): Promise<void>;
  getOfflineCapabilities(): OfflineCapabilities;
}

interface OfflineCapabilities {
  routeSearch: boolean;
  basicNavigation: boolean;
  stopInformation: boolean;
  tripPlanning: boolean;
  locationSharing: boolean; // queued for later sync
}

class OfflineManager implements OfflineManager {
  private sqliteDB: SQLiteDatabase;
  private asyncStorage: AsyncStorageStatic;
  private syncQueue: SyncQueue;

  async enableOfflineMode(): Promise<void> {
    // Cache essential route and stop data
    await this.cacheEssentialData();

    // Initialize sync queue for offline actions
    this.syncQueue.initialize();

    // Setup periodic sync attempts
    this.schedulePeriodicSync();

    // Update app state
    store.dispatch(setOfflineMode(true));
  }

  async cacheEssentialData(): Promise<void> {
    try {
      // Cache popular routes and their stops
      const popularRoutes = await APIClient.getPopularRoutes();
      await this.sqliteDB.insertRoutes(popularRoutes);

      // Cache stop information for offline lookup
      const stops = await APIClient.getAllStops();
      await this.sqliteDB.insertStops(stops);

      // Cache route geometries for basic map display
      const routeGeometries = await APIClient.getRouteGeometries();
      await this.sqliteDB.insertRouteGeometries(routeGeometries);

      // Cache user's favorite routes and stops
      const userFavorites = await APIClient.getUserFavorites();
      await this.sqliteDB.insertUserFavorites(userFavorites);

      console.log('Essential data cached successfully');
    } catch (error) {
      console.error('Failed to cache essential data:', error);
    }
  }

  async syncPendingData(): Promise<SyncResult> {
    const pendingActions = await this.syncQueue.getPendingActions();
    const results: ActionResult[] = [];

    for (const action of pendingActions) {
      try {
        const result = await this.executeAction(action);
        results.push(result);

        if (result.success) {
          await this.syncQueue.markCompleted(action.id);
        }
      } catch (error) {
        results.push({
          actionId: action.id,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      totalActions: pendingActions.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
      results,
    };
  }

  private async executeAction(action: PendingAction): Promise<ActionResult> {
    switch (action.type) {
      case 'LOCATION_UPDATE':
        return await APIClient.submitLocationUpdate(action.data);

      case 'SERVICE_REPORT':
        return await APIClient.submitServiceReport(action.data);

      case 'USER_FEEDBACK':
        return await APIClient.submitUserFeedback(action.data);

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  getOfflineCapabilities(): OfflineCapabilities {
    return {
      routeSearch: true, // Can search cached routes
      basicNavigation: true, // Can provide basic directions
      stopInformation: true, // Can show stop details
      tripPlanning: true, // Can plan trips with cached data
      locationSharing: false, // Requires network connection
    };
  }
}
```

### 4. Privacy Protection Layer

```typescript
interface PrivacyManager {
  applyPrivacyFilters(data: LocationData): FilteredLocationData;
  checkConsentStatus(): ConsentStatus;
  anonymizeData(data: UserData): AnonymizedData;
  handleDataDeletion(): Promise<void>;
  getPrivacySettings(): PrivacySettings;
}

class PrivacyManager implements PrivacyManager {
  private encryptionKey: string;
  private userConsent: Map<string, boolean>;

  applyPrivacyFilters(data: LocationData): FilteredLocationData {
    const privacyLevel = this.getPrivacyLevel();

    let filteredData = { ...data };

    switch (privacyLevel) {
      case 'high':
        // High privacy: significant data obfuscation
        filteredData = this.applyHighPrivacyFilter(filteredData);
        break;

      case 'medium':
        // Medium privacy: moderate obfuscation
        filteredData = this.applyMediumPrivacyFilter(filteredData);
        break;

      case 'low':
        // Low privacy: minimal obfuscation
        filteredData = this.applyLowPrivacyFilter(filteredData);
        break;
    }

    // Always remove device identifiers
    delete filteredData.deviceId;
    delete filteredData.userId;

    return filteredData;
  }

  private applyHighPrivacyFilter(data: LocationData): LocationData {
    return {
      ...data,
      // Reduce location precision (±50m)
      latitude: this.reduceLocationPrecision(data.latitude, 0.0005),
      longitude: this.reduceLocationPrecision(data.longitude, 0.0005),

      // Add temporal obfuscation (±30 seconds)
      timestamp: this.addTemporalNoise(data.timestamp, 30000),

      // Round speed to reduce uniqueness
      speed: Math.round(data.speed / 5) * 5,

      // Reduce heading precision
      heading: Math.round(data.heading / 15) * 15,
    };
  }

  private reduceLocationPrecision(coordinate: number, noise: number): number {
    // Add Gaussian noise to coordinate
    const randomNoise = this.gaussianRandom(0, noise);
    return parseFloat((coordinate + randomNoise).toFixed(6));
  }

  private addTemporalNoise(timestamp: number, maxNoiseMs: number): number {
    const noise = Math.random() * maxNoiseMs - maxNoiseMs / 2;
    return Math.round(timestamp + noise);
  }

  async handleDataDeletion(): Promise<void> {
    // Delete all local user data
    await this.asyncStorage.clear();

    // Clear SQLite database
    await this.sqliteDB.dropAllTables();
    await this.sqliteDB.recreateTables();

    // Clear secure storage
    await SecureStorage.clearAll();

    // Request server-side data deletion
    await APIClient.requestDataDeletion();

    // Reset app state
    store.dispatch(resetAppState());
  }
}
```

### 5. Real-time Communication Manager

```typescript
interface RealTimeManager {
  connect(): Promise<ConnectionResult>;
  disconnect(): Promise<void>;
  subscribeToRoute(routeId: string, direction: string): Promise<void>;
  subscribeToStop(stopId: string): Promise<void>;
  handleReconnection(): Promise<void>;
  processLiveUpdate(update: LiveUpdate): Promise<void>;
}

class RealTimeManager implements RealTimeManager {
  private socket: SocketIOClient.Socket;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private subscriptions: Set<string> = new Set();

  async connect(): Promise<ConnectionResult> {
    try {
      const authToken = await SecureStorage.getItem('auth_token');

      this.socket = io(CONFIG.WEBSOCKET_URL, {
        transports: ['websocket'],
        auth: {
          token: authToken,
        },
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      this.setupEventHandlers();

      return new Promise((resolve, reject) => {
        this.socket.on('connect', () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          store.dispatch(setConnectionStatus('connected'));
          resolve({ success: true, connectionId: this.socket.id });
        });

        this.socket.on('connect_error', error => {
          console.error('WebSocket connection error:', error);
          store.dispatch(setConnectionStatus('error'));
          reject(error);
        });
      });
    } catch (error) {
      throw new ConnectionError('Failed to establish WebSocket connection');
    }
  }

  private setupEventHandlers(): void {
    this.socket.on('location_update', data => {
      store.dispatch(updateVehicleLocation(data));
      this.updateMapMarkers(data);
    });

    this.socket.on('stop_arrival', data => {
      store.dispatch(updateStopArrivals(data));
      this.showArrivalNotification(data);
    });

    this.socket.on('service_alert', data => {
      store.dispatch(addServiceAlert(data));
      this.showServiceAlert(data);
    });

    this.socket.on('user_notification', data => {
      this.handleUserNotification(data);
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      store.dispatch(setConnectionStatus('disconnected'));
      this.handleDisconnection();
    });

    this.socket.on('reconnect', () => {
      console.log('WebSocket reconnected');
      this.restoreSubscriptions();
    });
  }

  async subscribeToRoute(routeId: string, direction: string): Promise<void> {
    const channelName = `route:${routeId}:${direction}`;

    this.socket.emit('subscribe', {
      channel: channelName,
      filters: {
        route_id: routeId,
        direction: direction,
      },
    });

    this.subscriptions.add(channelName);
    console.log(`Subscribed to route channel: ${channelName}`);
  }

  private async restoreSubscriptions(): Promise<void> {
    // Restore all previous subscriptions after reconnection
    for (const subscription of this.subscriptions) {
      this.socket.emit('subscribe', { channel: subscription });
    }
  }

  private updateMapMarkers(locationUpdate: LocationUpdate): void {
    // Update vehicle markers on the map
    const { vehicle_id, location, route_id } = locationUpdate.data;

    MapManager.updateVehicleMarker(vehicle_id, {
      coordinate: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      rotation: location.heading,
      routeId: route_id,
    });
  }
}
```

## Performance Optimization

### 1. Memory Management

```typescript
class MemoryManager {
  private memoryWarningThreshold = 0.8; // 80% of available memory

  constructor() {
    this.setupMemoryMonitoring();
  }

  private setupMemoryMonitoring(): void {
    // Monitor memory usage on iOS
    if (Platform.OS === 'ios') {
      DeviceEventEmitter.addListener('MemoryWarning', () => {
        this.handleMemoryWarning();
      });
    }

    // Periodic memory check for Android
    if (Platform.OS === 'android') {
      setInterval(() => {
        this.checkMemoryUsage();
      }, 30000); // Every 30 seconds
    }
  }

  private async handleMemoryWarning(): Promise<void> {
    console.log('Memory warning received, clearing caches');

    // Clear image cache
    ImageCacheManager.clearCache();

    // Clear old location data
    LocationCache.clearOldEntries();

    // Reduce map tile cache
    MapManager.reduceTileCache();

    // Clear unused Redux state
    store.dispatch(clearNonEssentialState());
  }
}
```

### 2. Rendering Optimization

```typescript
// Optimized map component with virtualization
const VehicleMapView: React.FC<MapProps> = memo(({ vehicles, viewport }) => {
  // Only render vehicles within viewport bounds
  const visibleVehicles = useMemo(() => {
    return vehicles.filter(vehicle =>
      isWithinBounds(vehicle.location, viewport.bounds)
    );
  }, [vehicles, viewport.bounds]);

  // Virtualize markers for large datasets
  const virtualizedMarkers = useMemo(() => {
    if (visibleVehicles.length > 100) {
      return virtualizeMarkers(visibleVehicles, viewport.zoom);
    }
    return visibleVehicles;
  }, [visibleVehicles, viewport.zoom]);

  return (
    <MapView
      region={viewport.region}
      onRegionChangeComplete={handleRegionChange}
      loadingEnabled={false}
      cacheEnabled={true}
      maxZoomLevel={18}
      minZoomLevel={8}
    >
      {virtualizedMarkers.map(vehicle => (
        <VehicleMarker
          key={vehicle.id}
          vehicle={vehicle}
          onPress={handleVehiclePress}
        />
      ))}
    </MapView>
  );
});
```

This comprehensive mobile app architecture ensures optimal performance, privacy
protection, and user experience for the BMTC Transit App across both Android and
iOS platforms.
