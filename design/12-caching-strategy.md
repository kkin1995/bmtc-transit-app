# Caching Strategy Design - BMTC Transit App

## Overview

The caching strategy is designed to optimize performance, reduce latency, enable offline functionality, and minimize database load for the BMTC Transit App. This multi-layered caching approach ensures efficient data access patterns while maintaining data consistency and freshness for real-time transit information.

## Multi-Layer Caching Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT-SIDE CACHING                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                     Mobile App Cache Layers                            │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │     Memory      │  │    AsyncStorage │  │     SQLite      │          │  │
│  │  │     Cache       │  │   (Redux Persist) │  │   Database      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Active Route  │  │ • User Settings │  │ • Route Data    │          │  │
│  │  │   Data          │  │ • App State     │  │ • Stop Info     │          │  │
│  │  │ • Vehicle       │  │ • Preferences   │  │ • Offline Maps  │          │  │
│  │  │   Locations     │  │ • Cache         │  │ • Trip History  │          │  │
│  │  │ • Recent        │  │   Metadata      │  │ • Favorite      │          │  │
│  │  │   Searches      │  │                 │  │   Routes        │          │  │
│  │  │ • Session Data  │  │                 │  │                 │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ TTL: 5-15 min   │  │ TTL: Persistent │  │ TTL: 7-30 days  │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    HTTP Cache Headers                                   │  │
│  │                                                                         │  │
│  │  • ETag-based validation for static route data                          │  │
│  │  • Cache-Control headers for API responses                              │  │
│  │  • Conditional requests (If-None-Match, If-Modified-Since)              │  │
│  │  • Compression and response optimization                                │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │ HTTP/HTTPS
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                          CDN LAYER                                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        CloudFront CDN                                   │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Static        │  │    API          │  │     Map         │          │  │
│  │  │   Assets        │  │   Responses     │  │     Tiles       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • App Bundles   │  │ • Route Lists   │  │ • Street Maps   │          │  │
│  │  │ • Images        │  │ • Stop Details  │  │ • Satellite     │          │  │
│  │  │ • Icons         │  │ • Public Data   │  │   Imagery       │          │  │
│  │  │ • Manifest      │  │ • Search        │  │ • Route         │          │  │
│  │  │   Files         │  │   Results       │  │   Overlays      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ TTL: 30 days    │  │ TTL: 5-60 min   │  │ TTL: 24 hours   │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Edge Locations (Global)                             │  │
│  │                                                                         │  │
│  │  • Bangalore (Primary)                                                  │  │
│  │  • Mumbai, Delhi (Secondary)                                            │  │
│  │  • Singapore, Tokyo (Tertiary)                                          │  │
│  │  • Custom caching rules per content type                                │  │
│  │  • Geographic optimization for Indian users                             │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                     API GATEWAY CACHE                                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                     Kong Gateway Cache                                 │  │
│  │                                                                         │  │
│  │  • Response caching for GET requests                                    │  │
│  │  • Rate limiting cache                                                  │  │
│  │  • Authentication token cache                                           │  │
│  │  • Request deduplication                                                │  │
│  │  • Circuit breaker state cache                                          │  │
│  │  • API documentation cache                                              │  │
│  │                                                                         │  │
│  │  TTL: 30 seconds - 5 minutes (configurable per endpoint)               │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                    APPLICATION-LEVEL CACHING                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Redis Cluster                                   │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Hot Data      │  │   Session       │  │   Real-time     │          │  │
│  │  │   Cache         │  │   Cache         │  │    Cache        │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Popular       │  │ • User          │  │ • Vehicle       │          │  │
│  │  │   Routes        │  │   Sessions      │  │   Locations     │          │  │
│  │  │ • Frequently    │  │ • WebSocket     │  │ • Live ETAs     │          │  │
│  │  │   Used Stops    │  │   Connections   │  │ • Active        │          │  │
│  │  │ • Search        │  │ • Login Tokens  │  │   Contributors  │          │  │
│  │  │   Results       │  │ • Rate Limit    │  │ • Service       │          │  │
│  │  │ • Trip Plans    │  │   Counters      │  │   Alerts        │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ TTL: 1-6 hours  │  │ TTL: 1-24 hrs   │  │ TTL: 30s-5min   │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Computation   │  │   Geospatial    │  │   Analytics     │          │  │
│  │  │    Cache        │  │     Cache       │  │     Cache       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • ML Model      │  │ • Route         │  │ • Leaderboards  │          │  │
│  │  │   Results       │  │   Geometries    │  │ • Statistics    │          │  │
│  │  │ • Complex       │  │ • Spatial       │  │ • Aggregated    │          │  │
│  │  │   Calculations  │  │   Indexes       │  │   Metrics       │          │  │
│  │  │ • Trip ETAs     │  │ • Geofences     │  │ • Reports       │          │  │
│  │  │ • Route         │  │ • Stop          │  │ • Dashboards    │          │  │
│  │  │   Suggestions   │  │   Proximity     │  │                 │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ TTL: 5-30 min   │  │ TTL: 4-12 hrs   │  │ TTL: 10-60 min  │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                      DATA-LAYER CACHING                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                   Database Query Caching                               │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │  PostgreSQL     │  │    InfluxDB     │  │   PostGIS       │          │  │
│  │  │ Query Cache     │  │   Query Cache   │  │ Spatial Cache   │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Query Plan    │  │ • Time-series   │  │ • Spatial       │          │  │
│  │  │   Cache         │  │   Aggregations  │  │   Query Cache   │          │  │
│  │  │ • Result Set    │  │ • Continuous    │  │ • Geometry      │          │  │
│  │  │   Caching       │  │   Queries       │  │   Objects       │          │  │
│  │  │ • Connection    │  │ • Materialized  │  │ • Spatial       │          │  │
│  │  │   Pooling       │  │   Views         │  │   Indexes       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ TTL: Variable   │  │ TTL: 1-60 min   │  │ TTL: 2-24 hrs   │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Caching Strategies by Data Type

