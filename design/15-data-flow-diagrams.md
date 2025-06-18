# Data Flow Diagrams - BMTC Transit App

## Overview

This document provides detailed data flow diagrams showing how location data
moves through the BMTC Transit App system, from user devices to real-time
distribution. The diagrams illustrate the complete journey of crowdsourced
location data, including validation, processing, and distribution to ensure data
quality and real-time performance.

## 1. High-Level Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BMTC TRANSIT APP DATA FLOW                        │
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │   MOBILE APPS   │────│   API GATEWAY   │────│   MICROSERVICES │          │
│  │   (Data Source) │    │   (Entry Point) │    │   (Processing)  │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
│           │                       │                       │                │
│           │                       │                       │                │
│           ▼                       ▼                       ▼                │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │  LOCATION DATA  │    │   VALIDATION    │    │   REAL-TIME     │          │
│  │   COLLECTION    │────│   & QUALITY     │────│   DISTRIBUTION  │          │
│  │                 │    │   PROCESSING    │    │                 │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
│                                 │                       │                │
│                                 ▼                       ▼                │
│                    ┌─────────────────┐    ┌─────────────────┐            │
│                    │   DATA STORAGE  │    │  WEBSOCKET/CDN  │            │
│                    │   (Persistence) │    │  (Distribution) │            │
│                    └─────────────────┘    └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. Location Data Collection Flow

### 2.1 Mobile App Data Collection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MOBILE APP DATA COLLECTION                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        User Interaction Layer                          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Share Trip    │  │   Route         │  │   Manual        │          │  │
│  │  │   Button        │  │   Selection     │  │   Report        │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • User starts   │  │ • Choose route  │  │ • Delay report  │          │  │
│  │  │   sharing       │  │ • Validate      │  │ • Issue report  │          │  │
│  │  │ • Privacy       │  │   selection     │  │ • Stop update   │          │  │
│  │  │   consent       │  │ • Set trip      │  │                 │          │  │
│  │  │ • Battery       │  │   context       │  │                 │          │  │
│  │  │   awareness     │  │                 │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Location Services Layer                           │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   GPS Module    │  │   Sensor        │  │   Network       │          │  │
│  │  │                 │  │   Fusion        │  │   Location      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • High accuracy │  │ • Accelerometer │  │ • WiFi          │          │  │
│  │  │   GPS           │  │ • Gyroscope     │  │   positioning   │          │  │
│  │  │ • GNSS          │  │ • Magnetometer  │  │ • Cell tower    │          │  │
│  │  │   satellites    │  │ • Barometer     │  │   triangulation │          │  │
│  │  │ • Accuracy      │  │ • Movement      │  │ • Backup        │          │  │
│  │  │   monitoring    │  │   validation    │  │   when GPS poor │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                │                                        │  │
│  │                                ▼                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │  │
│  │  │                    Location Data Processing                        │   │  │
│  │  │                                                                     │   │  │
│  │  │  • Coordinate transformation (WGS84)                                │   │  │
│  │  │  • Accuracy assessment and filtering                                │   │  │
│  │  │  • Speed and heading calculation                                    │   │  │
│  │  │  • Timestamp synchronization                                        │   │  │
│  │  │  • Device metadata collection                                       │   │  │
│  │  │  • Battery level monitoring                                         │   │  │
│  │  └─────────────────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Data Preparation Layer                            │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Data          │  │   Privacy       │  │   Offline       │          │  │
│  │  │   Validation    │  │   Protection    │  │   Queue         │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Schema check  │  │ • PII removal   │  │ • Local         │          │  │
│  │  │ • Range         │  │ • Anonymization │  │   storage       │          │  │
│  │  │   validation    │  │ • Hashing       │  │ • Sync queue    │          │  │
│  │  │ • Completeness  │  │ • ID generation │  │ • Retry logic   │          │  │
│  │  │   check         │  │                 │  │ • Compression   │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                │                                        │  │
│  │                                ▼                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │  │
│  │  │                      Location Update Payload                       │   │  │
│  │  │                                                                     │   │  │
│  │  │  {                                                                  │   │  │
│  │  │    "sessionId": "uuid4",                                            │   │  │
│  │  │    "routeId": "route_uuid",                                         │   │  │
│  │  │    "latitude": 12.9716,                                             │   │  │
│  │  │    "longitude": 77.5946,                                            │   │  │
│  │  │    "accuracy": 5.2,                                                 │   │  │
│  │  │    "speed": 45.5,                                                   │   │  │
│  │  │    "heading": 127.3,                                                │   │  │
│  │  │    "timestamp": 1703123456789,                                      │   │  │
│  │  │    "deviceInfo": { ... },                                           │   │  │
│  │  │    "sensorData": { ... }                                            │   │  │
│  │  │  }                                                                  │   │  │
│  │  └─────────────────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │ HTTPS POST
                          │ /api/v1/location/update
                          ▼
      ┌─────────────────────────────────────────────────────────────────────────────┐
      │                           API GATEWAY                                        │
      └─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 API Gateway Processing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY PROCESSING                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Request Reception                               │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   TLS           │  │   Rate          │  │   Request       │          │  │
