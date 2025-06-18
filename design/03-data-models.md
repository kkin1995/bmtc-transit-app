# Data Models - BMTC Crowdsourced Transit App

## Overview

This document defines the core data models for the BMTC Transit App across
multiple databases. The models are designed to support real-time location
processing, privacy preservation, and scalable operations.

## Database Schema Strategy

### PostgreSQL (Primary Database)

- User accounts and profiles
- Route definitions and metadata
- Gamification data
- Service reports and feedback
- System configuration

### InfluxDB (Time-Series Database)

- Real-time location data (24-hour retention)
- Vehicle movement patterns
- Performance metrics
- Usage analytics

### PostGIS (Geospatial Database)

- Route geometries and spatial indexes
- Stop locations and proximity data
- Geofencing boundaries
- Spatial relationships

## PostgreSQL Data Models

### Users Table

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    phone_number VARCHAR(20),
    preferred_language VARCHAR(10) DEFAULT 'en',

    -- Privacy settings
    location_sharing_enabled BOOLEAN DEFAULT false,
    profile_visibility VARCHAR(20) DEFAULT 'private', -- private, friends, public
    data_retention_days INTEGER DEFAULT 30,

    -- Gamification
    total_points INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    total_distance_shared DECIMAL(10,2) DEFAULT 0,
    total_time_shared INTEGER DEFAULT 0, -- in minutes

    -- Account status
    email_verified BOOLEAN DEFAULT false,
    account_status VARCHAR(20) DEFAULT 'active', -- active, suspended, deleted

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,

    -- Audit
    version INTEGER DEFAULT 1
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_total_points ON users(total_points DESC);
CREATE INDEX idx_users_created_at ON users(created_at);
```

### Routes Table

```sql
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_number VARCHAR(20) NOT NULL, -- e.g., "500A", "Purple Line"
    route_name VARCHAR(200) NOT NULL,
    route_type VARCHAR(20) NOT NULL, -- bus, metro
    operator VARCHAR(50) NOT NULL, -- BMTC, BMRCL

    -- Route variants (A, B, C, etc.)
    variant VARCHAR(10),

    -- Operational info
    service_type VARCHAR(30), -- ordinary, vajra, volvo, ac, non_ac
    operational_status VARCHAR(20) DEFAULT 'active', -- active, suspended, modified

    -- Schedule info (for cold start)
    frequency_peak_minutes INTEGER,
    frequency_offpeak_minutes INTEGER,
    first_service_time TIME,
    last_service_time TIME,

    -- Metadata
    description TEXT,
    total_distance DECIMAL(8,2),
    estimated_duration INTEGER, -- in minutes

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(route_number, variant)
);

CREATE INDEX idx_routes_route_number ON routes(route_number);
CREATE INDEX idx_routes_route_type ON routes(route_type);
CREATE INDEX idx_routes_operator ON routes(operator);
CREATE INDEX idx_routes_operational_status ON routes(operational_status);
```

### Stops Table

```sql
CREATE TABLE stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_code VARCHAR(20) UNIQUE NOT NULL, -- Official stop code
    stop_name VARCHAR(200) NOT NULL,
    stop_name_kannada VARCHAR(200),
    stop_type VARCHAR(20) NOT NULL, -- bus_stop, metro_station, interchange

    -- Location
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,

    -- Accessibility
    wheelchair_accessible BOOLEAN DEFAULT false,
    has_shelter BOOLEAN DEFAULT false,
    has_seating BOOLEAN DEFAULT false,
    has_lighting BOOLEAN DEFAULT false,

    -- Facilities (for Metro stations)
    has_elevator BOOLEAN DEFAULT false,
    has_escalator BOOLEAN DEFAULT false,
    has_parking BOOLEAN DEFAULT false,

    -- Operational
    operational_status VARCHAR(20) DEFAULT 'active',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stops_stop_code ON stops(stop_code);
CREATE INDEX idx_stops_stop_type ON stops(stop_type);
CREATE INDEX idx_stops_location ON stops(latitude, longitude);
CREATE INDEX idx_stops_operational_status ON stops(operational_status);
```

### Route Stops Table (Route-Stop Relationships)

```sql
CREATE TABLE route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    stop_id UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,

    -- Sequence and direction
    sequence_number INTEGER NOT NULL,
    direction VARCHAR(20) NOT NULL, -- up, down, forward, backward

    -- Distance and timing
    distance_from_start DECIMAL(8,2), -- in kilometers
    estimated_travel_time INTEGER, -- in minutes from start

    -- Stop-specific info
    is_major_stop BOOLEAN DEFAULT false,
    is_interchange BOOLEAN DEFAULT false,

    UNIQUE(route_id, stop_id, direction)
);