### 1. Static Reference Data

```typescript
interface StaticDataCacheStrategy {
  routes: CacheConfig;
  stops: CacheConfig;
  staticMaps: CacheConfig;
  appAssets: CacheConfig;
}

interface CacheConfig {
  ttl: number;           // Time to live in seconds
  maxSize: number;       // Maximum cache size
  compressionEnabled: boolean;
  invalidationStrategy: 'time' | 'version' | 'event';
  storage: 'memory' | 'disk' | 'hybrid';
}

class StaticDataCacheManager {
  private cacheConfigs: StaticDataCacheStrategy = {
    routes: {
      ttl: 86400,        // 24 hours
      maxSize: 50 * 1024 * 1024,  // 50MB
      compressionEnabled: true,
      invalidationStrategy: 'version',
      storage: 'hybrid'
    },
    stops: {
      ttl: 604800,       // 7 days
      maxSize: 20 * 1024 * 1024,  // 20MB
      compressionEnabled: true,
      invalidationStrategy: 'version',
      storage: 'disk'
    },
    staticMaps: {
      ttl: 2592000,      // 30 days
      maxSize: 100 * 1024 * 1024, // 100MB
      compressionEnabled: false,
      invalidationStrategy: 'time',
      storage: 'disk'
    },
    appAssets: {
      ttl: 2592000,      // 30 days
      maxSize: 200 * 1024 * 1024, // 200MB
      compressionEnabled: true,
      invalidationStrategy: 'version',
      storage: 'disk'
    }
  };

  async cacheRouteData(routes: Route[]): Promise<void> {
    const config = this.cacheConfigs.routes;
    
    // Compress data if enabled
    const data = config.compressionEnabled ? 
      await this.compressData(routes) : routes;
    
    // Store in appropriate cache layer
    if (config.storage === 'hybrid') {
      // Store hot routes in memory, all routes on disk
      const hotRoutes = this.identifyHotRoutes(routes);
      await this.memoryCache.set('hot_routes', hotRoutes, config.ttl);
      await this.diskCache.set('all_routes', data, config.ttl);
    }
    
    // Set version for invalidation
    await this.setDataVersion('routes', this.generateVersion());
  }

  async getRouteData(routeId?: string): Promise<Route[]> {
    const config = this.cacheConfigs.routes;
    
    // Try memory cache first for hot data
    if (config.storage === 'hybrid') {
      const hotRoutes = await this.memoryCache.get('hot_routes');
      if (hotRoutes && (!routeId || this.findInHotRoutes(hotRoutes, routeId))) {
        return this.filterRoutes(hotRoutes, routeId);
      }
    }
    
    // Fall back to disk cache
    const cachedData = await this.diskCache.get('all_routes');
    if (cachedData) {
      const routes = config.compressionEnabled ? 
        await this.decompressData(cachedData) : cachedData;
      return this.filterRoutes(routes, routeId);
    }
    
    // Cache miss - fetch from database
    return await this.fetchAndCacheRoutes(routeId);
  }

  private identifyHotRoutes(routes: Route[]): Route[] {
    // Identify frequently accessed routes based on analytics
    return routes
      .sort((a, b) => b.popularityScore - a.popularityScore)
      .slice(0, 50); // Top 50 routes
  }
}
```