│  │  │   Termination   │  │   Limiting      │  │   Logging       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • SSL handshake │  │ • Per IP limit  │  │ • Request ID    │          │  │
│  │  │ • Certificate   │  │ • Per user      │  │ • Timestamp     │          │  │
│  │  │   validation    │  │   limit         │  │ • IP address    │          │  │
│  │  │ • Protocol      │  │ • Geofencing    │  │ • User agent    │          │  │
│  │  │   upgrade       │  │ • Throttling    │  │ • Correlation   │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                       Authentication & Authorization                    │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   JWT           │  │   Permission    │  │   Session       │          │  │
│  │  │   Validation    │  │   Check         │  │   Management    │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Token         │  │ • Location      │  │ • Session       │          │  │
│  │  │   signature     │  │   sharing       │  │   validation    │          │  │
│  │  │ • Expiration    │  │   permission    │  │ • Activity      │          │  │
│  │  │   check         │  │ • Route access  │  │   tracking      │          │  │
│  │  │ • Blacklist     │  │ • Contributor   │  │ • Timeout       │          │  │
│  │  │   validation    │  │   status        │  │   management    │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Input Validation & Sanitization                 │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Schema        │  │   Business      │  │   Security      │          │  │
│  │  │   Validation    │  │   Rules         │  │   Checks        │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • JSON schema   │  │ • Coordinate    │  │ • SQL injection │          │  │
│  │  │   validation    │  │   bounds        │  │   prevention    │          │  │
│  │  │ • Data types    │  │ • Speed limits  │  │ • XSS           │          │  │
│  │  │ • Required      │  │ • Time window   │  │   prevention    │          │  │
│  │  │   fields        │  │   validation    │  │ • Input         │          │  │
│  │  │ • Field sizes   │  │ • Route         │  │   sanitization  │          │  │
│  │  │                 │  │   validation    │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                          Request Routing                               │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Load          │  │   Service       │  │   Circuit       │          │  │
│  │  │   Balancing     │  │   Discovery     │  │   Breaker       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Round robin   │  │ • Health check  │  │ • Failure       │          │  │
│  │  │ • Least         │  │ • Service       │  │   detection     │          │  │
│  │  │   connections   │  │   registry      │  │ • Fallback      │          │  │
│  │  │ • Geographic    │  │ • Dynamic       │  │   responses     │          │  │
│  │  │   proximity     │  │   routing       │  │ • Recovery      │          │  │
│  │  │                 │  │                 │  │   monitoring    │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │ Internal Service Call
                          │ POST /location-service/ingest
                          ▼
      ┌─────────────────────────────────────────────────────────────────────────────┐
      │                       LOCATION SERVICE                                       │
      └─────────────────────────────────────────────────────────────────────────────┘
