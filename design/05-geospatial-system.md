# Geospatial Data Processing System - BMTC Transit App

## Overview

The geospatial data processing system is responsible for all location-based
computations in the BMTC Transit App. It validates route adherence, detects
movement patterns, calculates proximities, and ensures spatial data integrity
for the crowdsourced transit system.

## Core Components

### 1. Geospatial Data Engine

**PostGIS Database with Spatial Extensions**

- Primary storage for route geometries and stop locations
- Spatial indexing for high-performance queries
- Advanced spatial functions and operations
- Integration with PostgreSQL for transactional consistency

**Geospatial Processing Service**

- Real-time spatial computations
- Route validation and matching
- Movement pattern analysis
- Proximity calculations
- Geofencing operations

### 2. Spatial Data Models

#### Route Geometries

```sql
-- Route geometry with validation buffers
CREATE TABLE route_geometries (
    id UUID PRIMARY KEY,
    route_id UUID NOT NULL,
    direction VARCHAR(20) NOT NULL, -- 'up', 'down', 'forward', 'backward'

    -- Main route geometry (LineString)
    geom GEOMETRY(LINESTRING, 4326) NOT NULL,

    -- Validation buffer (100m tolerance)
    validation_buffer GEOMETRY(POLYGON, 4326) NOT NULL,

    -- Performance optimizations
    simplified_geom GEOMETRY(LINESTRING, 4326), -- Simplified for fast queries
    bbox GEOMETRY(POLYGON, 4326), -- Bounding box for quick filtering

    -- Metadata
    total_length DECIMAL(10,3), -- kilometers
    segment_count INTEGER,

    -- Spatial indexes
    CONSTRAINT route_geometries_geom_valid CHECK (ST_IsValid(geom)),
    CONSTRAINT route_geometries_buffer_valid CHECK (ST_IsValid(validation_buffer))
);

-- Spatial indexes for performance
CREATE INDEX idx_route_geometries_geom ON route_geometries USING GIST(geom);
CREATE INDEX idx_route_geometries_buffer ON route_geometries USING GIST(validation_buffer);
CREATE INDEX idx_route_geometries_bbox ON route_geometries USING GIST(bbox);
```

#### Stop Locations

```sql
-- Stop locations with proximity buffers
CREATE TABLE stop_locations (
    id UUID PRIMARY KEY,
    stop_id UUID NOT NULL,

    -- Point geometry
    geom GEOMETRY(POINT, 4326) NOT NULL,

    -- Proximity buffer for stop detection (50m radius)
    proximity_buffer GEOMETRY(POLYGON, 4326) NOT NULL,

    -- Stop influence area (200m radius for arrival predictions)
    influence_area GEOMETRY(POLYGON, 4326),

    -- Metadata
    stop_type VARCHAR(20), -- 'bus_stop', 'metro_station', 'interchange'
    elevation DECIMAL(8,2),

    CONSTRAINT stop_locations_geom_valid CHECK (ST_IsValid(geom)),
    CONSTRAINT stop_locations_buffer_valid CHECK (ST_IsValid(proximity_buffer))
);

-- Spatial indexes
CREATE INDEX idx_stop_locations_geom ON stop_locations USING GIST(geom);
CREATE INDEX idx_stop_locations_buffer ON stop_locations USING GIST(proximity_buffer);
CREATE INDEX idx_stop_locations_influence ON stop_locations USING GIST(influence_area);
```

#### Geofencing Zones

```sql
-- Geofencing zones for various purposes
CREATE TABLE geofencing_zones (
    id UUID PRIMARY KEY,
    zone_name VARCHAR(100) NOT NULL,
    zone_type VARCHAR(30) NOT NULL, -- 'validation', 'restricted', 'high_priority'
    zone_category VARCHAR(30), -- 'route_corridor', 'depot', 'maintenance'

    -- Zone geometry
    geom GEOMETRY(POLYGON, 4326) NOT NULL,

    -- Zone properties
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 1,

    -- Operational parameters
    properties JSONB,
    rules JSONB,

    CONSTRAINT geofencing_zones_geom_valid CHECK (ST_IsValid(geom))
);

-- Spatial index
CREATE INDEX idx_geofencing_zones_geom ON geofencing_zones USING GIST(geom);
CREATE INDEX idx_geofencing_zones_type ON geofencing_zones(zone_type, is_active);
```

### 3. Geospatial Processing Services

#### Route Validation Service

