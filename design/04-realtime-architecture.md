# Real-Time Data Processing Architecture - BMTC Transit App

## Overview

The real-time data processing architecture is the core of the BMTC Transit App's
crowdsourcing system. It handles location data ingestion, validation,
anonymization, and distribution to provide accurate real-time transit
information.

## Architecture Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MOBILE APPLICATIONS                               │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │   Android App   │    │    iOS App      │    │  Web Dashboard  │          │
│  │                 │    │                 │    │   (Admin)       │          │
│  │ • GPS Tracking  │    │ • GPS Tracking  │    │ • Monitoring    │          │
│  │ • Data Buffering│    │ • Data Buffering│    │ • Analytics     │          │
│  │ • Network Retry │    │ • Network Retry │    │ • Configuration │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
└─────────────┬─────────────────┬─────────────────────┬─────────────────────────┘
              │                 │                     │
         ┌────▼─────┐      ┌────▼─────┐         ┌────▼─────┐
         │HTTPS/WSS │      │HTTPS/WSS │         │HTTPS/WSS │
         └────┬─────┘      └────┬─────┘         └────┬─────┘
              │                 │                     │
┌─────────────▼─────────────────▼─────────────────────▼─────────────────────────┐
│                            API GATEWAY                                       │
│                                                                               │
│  • Authentication & Rate Limiting                                             │
│  • Request Validation & Sanitization                                          │
│  • WebSocket Connection Management                                            │
│  • Load Balancing & Circuit Breaker                                          │
└─────────────┬─────────────────────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────────────────────┐
│                      LOCATION INGESTION SERVICE                               │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Location Data Receiver                               │  │
│  │                                                                         │  │
│  │  • High-throughput HTTP/WebSocket endpoints                             │  │
│  │  • Input validation and sanitization                                    │  │
│  │  • Duplicate detection and deduplication                                │  │
│  │  • Batch processing for efficiency                                      │  │
│  │  • Async processing with message queuing                                │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│                                      ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                  Privacy & Anonymization Layer                          │  │
│  │                                                                         │  │
│  │  • Immediate PII removal                                                │  │
│  │  • Anonymous session ID generation                                      │  │
│  │  • Data masking and obfuscation                                         │  │
│  │  • Audit trail for privacy compliance                                   │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────┬─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        APACHE KAFKA CLUSTER                                 │
│                                                                             │
│  Topic: raw-location-data         Topic: validated-location-data           │
│  ├─ Partition by route_id         ├─ Partition by route_id                 │
│  ├─ Retention: 1 hour             ├─ Retention: 24 hours                   │
│  └─ Replication: 3                └─ Replication: 3                        │
│                                                                             │
│  Topic: location-events           Topic: system-metrics                    │
│  ├─ Real-time notifications       ├─ Performance monitoring                │
│  ├─ Retention: 7 days             ├─ Retention: 30 days                    │
│  └─ Replication: 3                └─ Replication: 3                        │
└─────────────┬─────┬─────────────────────┬─────────────────────┬─────────────┘
              │     │                     │                     │
    ┌─────────▼─────▼─────────────────────▼─────────────────────▼─────────────┐
    │                    STREAM PROCESSING PIPELINE                           │
    │                                                                         │
    │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
    │  │   Validation    │  │   Geospatial    │  │   ML Anomaly    │          │
    │  │   Processor     │  │   Processor     │  │   Detection     │          │
    │  │                 │  │                 │  │                 │          │
    │  │ • Speed Check   │  │ • Route Match   │  │ • Pattern Recog │          │
    │  │ • Time Valid    │  │ • Stop Proximity│  │ • Spoofing Det  │          │
    │  │ • Bounds Check  │  │ • Movement Dir  │  │ • Outlier Det   │          │
    │  │ • Accuracy Val  │  │ • Geofencing    │  │ • Confidence    │          │
    │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
    │                                  │                                      │
    │  ┌─────────────────┐             ▼             ┌─────────────────┐      │
    │  │   Aggregation   │  ┌─────────────────┐      │   Real-time     │      │
    │  │   Processor     │  │   Data Fusion   │      │   Analytics     │      │
    │  │                 │  │   & Smoothing   │      │                 │      │
    │  │ • Multi-user    │  │                 │      │ • Route Stats   │      │
    │  │   Data Merge    │  │ • Kalman Filter │      │ • User Metrics  │      │
    │  │ • Confidence    │  │ • Position      │      │ • System Health │      │
    │  │   Scoring       │  │   Interpolation │      │ • Alerts        │      │
    │  │ • Quality       │  │ • Smooth Tracks │      │                 │      │
    │  │   Metrics       │  │                 │      │                 │      │
    │  └─────────────────┘  └─────────────────┘      └─────────────────┘      │
    └─────────────┬─────────────────┬─────────────────────┬─────────────────────┘
                  │                 │                     │
        ┌─────────▼─────────────────▼─────────────────────▼─────────────────────┐
        │                         DATA STORAGE LAYER                           │
        │                                                                       │
        │  ┌───────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
        │  │    InfluxDB       │  │  Redis Cluster  │  │    PostgreSQL       │  │
        │  │   Time-Series     │  │                 │  │                     │  │
        │  │                   │  │ • Real-time     │  │ • Route Metadata    │  │
        │  │ • Location Data   │  │   Location      │  │ • User Data         │  │
        │  │   (24h retention) │  │   Cache         │  │ • Reports           │  │
        │  │ • Movement        │  │ • Session Mgmt  │  │ • Configuration     │  │
        │  │   History         │  │ • Pub/Sub       │  │                     │  │
        │  │ • Performance     │  │ • Rate Limiting │  │                     │  │
        │  │   Metrics         │  │                 │  │                     │  │
        │  └───────────────────┘  └─────────────────┘  └─────────────────────┘  │
        └─────────────┬─────────────────┬─────────────────────┬─────────────────┘
                      │                 │                     │
        ┌─────────────▼─────────────────▼─────────────────────▼─────────────────┐
        │                    REAL-TIME DISTRIBUTION LAYER                       │
        │                                                                       │
        │  ┌─────────────────────────────────────────────────────────────────┐  │
        │  │                  WebSocket Manager                              │  │
        │  │                                                                 │  │
        │  │  • Connection pooling and management                            │  │
        │  │  • Route-based channel subscriptions                            │  │
        │  │  • Message broadcasting and fan-out                             │  │
        │  │  • Client presence and heartbeat management                     │  │
        │  │  • Graceful degradation and reconnection                        │  │
        │  └─────────────────────────────────────────────────────────────────┘  │
        │                                      │                                │
        │  ┌─────────────────────────────────────────────────────────────────┐  │
        │  │                Push Notification Service                        │  │
        │  │                                                                 │  │
        │  │  • Firebase Cloud Messaging (FCM)                               │  │
        │  │  • Apple Push Notification Service (APNS)                       │  │
        │  │  • Notification scheduling and batching                         │  │
        │  │  • Template management and personalization                      │  │
        │  └─────────────────────────────────────────────────────────────────┘  │
        └─────────────┬─────────────────────────────────────────────────────────┘
                      │
        ┌─────────────▼─────────────────────────────────────────────────────────┐
        │                         CLIENT APPLICATIONS                           │
        │                                                                       │
        │  • Real-time location updates (10-15 second intervals)               │
        │  • Smooth vehicle animations and interpolation                        │
        │  • ETA calculations and trip notifications                            │
        │  • Service alerts and crowding information                            │
        └───────────────────────────────────────────────────────────────────────┘