```

## 3. Data Validation and Processing Flow

### 3.1 Location Service Processing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LOCATION SERVICE PROCESSING                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                       Data Ingestion Pipeline                          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Immediate     │  │   Duplicate     │  │   Basic         │          │  │
│  │  │   Validation    │  │   Detection     │  │   Enrichment    │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Timestamp     │  │ • Hash-based    │  │ • Route         │          │  │
│  │  │   validation    │  │   dedup         │  │   matching      │          │  │
│  │  │ • Coordinate    │  │ • Time-based    │  │ • Stop          │          │  │
│  │  │   range check   │  │   window        │  │   proximity     │          │  │
│  │  │ • Required      │  │ • User session  │  │ • Speed         │          │  │
│  │  │   fields        │  │   tracking      │  │   calculation   │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Kafka Message Publishing                        │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Raw Data      │  │   Enriched      │  │   User          │          │  │
│  │  │   Topic         │  │   Data Topic    │  │   Activity      │          │  │
│  │  │                 │  │                 │  │   Topic         │          │  │
│  │  │ • topic:        │  │ • topic:        │  │ • topic:        │          │  │
│  │  │   raw-location  │  │   enriched-     │  │   user-events   │          │  │
│  │  │ • partition by  │  │   location      │  │ • partition by  │          │  │
│  │  │   route_id      │  │ • partition by  │  │   user_id       │          │  │
│  │  │ • replication   │  │   route_id      │  │ • session       │          │  │
│  │  │   factor: 3     │  │ • TTL: 1 hour   │  │   tracking      │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                           Response Generation                           │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Acknowledgment│  │   Metrics       │  │   Error         │          │  │
│  │  │   Response      │  │   Update        │  │   Handling      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Status: 202   │  │ • User          │  │ • Validation    │          │  │
│  │  │ • Location ID   │  │   contribution  │  │   errors        │          │  │
│  │  │ • Processing    │  │   count         │  │ • Service       │          │  │
│  │  │   status        │  │ • Route         │  │   failures      │          │  │
│  │  │ • Next poll     │  │   activity      │  │ • Retry         │          │  │
│  │  │   interval      │  │ • Quality       │  │   mechanisms    │          │  │
│  │  │                 │  │   metrics       │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │ Kafka Message
                          │ Topic: raw-location-data
                          ▼
      ┌─────────────────────────────────────────────────────────────────────────────┐
      │                      ML VALIDATION PIPELINE                                  │
      └─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 ML Validation Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ML VALIDATION PIPELINE                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Feature Engineering Stage                         │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Spatial       │  │   Temporal      │  │   Movement      │          │  │
│  │  │   Features      │  │   Features      │  │   Features      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Distance to   │  │ • Time since    │  │ • Speed         │          │  │
│  │  │   route         │  │   last update   │  │   consistency   │          │  │
│  │  │ • Stop          │  │ • Day of week   │  │ • Acceleration  │          │  │
│  │  │   proximity     │  │ • Time of day   │  │   patterns      │          │  │
│  │  │ • Geofence      │  │ • Update        │  │ • Direction     │          │  │
│  │  │   validation    │  │   frequency     │  │   changes       │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                │                                        │  │
│  │                                ▼                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │  │
│  │  │                      Feature Vector                                │   │  │
│  │  │                                                                     │   │  │
│  │  │  [distance_to_route, speed_consistency, time_since_last,           │   │  │
│  │  │   stop_proximity, acceleration, heading_consistency,                │   │  │
│  │  │   accuracy_score, signal_strength, movement_pattern, ...]           │   │  │
│  │  └─────────────────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                       Model Ensemble Processing                        │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Anomaly       │  │   GPS Spoofing  │  │   Quality       │          │  │
│  │  │   Detection     │  │   Detection     │  │   Scoring       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Isolation     │  │ • Neural        │  │ • XGBoost       │          │  │
│  │  │   Forest        │  │   Network       │  │   Regressor     │          │  │
│  │  │ • LOF algorithm │  │ • Pattern       │  │ • Feature       │          │  │
│  │  │ • Statistical   │  │   analysis      │  │   importance    │          │  │
│  │  │   outliers      │  │ • Behavioral    │  │ • Confidence    │          │  │
│  │  │                 │  │   fingerprints  │  │   scores        │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ Result:         │  │ Result:         │  │ Result:         │          │  │
│  │  │ anomaly_score   │  │ spoofing_prob   │  │ quality_score   │          │  │
│  │  │ (0.0 - 1.0)     │  │ (0.0 - 1.0)     │  │ (0.0 - 1.0)     │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Decision Fusion Engine                          │  │
│  │                                                                         │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │  │
│  │  │                    Weighted Score Calculation                      │   │  │
│  │  │                                                                     │   │  │
│  │  │  final_score = (                                                    │   │  │
│  │  │    0.4 * quality_score +                                            │   │  │
│  │  │    0.3 * (1 - anomaly_score) +                                      │   │  │
│  │  │    0.3 * (1 - spoofing_prob)                                        │   │  │
│  │  │  )                                                                  │   │  │
│  │  │                                                                     │   │  │
│  │  │  Decision Rules:                                                    │   │  │
│  │  │  • final_score >= 0.8: ACCEPT                                       │   │  │
│  │  │  • final_score >= 0.6: ACCEPT_WITH_CAUTION                          │   │  │
│  │  │  • final_score >= 0.4: FLAG_FOR_REVIEW                              │   │  │
│  │  │  • final_score < 0.4: REJECT                                        │   │  │
│  │  └─────────────────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                          Output Publishing                             │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Validated     │  │   Rejected      │  │   Quality       │          │  │
│  │  │   Data Topic    │  │   Data Topic    │  │   Metrics       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • topic:        │  │ • topic:        │  │ • User quality  │          │  │
│  │  │   validated-    │  │   rejected-     │  │   scores        │          │  │
│  │  │   location      │  │   location      │  │ • Route         │          │  │
│  │  │ • Enhanced with │  │ • Rejection     │  │   reliability   │          │  │
│  │  │   quality score │  │   reasons       │  │ • System        │          │  │
│  │  │ • Route to      │  │ • For analysis  │  │   performance   │          │  │
│  │  │   real-time     │  │   & training    │  │   metrics       │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │ Kafka Message
                          │ Topic: validated-location-data
                          ▼
      ┌─────────────────────────────────────────────────────────────────────────────┐
      │                     REAL-TIME DISTRIBUTION SERVICE                          │
      └─────────────────────────────────────────────────────────────────────────────┘
```