CREATE INDEX idx_route_stops_route_id ON route_stops(route_id);
CREATE INDEX idx_route_stops_stop_id ON route_stops(stop_id);
CREATE INDEX idx_route_stops_sequence ON route_stops(route_id, direction, sequence_number);
```

### User Achievements Table

```sql
CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_type VARCHAR(50) NOT NULL,
    achievement_name VARCHAR(100) NOT NULL,
    description TEXT,
    points_awarded INTEGER DEFAULT 0,
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Achievement metadata
    metadata JSONB,

    UNIQUE(user_id, achievement_type, achievement_name)
);

CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_type ON user_achievements(achievement_type);
CREATE INDEX idx_user_achievements_achieved_at ON user_achievements(achieved_at DESC);
```

### Service Reports Table

```sql
CREATE TABLE service_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    stop_id UUID REFERENCES stops(id) ON DELETE SET NULL,

    -- Report details
    report_type VARCHAR(30) NOT NULL, -- crowding, delay, service_issue, vehicle_condition
    severity VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    description TEXT,

    -- Location context
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Crowding specific
    crowding_level VARCHAR(20), -- low, medium, high, full

    -- Vehicle condition specific
    vehicle_condition JSONB, -- {ac_working: true, cleanliness: 3, accessibility: true}

    -- Report metadata
    report_status VARCHAR(20) DEFAULT 'active', -- active, resolved, expired
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    verification_count INTEGER DEFAULT 1,

    -- Timestamps
    reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_service_reports_route_id ON service_reports(route_id);
CREATE INDEX idx_service_reports_stop_id ON service_reports(stop_id);
CREATE INDEX idx_service_reports_type ON service_reports(report_type);
CREATE INDEX idx_service_reports_reported_at ON service_reports(reported_at DESC);
CREATE INDEX idx_service_reports_status ON service_reports(report_status);
```

### Leaderboards Table

```sql
CREATE TABLE leaderboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leaderboard_type VARCHAR(30) NOT NULL, -- daily, weekly, monthly, route_specific
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,

    -- Metrics
    points_earned INTEGER DEFAULT 0,
    distance_shared DECIMAL(10,2) DEFAULT 0,
    time_shared INTEGER DEFAULT 0, -- in minutes
    riders_helped INTEGER DEFAULT 0,

    -- Ranking
    rank_position INTEGER,

    -- Time period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, leaderboard_type, route_id, period_start)
);

CREATE INDEX idx_leaderboards_type_period ON leaderboards(leaderboard_type, period_start);
CREATE INDEX idx_leaderboards_route_period ON leaderboards(route_id, period_start);
CREATE INDEX idx_leaderboards_rank ON leaderboards(leaderboard_type, rank_position);
```

## InfluxDB Data Models

### Real-Time Location Data

```typescript
// Measurement: location_data
interface LocationData {
  time: number; // Unix timestamp

  // Tags (indexed)
  route_id: string;
  route_direction: string; // up, down, forward, backward
  vehicle_id: string; // anonymous vehicle identifier
  session_id: string; // anonymous session identifier

  // Fields (not indexed)
  latitude: number;
  longitude: number;
  speed: number; // km/h
  heading: number; // degrees
  accuracy: number; // meters
  confidence_score: number; // 0.0 to 1.0
  contributor_count: number; // number of users contributing to this data point

  // Validation flags
  is_validated: boolean;
  validation_source: string; // ml_model, manual, peer_validation
}

// Retention policy: 24 hours
// Measurement: "location_data"
// Tags: route_id, route_direction, vehicle_id, session_id
// Fields: latitude, longitude, speed, heading, accuracy, confidence_score, contributor_count, is_validated, validation_source
```

### Performance Metrics

```typescript
// Measurement: system_metrics
interface SystemMetrics {
  time: number;

  // Tags
  service_name: string;
  instance_id: string;
  environment: string; // dev, staging, prod

  // Fields
  response_time: number; // milliseconds
  throughput: number; // requests per second
  error_rate: number; // percentage
  cpu_usage: number; // percentage
  memory_usage: number; // percentage
  active_connections: number;
  queue_size: number;
}