### 2. Real-Time Data Caching

```typescript
interface RealTimeDataCache {
  vehicleLocations: RealTimeCacheConfig;
  serviceAlerts: RealTimeCacheConfig;
  liveETAs: RealTimeCacheConfig;
  userSessions: RealTimeCacheConfig;
}

interface RealTimeCacheConfig extends CacheConfig {
  updateFrequency: number;  // Milliseconds
  staleWhileRevalidate: boolean;
  partitioning: 'route' | 'geographic' | 'user';
}

class RealTimeDataCacheManager {
  private redis: RedisClusterClient;
  private cacheConfigs: RealTimeDataCache = {
    vehicleLocations: {
      ttl: 30,           // 30 seconds
      maxSize: 10 * 1024 * 1024,  // 10MB per partition
      compressionEnabled: false,
      invalidationStrategy: 'time',
      storage: 'memory',
      updateFrequency: 10000,     // 10 seconds
      staleWhileRevalidate: true,
      partitioning: 'route'
    },
    serviceAlerts: {
      ttl: 300,          // 5 minutes
      maxSize: 1 * 1024 * 1024,   // 1MB
      compressionEnabled: true,
      invalidationStrategy: 'event',
      storage: 'memory',
      updateFrequency: 60000,     // 1 minute
      staleWhileRevalidate: true,
      partitioning: 'geographic'
    },
    liveETAs: {
      ttl: 60,           // 1 minute
      maxSize: 5 * 1024 * 1024,   // 5MB
      compressionEnabled: false,
      invalidationStrategy: 'time',
      storage: 'memory',
      updateFrequency: 15000,     // 15 seconds
      staleWhileRevalidate: true,
      partitioning: 'route'
    },
    userSessions: {
      ttl: 3600,         // 1 hour
      maxSize: 1024,     // 1KB per session
      compressionEnabled: false,
      invalidationStrategy: 'event',
      storage: 'memory',
      updateFrequency: 0,         // Event-driven
      staleWhileRevalidate: false,
      partitioning: 'user'
    }
  };

  async updateVehicleLocation(routeId: string, vehicleData: VehicleLocation): Promise<void> {
    const config = this.cacheConfigs.vehicleLocations;
    const cacheKey = `vehicles:${routeId}`;
    
    // Update vehicle location in route-partitioned cache
    await this.redis.hset(cacheKey, vehicleData.vehicleId, JSON.stringify({
      ...vehicleData,
      timestamp: Date.now(),
      ttl: config.ttl
    }));
    
    // Set expiration
    await this.redis.expire(cacheKey, config.ttl);
    
    // Publish update to subscribers
    await this.redis.publish(`vehicle_updates:${routeId}`, JSON.stringify(vehicleData));
  }

  async getVehicleLocations(routeId: string): Promise<VehicleLocation[]> {
    const cacheKey = `vehicles:${routeId}`;
    const cachedData = await this.redis.hgetall(cacheKey);
    
    if (!cachedData || Object.keys(cachedData).length === 0) {
      // Cache miss - trigger background refresh
      this.refreshVehicleLocations(routeId);
      return [];
    }
    
    // Filter out stale data and parse
    const currentTime = Date.now();
    const validVehicles: VehicleLocation[] = [];
    
    for (const [vehicleId, dataStr] of Object.entries(cachedData)) {
      try {
        const data = JSON.parse(dataStr);
        if (currentTime - data.timestamp <= data.ttl * 1000) {
          validVehicles.push(data);
        } else {
          // Remove stale data
          await this.redis.hdel(cacheKey, vehicleId);
        }
      } catch (error) {
        console.error(`Error parsing vehicle data for ${vehicleId}:`, error);
      }
    }
    
    return validVehicles;
  }

  async cacheServiceAlert(alert: ServiceAlert): Promise<void> {
    const config = this.cacheConfigs.serviceAlerts;
    const cacheKey = `alerts:${alert.severity}`;
    
    // Store alert with geographic partitioning
    const alertData = {
      ...alert,
      cachedAt: Date.now()
    };
    
    if (config.compressionEnabled) {
      alertData.data = await this.compressData(alert.data);
    }
    
    await this.redis.zadd(cacheKey, alert.priority, JSON.stringify(alertData));
    await this.redis.expire(cacheKey, config.ttl);
    
    // Invalidate related caches
    await this.invalidateRelatedCaches('service_alerts', alert.affectedRoutes);
  }

  // Stale-while-revalidate pattern
  async getWithStaleWhileRevalidate<T>(
    cacheKey: string, 
    fetchFunction: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    const cachedData = await this.redis.get(cacheKey);
    
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      const age = Date.now() - parsed.timestamp;
      
      if (age < ttl * 1000) {
        // Fresh data
        return parsed.data;
      } else {
        // Stale data - serve it but trigger background refresh
        this.backgroundRefresh(cacheKey, fetchFunction, ttl);
        return parsed.data;
      }
    }
    
    // No cached data - fetch synchronously
    const freshData = await fetchFunction();
    await this.cacheData(cacheKey, freshData, ttl);
    return freshData;
  }

  private async backgroundRefresh<T>(
    cacheKey: string,
    fetchFunction: () => Promise<T>,
    ttl: number
  ): Promise<void> {
    try {
      const freshData = await fetchFunction();
      await this.cacheData(cacheKey, freshData, ttl);
    } catch (error) {
      console.error(`Background refresh failed for ${cacheKey}:`, error);
      // Keep stale data in case of fetch failure
    }
  }
}
```