## 4. Real-Time Distribution Flow

### 4.1 Real-Time Processing Service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      REAL-TIME DISTRIBUTION SERVICE                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Message Consumption                             │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Kafka         │  │   Message       │  │   Load          │          │  │
│  │  │   Consumer      │  │   Processing    │  │   Balancing     │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Subscribe to  │  │ • Deserialize   │  │ • Consumer      │          │  │
│  │  │   validated-    │  │   location data │  │   groups        │          │  │
│  │  │   location      │  │ • Extract route │  │ • Partition     │          │  │
│  │  │ • Batch         │  │   information   │  │   assignment    │          │  │
│  │  │   processing    │  │ • Prepare for   │  │ • Offset        │          │  │
│  │  │ • Offset        │  │   distribution  │  │   management    │          │  │
│  │  │   management    │  │                 │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Route-Based Aggregation                         │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Vehicle       │  │   Route         │  │   Stop          │          │  │
│  │  │   Grouping      │  │   Statistics    │  │   Updates       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Group by      │  │ • Active        │  │ • ETA           │          │  │
│  │  │   vehicle ID    │  │   vehicles      │  │   calculations  │          │  │
│  │  │ • Track         │  │ • Average speed │  │ • Delay         │          │  │
│  │  │   movement      │  │ • Route         │  │   estimates     │          │  │
│  │  │ • Calculate     │  │   occupancy     │  │ • Crowding      │          │  │
│  │  │   ETA updates   │  │ • Service       │  │   levels        │          │  │
│  │  │                 │  │   frequency     │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                           Cache Updates                                │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Redis         │  │   Route Cache   │  │   User          │          │  │
│  │  │   Hot Cache     │  │   Updates       │  │   Subscriptions │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Vehicle       │  │ • Route status  │  │ • Active        │          │  │
│  │  │   locations     │  │ • Service       │  │   WebSocket     │          │  │
│  │  │ • Real-time     │  │   alerts        │  │   connections   │          │  │
│  │  │   ETAs          │  │ • Performance   │  │ • User          │          │  │
│  │  │ • Service       │  │   metrics       │  │   preferences   │          │  │
│  │  │   status        │  │ • Live updates  │  │ • Notification  │          │  │
│  │  │                 │  │                 │  │   settings      │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Data Persistence                                │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   InfluxDB      │  │   PostgreSQL    │  │   PostGIS       │          │  │
│  │  │   Time-Series   │  │   Relational    │  │   Spatial       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Location      │  │ • User activity │  │ • Route         │          │  │
│  │  │   history       │  │ • Trip records  │  │   geometries    │          │  │
│  │  │ • Performance   │  │ • Service       │  │ • Stop          │          │  │
│  │  │   metrics       │  │   metrics       │  │   locations     │          │  │
│  │  │ • System        │  │ • Quality       │  │ • Geofence      │          │  │
│  │  │   analytics     │  │   scores        │  │   data          │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │ WebSocket Messages
                          │ Route-based channels
                          ▼
      ┌─────────────────────────────────────────────────────────────────────────────┐
      │                     WEBSOCKET DISTRIBUTION                                   │
      └─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 WebSocket Distribution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WEBSOCKET DISTRIBUTION SERVICE                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                        Connection Management                            │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Connection    │  │   Channel       │  │   User          │          │  │