```

## Data Flow Stages

### 1. Location Data Ingestion

**Input Processing:**

```typescript
interface LocationInput {
  user_session_id: string;
  route_id: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  speed: number;
  heading: number;
  accuracy: number;
  route_direction: string;
}
```

**Processing Steps:**

1. **Validation**: Check data bounds, format, and required fields
2. **Deduplication**: Remove duplicate submissions within time window
3. **Rate Limiting**: Enforce per-user and per-route submission limits
4. **Sanitization**: Clean and normalize input data
5. **Batching**: Group submissions for efficient processing

### 2. Privacy & Anonymization

**Anonymization Process:**

```typescript
interface AnonymizedLocation {
  anonymous_session_id: string; // SHA-256 hash
  route_id: string;
  latitude: number; // Rounded to 6 decimal places
  longitude: number; // Rounded to 6 decimal places
  timestamp: number;
  speed: number;
  heading: number;
  accuracy: number;
  route_direction: string;
  // All PII removed
}
```

**Privacy Measures:**

- Immediate removal of user identifiers
- Location precision reduction (±5 meters)
- Session ID anonymization
- Audit logging for compliance
- Data minimization principles

### 3. Stream Processing Pipeline

**Validation Processor:**

```typescript
class ValidationProcessor {
  validateLocation(location: AnonymizedLocation): ValidationResult {
    return {
      isValid: boolean,
      confidence: number, // 0.0 to 1.0
      validationFlags: {
        withinGeographicBounds: boolean,
        speedWithinLimits: boolean,
        accuracyAcceptable: boolean,
        timestampRecent: boolean,
        routeExists: boolean
      },
      issues: string[]
    };
  }
}
```

**Geospatial Processor:**

```typescript
class GeospatialProcessor {
  validateRouteMatch(location: AnonymizedLocation): RouteMatchResult {
    return {
      isOnRoute: boolean,
      distanceFromRoute: number, // meters
      nearestStop: StopInfo,
      routeSegment: SegmentInfo,
      movementDirection: 'forward' | 'backward' | 'stationary',
      confidence: number,
    };
  }
}
```

**ML Anomaly Detection:**

```typescript
class AnomalyDetectionProcessor {
  detectAnomalies(location: AnonymizedLocation, context: LocationContext): AnomalyResult {
    return {
      anomalyScore: number, // 0.0 to 1.0
      anomalyTypes: ('speed' | 'direction' | 'position' | 'temporal')[],
      isSpoofed: boolean,
      confidence: number,
      recommendations: string[]
    };
  }
}
```

### 4. Data Fusion & Aggregation

**Multi-User Data Fusion:**

```typescript
interface AggregatedLocation {
  route_id: string;
  vehicle_id: string; // Derived anonymous identifier
  latitude: number; // Weighted average
  longitude: number; // Weighted average
  timestamp: number;
  speed: number; // Weighted average
  heading: number; // Circular average
  contributor_count: number;
  confidence_score: number;
  data_freshness: number; // seconds since last update
}
```

**Aggregation Rules:**

- Minimum 2 contributors for validation
- Weighted averaging based on GPS accuracy
- Outlier removal using statistical methods
- Temporal smoothing with Kalman filtering
- Confidence scoring based on contributor agreement

### 5. Real-Time Distribution

**WebSocket Channels:**

```typescript
interface ChannelStructure {
  'route:${route_id}:${direction}': AggregatedLocation[];
  'stop:${stop_id}': StopUpdate[];
  'user:${user_id}:notifications': NotificationMessage[];
  'system:alerts': SystemAlert[];
}
```

**Message Types:**

```typescript
interface LocationUpdate {
  type: 'location_update';
  data: AggregatedLocation;
  timestamp: number;
}