```typescript
interface RouteValidationService {
  validateLocationOnRoute(
    location: LocationPoint,
    routeId: string,
    direction: string
  ): RouteValidationResult;

  findNearestRouteSegment(
    location: LocationPoint,
    maxDistance: number
  ): RouteSegment[];

  calculateRouteDeviation(
    location: LocationPoint,
    route: RouteGeometry
  ): DeviationResult;
}

interface RouteValidationResult {
  isOnRoute: boolean;
  distanceFromRoute: number; // meters
  confidence: number; // 0.0 to 1.0
  nearestSegment: RouteSegment;
  projectedPoint: LocationPoint;
  deviationReason?: string;
}

interface RouteSegment {
  segmentId: string;
  startPoint: LocationPoint;
  endPoint: LocationPoint;
  geometry: LineString;
  distanceFromStart: number; // meters
}
```

**Implementation:**

```typescript
class RouteValidationService {
  async validateLocationOnRoute(
    location: LocationPoint,
    routeId: string,
    direction: string
  ): Promise<RouteValidationResult> {
    // Query route geometry with spatial index
    const routeGeometry = await this.getRouteGeometry(routeId, direction);

    // Calculate distance from location to route
    const distanceQuery = `
      SELECT 
        ST_Distance(
          ST_GeomFromText('POINT(${location.longitude} ${location.latitude})', 4326)::geography,
          geom::geography
        ) as distance,
        ST_ClosestPoint(
          geom,
          ST_GeomFromText('POINT(${location.longitude} ${location.latitude})', 4326)
        ) as closest_point
      FROM route_geometries 
      WHERE route_id = $1 AND direction = $2
    `;

    const result = await this.db.query(distanceQuery, [routeId, direction]);
    const distance = result.rows[0].distance;

    return {
      isOnRoute: distance <= 100, // 100m tolerance
      distanceFromRoute: distance,
      confidence: this.calculateConfidence(distance),
      nearestSegment: await this.findNearestSegment(location, routeGeometry),
      projectedPoint: result.rows[0].closest_point,
    };
  }

  private calculateConfidence(distance: number): number {
    // Confidence decreases with distance from route
    if (distance <= 25) return 1.0;
    if (distance <= 50) return 0.8;
    if (distance <= 75) return 0.6;
    if (distance <= 100) return 0.4;
    return 0.0;
  }
}
```

#### Movement Detection Service

```typescript
interface MovementDetectionService {
  detectMovementPattern(
    locations: LocationPoint[],
    timeWindow: number
  ): MovementPattern;

  classifyMovementType(pattern: MovementPattern): MovementType;

  validateVehicleMovement(
    locations: LocationPoint[],
    route: RouteGeometry
  ): VehicleMovementResult;
}

interface MovementPattern {
  averageSpeed: number; // km/h
  maxSpeed: number;
  acceleration: number; // m/s²
  directionConsistency: number; // 0.0 to 1.0
  pathSmoothness: number; // 0.0 to 1.0
  stopDuration: number; // seconds
  movementType: MovementType;
}

enum MovementType {
  WALKING = 'walking',
  CYCLING = 'cycling',
  BUS = 'bus',
  METRO = 'metro',
  STATIONARY = 'stationary',
  UNKNOWN = 'unknown',
}
```

**Implementation:**

```typescript
class MovementDetectionService {
  detectMovementPattern(
    locations: LocationPoint[],
    timeWindow: number = 300 // 5 minutes
  ): MovementPattern {
    if (locations.length < 2) {
      return this.createStaticPattern();
    }

    const speeds = this.calculateSpeeds(locations);
    const accelerations = this.calculateAccelerations(speeds, locations);
    const directions = this.calculateDirections(locations);

    return {
      averageSpeed: this.calculateAverage(speeds),
      maxSpeed: Math.max(...speeds),
      acceleration: this.calculateAverage(accelerations),
      directionConsistency: this.calculateDirectionConsistency(directions),
      pathSmoothness: this.calculatePathSmoothness(locations),
      stopDuration: this.calculateStopDuration(speeds),
      movementType: this.classifyMovementType(speeds, accelerations),
    };
  }

  private calculateSpeeds(locations: LocationPoint[]): number[] {
    const speeds: number[] = [];

    for (let i = 1; i < locations.length; i++) {
      const prev = locations[i - 1];
      const curr = locations[i];

      const distance = this.calculateDistance(prev, curr); // meters
      const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // seconds

      if (timeDiff > 0) {
        const speed = (distance / timeDiff) * 3.6; // km/h
        speeds.push(speed);
      }
    }

    return speeds;
  }

  private classifyMovementType(
    speeds: number[],
    accelerations: number[]
  ): MovementType {
    const avgSpeed = this.calculateAverage(speeds);
    const maxSpeed = Math.max(...speeds);
    const avgAcceleration = Math.abs(this.calculateAverage(accelerations));

    if (avgSpeed < 2) return MovementType.STATIONARY;
    if (avgSpeed < 8 && maxSpeed < 15) return MovementType.WALKING;
    if (avgSpeed < 25 && maxSpeed < 40) return MovementType.CYCLING;
    if (avgSpeed < 60 && maxSpeed < 80 && avgAcceleration > 0.5)
      return MovementType.BUS;
    if (avgSpeed < 80 && avgAcceleration < 0.3) return MovementType.METRO;

    return MovementType.UNKNOWN;
  }
}
```