│  │  │   Pool          │  │   Subscriptions │  │   Presence      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Active        │  │ • Route-based   │  │ • Online        │          │  │
│  │  │   connections   │  │   channels      │  │   status        │          │  │
│  │  │ • Connection    │  │ • User-specific │  │ • Last seen     │          │  │
│  │  │   health        │  │   channels      │  │   timestamp     │          │  │
│  │  │ • Load          │  │ • Global        │  │ • Device        │          │  │
│  │  │   balancing     │  │   announcements │  │   information   │          │  │
│  │  │ • Heartbeat     │  │ • Subscription  │  │ • Connectivity  │          │  │
│  │  │   monitoring    │  │   management    │  │   quality       │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                         Message Broadcasting                            │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Route         │  │   Vehicle       │  │   Service       │          │  │
│  │  │   Updates       │  │   Location      │  │   Alerts        │          │  │
│  │  │                 │  │   Updates       │  │                 │          │  │
│  │  │ • Route status  │  │ • Real-time     │  │ • Delays        │          │  │
│  │  │   changes       │  │   position      │  │ • Route         │          │  │
│  │  │ • Service       │  │ • Speed and     │  │   disruptions   │          │  │
│  │  │   frequency     │  │   direction     │  │ • Emergency     │          │  │
│  │  │ • Capacity      │  │ • ETA updates   │  │   notifications │          │  │
│  │  │   information   │  │ • Stop          │  │ • Weather       │          │  │
│  │  │                 │  │   arrivals      │  │   alerts        │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ Channel:        │  │ Channel:        │  │ Channel:        │          │  │
│  │  │ route_<id>      │  │ vehicle_<id>    │  │ alerts_global   │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                          Message Filtering                             │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   User          │  │   Geographic    │  │   Relevance     │          │  │
│  │  │   Preferences   │  │   Filtering     │  │   Scoring       │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Notification  │  │ • User          │  │ • Message       │          │  │
│  │  │   settings      │  │   location      │  │   priority      │          │  │
│  │  │ • Route         │  │ • Geofence      │  │ • User          │          │  │
│  │  │   subscriptions │  │   boundaries    │  │   interest      │          │  │
│  │  │ • Alert         │  │ • Distance      │  │ • Time          │          │  │
│  │  │   thresholds    │  │   thresholds    │  │   sensitivity   │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                         Delivery Optimization                          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Batch         │  │   Compression   │  │   Delivery      │          │  │
│  │  │   Optimization  │  │   & Encoding    │  │   Confirmation  │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Message       │  │ • Gzip          │  │ • ACK           │          │  │
│  │  │   batching      │  │   compression   │  │   tracking      │          │  │
│  │  │ • Deduplication │  │ • Binary        │  │ • Retry         │          │  │
│  │  │ • Priority      │  │   encoding      │  │   mechanism     │          │  │
│  │  │   queuing       │  │ • Protocol      │  │ • Fallback      │          │  │
│  │  │ • Rate          │  │   optimization  │  │   strategies    │          │  │
│  │  │   limiting      │  │                 │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │ WebSocket Messages
                          │ Real-time Updates
                          ▼
      ┌─────────────────────────────────────────────────────────────────────────────┐
      │                          MOBILE CLIENTS                                      │
      └─────────────────────────────────────────────────────────────────────────────┘