interface ETAUpdate {
  type: 'eta_update';
  data: {
    stop_id: string;
    route_id: string;
    estimated_arrival: number;
    confidence: number;
  };
}

interface ServiceAlert {
  type: 'service_alert';
  data: {
    route_id: string;
    alert_type: string;
    message: string;
    severity: string;
  };
}
```

## Performance Specifications

### Throughput Requirements

| Component              | Target Throughput | Peak Throughput   |
| ---------------------- | ----------------- | ----------------- |
| Location Ingestion     | 10,000 msgs/sec   | 50,000 msgs/sec   |
| Stream Processing      | 15,000 msgs/sec   | 75,000 msgs/sec   |
| WebSocket Distribution | 100,000 msgs/sec  | 500,000 msgs/sec  |
| Database Writes        | 5,000 writes/sec  | 25,000 writes/sec |

### Latency Requirements

| Operation                     | Target Latency | Max Latency  |
| ----------------------------- | -------------- | ------------ |
| Location Ingestion            | < 100ms        | < 500ms      |
| Validation Processing         | < 200ms        | < 1000ms     |
| WebSocket Distribution        | < 50ms         | < 200ms      |
| End-to-End (Mobile to Mobile) | < 15 seconds   | < 30 seconds |

### Scalability Parameters

```yaml
kafka_cluster:
  brokers: 3-9 (auto-scaling)
  partitions_per_topic: 12
  replication_factor: 3