// Retention policy: 30 days
// Measurement: "system_metrics"
```

### Usage Analytics

```typescript
// Measurement: usage_analytics
interface UsageAnalytics {
  time: number;

  // Tags
  route_id: string;
  stop_id: string;
  user_segment: string; // anonymous user categorization
  app_version: string;

  // Fields
  active_users: number;
  location_shares: number;
  trip_requests: number;
  report_submissions: number;
  session_duration: number; // minutes

  // Engagement metrics
  points_earned: number;
  achievements_unlocked: number;
  leaderboard_interactions: number;
}

// Retention policy: 90 days
// Measurement: "usage_analytics"
```

## PostGIS Data Models

### Route Geometries

```sql
CREATE TABLE route_geometries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL,

    -- Geometry data
    geom GEOMETRY(LINESTRING, 4326) NOT NULL,

    -- Validation boundaries (buffer around route)
    validation_buffer GEOMETRY(POLYGON, 4326),
    buffer_distance INTEGER DEFAULT 100, -- meters

    -- Metadata
    total_length DECIMAL(10,3), -- kilometers

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(route_id, direction)
);

-- Spatial indexes
CREATE INDEX idx_route_geometries_geom ON route_geometries USING GIST(geom);
CREATE INDEX idx_route_geometries_buffer ON route_geometries USING GIST(validation_buffer);
```

### Stop Locations

```sql
CREATE TABLE stop_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,

    -- Point geometry
    geom GEOMETRY(POINT, 4326) NOT NULL,

    -- Proximity buffer for stop detection
    proximity_buffer GEOMETRY(POLYGON, 4326),
    buffer_distance INTEGER DEFAULT 50, -- meters

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Spatial indexes
CREATE INDEX idx_stop_locations_geom ON stop_locations USING GIST(geom);
CREATE INDEX idx_stop_locations_buffer ON stop_locations USING GIST(proximity_buffer);
```

### Geofencing Zones

```sql
CREATE TABLE geofencing_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name VARCHAR(100) NOT NULL,
    zone_type VARCHAR(30) NOT NULL, -- route_validation, stop_proximity, restricted_area

    -- Polygon geometry
    geom GEOMETRY(POLYGON, 4326) NOT NULL,

    -- Zone properties
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 1,

    -- Metadata
    description TEXT,
    properties JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Spatial index
CREATE INDEX idx_geofencing_zones_geom ON geofencing_zones USING GIST(geom);
CREATE INDEX idx_geofencing_zones_type ON geofencing_zones(zone_type);
```

## Data Relationships and Constraints

### Key Relationships

1. **Users ↔ Routes**: Many-to-many through location sharing sessions
2. **Routes ↔ Stops**: Many-to-many through route_stops table
3. **Users ↔ Achievements**: One-to-many relationship
4. **Routes ↔ Service Reports**: One-to-many relationship
5. **Routes ↔ Geometries**: One-to-many (different directions)

### Privacy Constraints

1. **No PII in InfluxDB**: Location data uses anonymous identifiers only
2. **Data Retention**: Automatic cleanup of location data after 24 hours
3. **User Consent**: Location sharing requires explicit user consent
4. **Anonymization**: Real-time data processing removes all personal identifiers

### Performance Constraints

1. **Spatial Indexes**: All geometric data has spatial indexes
2. **Time-Series Optimization**: InfluxDB optimized for time-based queries
3. **Partitioning**: Large tables partitioned by date or route
4. **Caching**: Frequently accessed data cached in Redis

## Data Validation Rules

### Location Data Validation

```typescript
interface LocationValidationRules {
  // Geographic bounds (Bengaluru metropolitan area)
  minLatitude: 12.7342;
  maxLatitude: 13.1939;
  minLongitude: 77.391;
  maxLongitude: 77.7669;

  // Speed limits
  maxBusSpeed: 80; // kmph
  maxMetroSpeed: 80; // kmph
  maxWalkingSpeed: 8; // kmph

  // Accuracy requirements
  minAccuracy: 100; // meters
  maxAccuracy: 5; // meters (ideal)

  // Temporal constraints
  maxTimeDelta: 300; // seconds (5 minutes)
  minTimeDelta: 3; // seconds
}
```

This comprehensive data model design supports all functional requirements while
maintaining privacy, performance, and scalability standards for the BMTC Transit
App.