```

## 5. End-to-End Data Flow Timeline

### 5.1 Complete Flow Sequence

```
Timeline: Location Update Journey (Target: <15 seconds end-to-end)

T+0s    ┌─────────────────┐
        │ Mobile App      │  User sharing location
        │ GPS Collection  │  • GPS reading: 12.9716, 77.5946
        └─────────────────┘  • Accuracy: 5.2m, Speed: 45.5 km/h

T+0.1s  ┌─────────────────┐
        │ Data Validation │  Mobile app processing
        │ & Preparation   │  • Schema validation
        └─────────────────┘  • Privacy anonymization

T+0.5s  ┌─────────────────┐
        │ HTTPS API Call  │  POST /api/v1/location/update
        │ to Gateway      │  • TLS encryption
        └─────────────────┘  • Request authentication

T+1.0s  ┌─────────────────┐
        │ API Gateway     │  Security & routing
        │ Processing      │  • JWT validation
        └─────────────────┘  • Rate limiting check

T+1.5s  ┌─────────────────┐
        │ Location        │  Initial processing
        │ Service         │  • Duplicate detection
        └─────────────────┘  • Basic validation

T+2.0s  ┌─────────────────┐
        │ Kafka           │  Message publishing
        │ Publishing      │  • Topic: raw-location-data
        └─────────────────┘  • Partition: route-based

T+2.5s  ┌─────────────────┐
        │ ML Validation   │  Feature engineering
        │ Pipeline        │  • Spatial features
        └─────────────────┘  • Movement patterns

T+4.0s  ┌─────────────────┐
        │ Model           │  Anomaly & spoofing detection
        │ Processing      │  • Quality scoring
        └─────────────────┘  • Decision fusion

T+5.0s  ┌─────────────────┐
        │ Validation      │  Validated data publishing
        │ Results         │  • Topic: validated-location
        └─────────────────┘  • Quality score: 0.85

T+6.0s  ┌─────────────────┐
        │ Real-time       │  Route aggregation
        │ Processing      │  • Vehicle grouping
        └─────────────────┘  • ETA calculations

T+7.0s  ┌─────────────────┐
        │ Cache Updates   │  Hot cache refresh
        │ & Persistence   │  • Redis: vehicle locations
        └─────────────────┘  • InfluxDB: time-series

T+8.0s  ┌─────────────────┐
        │ WebSocket       │  Message broadcasting
        │ Distribution    │  • Route channels
        └─────────────────┘  • User subscriptions

T+9.0s  ┌─────────────────┐
        │ Message         │  Filtering & optimization
        │ Filtering       │  • Geographic relevance
        └─────────────────┘  • User preferences

T+10s   ┌─────────────────┐
        │ Client          │  Real-time update delivery
        │ Delivery        │  • WebSocket message
        └─────────────────┘  • UI update trigger