stream_processors:
  instances: 6-20 (auto-scaling)
  cpu_per_instance: 2-4 cores
  memory_per_instance: 4-8 GB

websocket_managers:
  instances: 4-12 (auto-scaling)
  connections_per_instance: 10,000
  total_concurrent_connections: 100,000+
```

## Data Quality Assurance

### Quality Metrics

```typescript
interface QualityMetrics {
  dataAccuracy: number; // Percentage of validated locations
  dataFreshness: number; // Average age of location data
  contributorAgreement: number; // Inter-contributor consistency
  spatialCoverage: number; // Route coverage percentage
  temporalConsistency: number; // Timeline consistency score
}
```

### Quality Control Measures

1. **Input Validation**: Multi-layered validation at ingestion
2. **Outlier Detection**: Statistical and ML-based outlier removal
3. **Cross-Validation**: Multiple contributor requirement
4. **Temporal Consistency**: Movement pattern validation
5. **Spatial Validation**: Route and geofencing checks
6. **Confidence Scoring**: Dynamic quality assessment

## Fault Tolerance & Recovery

### High Availability Design

1. **Multi-Zone Deployment**: Services across 3 availability zones
2. **Auto-Scaling**: Dynamic scaling based on load
3. **Circuit Breakers**: Prevent cascade failures
4. **Graceful Degradation**: Reduced functionality during outages
5. **Data Replication**: Multi-region data backup

### Recovery Procedures

```typescript
interface RecoveryStrategy {
  kafka_broker_failure: {
    detection_time: '< 30 seconds';
    recovery_action: 'automatic_partition_rebalancing';
    data_loss_prevention: 'cross_az_replication';
  };

  stream_processor_failure: {
    detection_time: '< 60 seconds';
    recovery_action: 'auto_restart_and_state_recovery';
    processing_continuity: 'remaining_instances_scale_up';
  };

  database_failure: {
    detection_time: '< 30 seconds';
    recovery_action: 'failover_to_replica';
    data_consistency: 'read_replica_promotion';
  };
}
```

## Monitoring & Alerting

### Key Metrics

```typescript
interface SystemMetrics {
  ingestionRate: number; // Messages per second
  processingLatency: number; // Milliseconds
  validationAccuracy: number; // Percentage
  activeContributors: number; // Real-time count
  dataQualityScore: number; // 0.0 to 1.0
  systemHealthScore: number; // 0.0 to 1.0
}
```

### Alert Conditions

1. **High Latency**: Processing time > 1 second
2. **Low Data Quality**: Quality score < 0.7
3. **System Overload**: Queue size > 10,000 messages
4. **Contributor Drop**: < 50% normal contributor count
5. **Geographic Coverage**: Route coverage < 80%

This real-time processing architecture ensures reliable, scalable, and
privacy-preserving operation of the BMTC Transit App's crowdsourcing system.