### 3. Offline Caching Strategy

```typescript
interface OfflineCacheStrategy {
  essentialData: OfflineCacheConfig;
  userData: OfflineCacheConfig;
  mapTiles: OfflineCacheConfig;
  searchIndex: OfflineCacheConfig;
}

interface OfflineCacheConfig extends CacheConfig {
  priority: 'critical' | 'important' | 'nice_to_have';
  downloadStrategy: 'prefetch' | 'on_demand' | 'background';
  syncStrategy: 'immediate' | 'wifi_only' | 'scheduled';
}

class OfflineCacheManager {
  private sqliteDB: SQLiteDatabase;
  private asyncStorage: AsyncStorageStatic;
  
  private cacheConfigs: OfflineCacheStrategy = {
    essentialData: {
      ttl: 604800,       // 7 days
      maxSize: 50 * 1024 * 1024,  // 50MB
      compressionEnabled: true,
      invalidationStrategy: 'version',
      storage: 'disk',
      priority: 'critical',
      downloadStrategy: 'prefetch',
      syncStrategy: 'wifi_only'
    },
    userData: {
      ttl: 2592000,      // 30 days
      maxSize: 10 * 1024 * 1024,  // 10MB
      compressionEnabled: false,
      invalidationStrategy: 'event',
      storage: 'disk',
      priority: 'important',
      downloadStrategy: 'on_demand',
      syncStrategy: 'immediate'
    },
    mapTiles: {
      ttl: 2592000,      // 30 days
      maxSize: 200 * 1024 * 1024, // 200MB
      compressionEnabled: false,
      invalidationStrategy: 'time',
      storage: 'disk',
      priority: 'important',
      downloadStrategy: 'background',
      syncStrategy: 'wifi_only'
    },
    searchIndex: {
      ttl: 604800,       // 7 days
      maxSize: 5 * 1024 * 1024,   // 5MB
      compressionEnabled: true,
      invalidationStrategy: 'version',
      storage: 'disk',
      priority: 'nice_to_have',
      downloadStrategy: 'background',
      syncStrategy: 'wifi_only'
    }
  };

  async prefetchEssentialData(): Promise<void> {
    const config = this.cacheConfigs.essentialData;
    
    // Check available storage space
    const availableSpace = await this.getAvailableStorageSpace();
    if (availableSpace < config.maxSize) {
      await this.cleanupOldCache();
    }
    
    // Prefetch critical data
    const essentialDataTasks = [
      this.prefetchPopularRoutes(),
      this.prefetchMajorStops(),
      this.prefetchRouteGeometries(),
      this.prefetchScheduleData()
    ];
    
    await Promise.all(essentialDataTasks);
  }

  async prefetchPopularRoutes(): Promise<void> {
    try {
      // Get user's frequently used routes
      const userRoutes = await this.getUserFrequentRoutes();
      
      // Get city's popular routes
      const popularRoutes = await this.getCityPopularRoutes();
      
      // Combine and deduplicate
      const routesToCache = [...new Set([...userRoutes, ...popularRoutes])];
      
      for (const routeId of routesToCache) {
        const routeData = await this.fetchRouteData(routeId);
        await this.cacheRouteForOffline(routeId, routeData);
      }
      
      console.log(`Prefetched ${routesToCache.length} popular routes`);
    } catch (error) {
      console.error('Error prefetching popular routes:', error);
    }
  }

  async enableOfflineMode(): Promise<void> {
    // Mark app as offline
    await this.asyncStorage.setItem('offline_mode', 'true');
    
    // Switch to offline data sources
    this.configureOfflineDataSources();
    
    // Start background sync monitoring
    this.startOfflineSyncMonitoring();
  }

  async syncWhenOnline(): Promise<void> {
    const isOnline = await this.checkNetworkConnectivity();
    const isWifiConnected = await this.checkWifiConnectivity();
    
    if (!isOnline) return;
    
    // Get pending sync operations
    const pendingSyncs = await this.getPendingSyncOperations();
    
    for (const syncOp of pendingSyncs) {
      const config = this.cacheConfigs[syncOp.dataType as keyof OfflineCacheStrategy];
      
      // Check sync strategy
      if (config.syncStrategy === 'wifi_only' && !isWifiConnected) {
        continue; // Skip this sync operation
      }
      
      try {
        await this.executeSyncOperation(syncOp);
        await this.markSyncCompleted(syncOp.id);
      } catch (error) {
        console.error(`Sync failed for operation ${syncOp.id}:`, error);
        await this.incrementSyncRetryCount(syncOp.id);
      }
    }
  }

  private async cacheRouteForOffline(routeId: string, routeData: any): Promise<void> {
    const config = this.cacheConfigs.essentialData;
    
    // Compress data if configured
    const dataToStore = config.compressionEnabled ? 
      await this.compressData(routeData) : routeData;
    
    // Store in SQLite for offline access
    await this.sqliteDB.execute(`
      INSERT OR REPLACE INTO offline_routes 
      (route_id, data, cached_at, expires_at) 
      VALUES (?, ?, ?, ?)
    `, [
      routeId,
      JSON.stringify(dataToStore),
      Date.now(),
      Date.now() + (config.ttl * 1000)
    ]);
  }

  async getOfflineRouteData(routeId: string): Promise<any> {
    const result = await this.sqliteDB.execute(`
      SELECT data, cached_at, expires_at 
      FROM offline_routes 
      WHERE route_id = ? AND expires_at > ?
    `, [routeId, Date.now()]);
    
    if (result.rows.length === 0) {
      throw new Error(`Route ${routeId} not available offline`);
    }
    
    const row = result.rows[0];
    const config = this.cacheConfigs.essentialData;
    
    // Decompress if needed
    const data = config.compressionEnabled ? 
      await this.decompressData(JSON.parse(row.data)) : 
      JSON.parse(row.data);
    
    return data;
  }
}
```