T+11s   ┌─────────────────┐
        │ Mobile App      │  UI refresh
        │ Update          │  • Map update
        └─────────────────┘  • ETA refresh

Total Latency: ~11 seconds (within 15-second target)
```

## 6. Error Handling and Recovery Flows

### 6.1 Failure Recovery Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERROR HANDLING FLOWS                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Network Failure Recovery                          │  │
│  │                                                                         │  │
│  │  Mobile App → API Gateway (FAILED)                                      │  │
│  │      ↓                                                                  │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Offline       │  │   Retry         │  │   Background    │          │  │
│  │  │   Queue         │  │   Logic         │  │   Sync          │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Store locally │  │ • Exponential   │  │ • WiFi          │          │  │
│  │  │ • SQLite cache  │  │   backoff       │  │   detection     │          │  │
│  │  │ • Compression   │  │ • Circuit       │  │ • Batch sync    │          │  │
│  │  │ • Metadata      │  │   breaker       │  │ • Conflict      │          │  │
│  │  │   tracking      │  │ • Max attempts  │  │   resolution    │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Service Failure Recovery                          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Circuit       │  │   Fallback      │  │   Dead Letter   │          │  │
│  │  │   Breaker       │  │   Service       │  │   Queue         │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Failure       │  │ • Cached data   │  │ • Failed        │          │  │
│  │  │   detection     │  │ • Degraded      │  │   messages      │          │  │
│  │  │ • Trip opened   │  │   functionality │  │ • Manual        │          │  │
│  │  │ • Health        │  │ • Basic         │  │   intervention  │          │  │
│  │  │   monitoring    │  │   validation    │  │ • Replay        │          │  │
│  │  │ • Recovery      │  │ • Static data   │  │   capability    │          │  │
│  │  │   detection     │  │   serving       │  │                 │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Data Quality Recovery                              │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Validation    │  │   Quality       │  │   User          │          │  │
│  │  │   Failures      │  │   Degradation   │  │   Feedback      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Reject bad    │  │ • Lower         │  │ • Report        │          │  │
│  │  │   data          │  │   thresholds    │  │   issues        │          │  │
│  │  │ • User          │  │ • More          │  │ • Quality       │          │  │
│  │  │   notification  │  │   validation    │  │   feedback      │          │  │
│  │  │ • Data          │  │ • Increased     │  │ • Manual        │          │  │
│  │  │   quarantine    │  │   monitoring    │  │   verification  │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 7. Performance Optimization Flow

### 7.1 Caching Integration Points

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CACHING INTEGRATION FLOW                             │
│                                                                             │
│  Location Data Request Flow:                                                │
│                                                                             │
│  1. Mobile App Request                                                      │
│     ↓                                                                       │
│  2. Check Mobile Cache (SQLite)                                             │
│     ├─ HIT: Return cached data                                              │
│     └─ MISS: Continue to API                                                │
│         ↓                                                                   │
│  3. API Gateway Cache (Redis)                                               │
│     ├─ HIT: Return cached response                                          │
│     └─ MISS: Forward to service                                             │
│         ↓                                                                   │
│  4. Application Cache (Redis)                                               │
│     ├─ HIT: Return processed data                                           │
│     └─ MISS: Query database                                                 │
│         ↓                                                                   │
│  5. Database Query                                                          │
│     ├─ PostgreSQL (metadata)                                                │
│     ├─ InfluxDB (time-series)                                               │
│     └─ PostGIS (spatial)                                                    │
│         ↓                                                                   │
│  6. Cache Population (Write-through)                                        │
│     ├─ Application cache                                                    │
│     ├─ API gateway cache                                                    │
│     └─ CDN cache (if applicable)                                            │
│                                                                             │
│  Cache Invalidation Triggers:                                              │
│  • New location data → Invalidate route cache                              │
│  • Service alerts → Invalidate affected routes                             │
│  • User preferences → Invalidate user-specific cache                       │
│  • Time-based expiry → Background refresh                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Summary

This comprehensive data flow documentation shows how location data moves through
the BMTC Transit App system:

1. **Collection**: Mobile apps collect GPS data with privacy protection
2. **Ingestion**: API Gateway validates and routes data to processing services
3. **Validation**: ML pipeline ensures data quality and prevents spoofing
4. **Processing**: Real-time services aggregate and enrich location data
5. **Distribution**: WebSocket services deliver updates to subscribed users
6. **Persistence**: Multi-database strategy stores different data types
   optimally

The entire flow is designed to complete within 15 seconds while maintaining data
quality, user privacy, and system scalability for 10,000+ concurrent users.

<function_calls> <invoke name="TodoWrite"> <parameter name="todos">[{"content":
"Create high-level system architecture diagram showing mobile apps, backend
services, databases, and data flow", "status": "completed", "priority": "high",
"id": "arch-overview"}, {"content": "Define technology stack for mobile (React
Native/Flutter/Native), backend (Node.js/Python/Go), database
(MongoDB/PostgreSQL), and real-time processing", "status": "completed",
"priority": "high", "id": "tech-stack"}, {"content": "Design core data models
for users, routes, vehicles, locations, stops, and reports", "status":
"completed", "priority": "high", "id": "data-models"}, {"content": "Design
real-time data processing architecture for location streaming, validation, and
distribution", "status": "completed", "priority": "high", "id":
"realtime-architecture"}, {"content": "Design REST API endpoints for user
management, route data, location sharing, and trip planning", "status":
"completed", "priority": "medium", "id": "api-design"}, {"content": "Design
WebSocket/real-time communication for live location updates and notifications",
"status": "completed", "priority": "medium", "id": "websocket-design"},
{"content": "Design geospatial data processing system for route validation, stop
proximity, and movement detection", "status": "completed", "priority": "high",
"id": "geospatial-system"}, {"content": "Design privacy-preserving data pipeline
ensuring anonymization and data retention policies", "status": "completed",
"priority": "high", "id": "privacy-architecture"}, {"content": "Design mobile
app architecture with offline capabilities, background location tracking, and
battery optimization", "status": "completed", "priority": "medium", "id":
"mobile-app-architecture"}, {"content": "Design gamification system architecture
for points, leaderboards, achievements, and user engagement", "status":
"completed", "priority": "medium", "id": "gamification-system"}, {"content":
"Design machine learning pipeline for data validation, anomaly detection, and
quality scoring", "status": "completed", "priority": "medium", "id":
"ml-validation-system"}, {"content": "Design caching strategy for route data,
real-time updates, and offline functionality", "status": "completed",
"priority": "medium", "id": "caching-strategy"}, {"content": "Design scalability
architecture to handle 10k+ concurrent users and 100+ contributors per route",
"status": "completed", "priority": "medium", "id": "scalability-plan"},
{"content": "Design security architecture including authentication,
authorization, and GPS spoofing prevention", "status": "completed", "priority":
"medium", "id": "security-design"}, {"content": "Create detailed data flow
diagrams for location sharing, validation, and real-time distribution",
"status": "completed", "priority": "medium", "id": "data-flow-diagrams"},
{"content": "Design component interaction diagrams showing how mobile apps,
backend services, and databases communicate", "status": "pending", "priority":
"medium", "id": "component-interactions"}, {"content": "Design technical
approach for cold start problem using scheduled data and gradual transition to
real-time", "status": "pending", "priority": "medium", "id":
"cold-start-strategy"}, {"content": "Design monitoring and observability system
for real-time performance tracking and alerting", "status": "pending",
"priority": "low", "id": "monitoring-observability"}, {"content": "Design
deployment architecture with CI/CD, staging environments, and production
infrastructure", "status": "pending", "priority": "low", "id":
"deployment-architecture"}, {"content": "Design accessibility architecture for
screen readers, voice announcements, and multi-language support", "status":
"pending", "priority": "low", "id": "accessibility-design"}]