#### Proximity Detection Service

```typescript
interface ProximityDetectionService {
  findNearbyStops(location: LocationPoint, radius: number): NearbyStop[];

  detectStopApproach(
    location: LocationPoint,
    route: RouteGeometry,
    direction: string
  ): StopApproachResult;

  calculateETAToStop(
    currentLocation: LocationPoint,
    targetStop: StopLocation,
    route: RouteGeometry,
    currentSpeed: number
  ): ETAResult;
}

interface NearbyStop {
  stopId: string;
  stopName: string;
  distance: number; // meters
  bearing: number; // degrees
  walkingTime: number; // minutes
  isOnRoute: boolean;
}

interface StopApproachResult {
  isApproaching: boolean;
  nextStop: StopLocation;
  distanceToStop: number; // meters
  estimatedArrival: number; // seconds
  confidence: number;
}
```

**Implementation:**

```typescript
class ProximityDetectionService {
  async findNearbyStops(
    location: LocationPoint,
    radius: number = 500
  ): Promise<NearbyStop[]> {
    const query = `
      SELECT 
        s.id,
        s.stop_name,
        ST_Distance(
          ST_GeomFromText('POINT(${location.longitude} ${location.latitude})', 4326)::geography,
          sl.geom::geography
        ) as distance,
        ST_Azimuth(
          ST_GeomFromText('POINT(${location.longitude} ${location.latitude})', 4326),
          sl.geom
        ) as bearing
      FROM stops s
      JOIN stop_locations sl ON s.id = sl.stop_id
      WHERE ST_DWithin(
        ST_GeomFromText('POINT(${location.longitude} ${location.latitude})', 4326)::geography,
        sl.geom::geography,
        ${radius}
      )
      ORDER BY distance ASC
      LIMIT 10
    `;

    const result = await this.db.query(query);

    return result.rows.map(row => ({
      stopId: row.id,
      stopName: row.stop_name,
      distance: row.distance,
      bearing: (row.bearing * 180) / Math.PI, // Convert to degrees
      walkingTime: this.calculateWalkingTime(row.distance),
      isOnRoute: false, // Will be determined by route context
    }));
  }

  private calculateWalkingTime(distance: number): number {
    // Average walking speed: 5 km/h = 1.39 m/s
    const walkingSpeedMs = 1.39;
    return Math.ceil(distance / walkingSpeedMs / 60); // minutes
  }
}
```

### 4. Geofencing System

#### Geofencing Engine

```typescript
interface GeofencingEngine {
  checkGeofenceViolations(
    location: LocationPoint,
    userId: string
  ): GeofenceViolation[];

  evaluateZoneRules(
    location: LocationPoint,
    zone: GeofencingZone
  ): ZoneEvaluationResult;

  trackZoneTransitions(
    userId: string,
    previousLocation: LocationPoint,
    currentLocation: LocationPoint
  ): ZoneTransition[];
}

interface GeofenceViolation {
  zoneId: string;
  zoneName: string;
  violationType: 'entry' | 'exit' | 'restricted_area';
  severity: 'low' | 'medium' | 'high';
  actionRequired: string;
}

interface ZoneTransition {
  zoneId: string;
  transitionType: 'enter' | 'exit';
  timestamp: Date;
  duration?: number; // seconds spent in zone
}
```

### 5. Performance Optimizations

#### Spatial Indexing Strategy

```sql
-- Multi-level spatial indexing for different query types

-- Primary spatial indexes (R-tree based)
CREATE INDEX idx_routes_geom_gist ON route_geometries USING GIST(geom);
CREATE INDEX idx_stops_geom_gist ON stop_locations USING GIST(geom);

-- Bounding box indexes for quick filtering
CREATE INDEX idx_routes_bbox ON route_geometries USING GIST(bbox);
CREATE INDEX idx_stops_bbox ON stop_locations USING GIST(
  Box2D(ST_Expand(geom, 0.01)) -- Expanded bounding box
);

-- Clustered indexes for related geometries
CLUSTER route_geometries USING idx_routes_geom_gist;
CLUSTER stop_locations USING idx_stops_geom_gist;

-- Partial indexes for active geometries only
CREATE INDEX idx_active_routes ON route_geometries USING GIST(geom)
WHERE is_active = true;

-- Composite indexes for common queries
CREATE INDEX idx_route_direction_geom ON route_geometries USING GIST(geom, route_id, direction);
```