## Cache Invalidation Strategies

### 1. Event-Driven Invalidation

```typescript
interface CacheInvalidationManager {
  setupEventListeners(): void;
  invalidateByEvent(event: CacheInvalidationEvent): Promise<void>;
  invalidateByPattern(pattern: string): Promise<void>;
  scheduleInvalidation(key: string, delay: number): void;
}

interface CacheInvalidationEvent {
  type: 'route_update' | 'service_alert' | 'user_action' | 'system_maintenance';
  affectedKeys: string[];
  scope: 'global' | 'regional' | 'route_specific' | 'user_specific';
  priority: 'immediate' | 'high' | 'medium' | 'low';
}

class CacheInvalidationManager implements CacheInvalidationManager {
  private redis: RedisClusterClient;
  private eventEmitter: EventEmitter;
  
  setupEventListeners(): void {
    // Listen for route updates
    this.eventEmitter.on('route_updated', async (routeId: string) => {
      await this.invalidateByEvent({
        type: 'route_update',
        affectedKeys: [`route:${routeId}:*`, `trips:*:${routeId}:*`],
        scope: 'route_specific',
        priority: 'high'
      });
    });
    
    // Listen for service alerts
    this.eventEmitter.on('service_alert_created', async (alert: ServiceAlert) => {
      await this.invalidateByEvent({
        type: 'service_alert',
        affectedKeys: alert.affectedRoutes.map(r => `route:${r}:*`),
        scope: 'regional',
        priority: 'immediate'
      });
    });
    
    // Listen for user actions
    this.eventEmitter.on('user_preferences_updated', async (userId: string) => {
      await this.invalidateByEvent({
        type: 'user_action',
        affectedKeys: [`user:${userId}:*`],
        scope: 'user_specific',
        priority: 'medium'
      });
    });
  }

  async invalidateByEvent(event: CacheInvalidationEvent): Promise<void> {
    console.log(`Processing cache invalidation event: ${event.type}`);
    
    // Handle based on priority
    if (event.priority === 'immediate') {
      await this.immediateInvalidation(event.affectedKeys);
    } else {
      await this.scheduleInvalidation(event);
    }
    
    // Notify other cache layers
    await this.propagateInvalidation(event);
  }

  private async immediateInvalidation(keys: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const keyPattern of keys) {
      if (keyPattern.includes('*')) {
        // Pattern-based deletion
        const matchingKeys = await this.redis.keys(keyPattern);
        for (const key of matchingKeys) {
          pipeline.del(key);
        }
      } else {
        // Direct key deletion
        pipeline.del(keyPattern);
      }
    }
    
    await pipeline.exec();
  }

  private async scheduleInvalidation(event: CacheInvalidationEvent): Promise<void> {
    // Queue invalidation for later processing
    const invalidationJob = {
      id: `invalidation_${Date.now()}`,
      event,
      scheduledAt: Date.now(),
      priority: event.priority
    };
    
    await this.redis.lpush('cache_invalidation_queue', JSON.stringify(invalidationJob));
  }
}
```

### 2. Cache Performance Monitoring

```typescript
interface CachePerformanceMonitor {
  trackCacheHit(key: string, latency: number): void;
  trackCacheMiss(key: string): void;
  getPerformanceMetrics(): Promise<CacheMetrics>;
  generatePerformanceReport(): Promise<CacheReport>;
}

interface CacheMetrics {
  hitRate: number;
  missRate: number;
  averageLatency: number;
  hotKeys: string[];
  memoryUsage: number;
  evictionCount: number;
}

class CachePerformanceMonitor implements CachePerformanceMonitor {
  private influxDB: InfluxDBClient;
  private redis: RedisClusterClient;
  
  trackCacheHit(key: string, latency: number): void {
    // Track cache hit with latency
    const point = new Point('cache_operations')
      .tag('operation', 'hit')
      .tag('cache_key', this.sanitizeKeyForMetrics(key))
      .floatField('latency_ms', latency)
      .intField('count', 1)
      .timestamp(new Date());
    
    this.influxDB.writePoint(point);
  }

  trackCacheMiss(key: string): void {
    // Track cache miss
    const point = new Point('cache_operations')
      .tag('operation', 'miss')
      .tag('cache_key', this.sanitizeKeyForMetrics(key))
      .intField('count', 1)
      .timestamp(new Date());
    
    this.influxDB.writePoint(point);
  }

  async getPerformanceMetrics(): Promise<CacheMetrics> {
    // Query cache performance metrics from InfluxDB
    const query = `
      SELECT 
        sum(count) as total_operations,
        sum(case when operation = 'hit' then count else 0 end) as hits,
        sum(case when operation = 'miss' then count else 0 end) as misses,
        mean(latency_ms) as avg_latency
      FROM cache_operations 
      WHERE time >= now() - 1h
    `;
    
    const result = await this.influxDB.query(query);
    const stats = result[0];
    
    const hitRate = stats.hits / stats.total_operations;
    const missRate = stats.misses / stats.total_operations;
    
    // Get Redis memory info
    const memoryInfo = await this.redis.info('memory');
    const memoryUsage = this.parseMemoryUsage(memoryInfo);
    
    // Get hot keys
    const hotKeys = await this.getHotKeys();
    
    return {
      hitRate,
      missRate,
      averageLatency: stats.avg_latency,
      hotKeys,
      memoryUsage,
      evictionCount: await this.getEvictionCount()
    };
  }

  private async getHotKeys(): Promise<string[]> {
    // Get most frequently accessed keys
    const hotKeysQuery = `
      SELECT cache_key, sum(count) as access_count
      FROM cache_operations 
      WHERE time >= now() - 1h
      GROUP BY cache_key
      ORDER BY access_count DESC
      LIMIT 10
    `;
    
    const result = await this.influxDB.query(hotKeysQuery);
    return result.map((row: any) => row.cache_key);
  }
}
```

This comprehensive caching strategy ensures optimal performance across all layers of the BMTC Transit App while supporting offline functionality and maintaining data consistency for real-time transit information.