#### Query Optimization Patterns

```typescript
class GeospatialQueryOptimizer {
  // Use bounding box for initial filtering, then precise geometry
  async findRoutesInBounds(bounds: BoundingBox): Promise<RouteGeometry[]> {
    const query = `
      SELECT * FROM route_geometries 
      WHERE bbox && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      ORDER BY ST_Area(bbox) ASC
    `;

    return this.db.query(query, [
      bounds.minLon,
      bounds.minLat,
      bounds.maxLon,
      bounds.maxLat,
    ]);
  }

  // Use simplified geometries for fast approximate queries
  async quickRouteValidation(
    location: LocationPoint,
    routeId: string
  ): Promise<boolean> {
    const query = `
      SELECT ST_DWithin(
        simplified_geom::geography,
        ST_GeomFromText('POINT(${location.longitude} ${location.latitude})', 4326)::geography,
        100
      ) as is_near
      FROM route_geometries 
      WHERE route_id = $1
    `;

    const result = await this.db.query(query, [routeId]);
    return result.rows[0]?.is_near || false;
  }
}
```

#### Caching Strategy

```typescript
interface GeospatialCache {
  // Cache frequently accessed route geometries
  routeGeometryCache: Map<string, RouteGeometry>;

  // Cache stop proximity results
  stopProximityCache: Map<string, NearbyStop[]>;

  // Cache validation results for recent locations
  validationCache: Map<string, RouteValidationResult>;

  // Cache spatial queries with time-based expiration
  spatialQueryCache: Map<string, SpatialQueryResult>;
}

class GeospatialCacheManager {
  private cache: GeospatialCache;
  private redis: RedisClient;

  async getCachedValidation(
    location: LocationPoint,
    routeId: string
  ): Promise<RouteValidationResult | null> {
    const key = `validation:${routeId}:${location.latitude.toFixed(6)}:${location.longitude.toFixed(6)}`;
    const cached = await this.redis.get(key);

    if (cached) {
      return JSON.parse(cached);
    }

    return null;
  }

  async setCachedValidation(
    location: LocationPoint,
    routeId: string,
    result: RouteValidationResult
  ): Promise<void> {
    const key = `validation:${routeId}:${location.latitude.toFixed(6)}:${location.longitude.toFixed(6)}`;
    await this.redis.setex(key, 300, JSON.stringify(result)); // 5 minute cache
  }
}
```

### 6. Real-time Processing Integration

#### Stream Processing Integration

```typescript
class GeospatialStreamProcessor {
  async processLocationStream(
    locationData: LocationData
  ): Promise<ProcessedLocationData> {
    // Parallel processing of geospatial operations
    const [routeValidation, nearbyStops, movementPattern, geofenceChecks] =
      await Promise.all([
        this.routeValidation.validateLocationOnRoute(
          locationData.location,
          locationData.routeId,
          locationData.direction
        ),
        this.proximityDetection.findNearbyStops(locationData.location, 200),
        this.movementDetection.detectMovementPattern(
          locationData.locationHistory
        ),
        this.geofencing.checkGeofenceViolations(
          locationData.location,
          locationData.userId
        ),
      ]);

    return {
      ...locationData,
      routeValidation,
      nearbyStops,
      movementPattern,
      geofenceViolations: geofenceChecks,
      processingTimestamp: Date.now(),
    };
  }
}
```

### 7. Monitoring and Metrics

#### Geospatial Performance Metrics

```typescript
interface GeospatialMetrics {
  // Query performance
  averageQueryTime: number; // milliseconds
  queryThroughput: number; // queries per second
  spatialIndexEfficiency: number; // percentage

  // Validation accuracy
  routeValidationAccuracy: number; // percentage
  falsePositiveRate: number; // percentage
  falseNegativeRate: number; // percentage

  // System performance
  cacheHitRate: number; // percentage
  memoryUsage: number; // MB
  spatialIndexSize: number; // MB
}
```

This comprehensive geospatial system provides the foundation for accurate,
high-performance spatial operations in the BMTC Transit App, ensuring reliable
route validation, movement detection, and proximity calculations for the
crowdsourced transit system.
