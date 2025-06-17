# System Architecture - BMTC Crowdsourced Transit App

## Overview

The BMTC Transit App is a crowdsourced real-time transit tracking system built on a distributed, scalable architecture. The system processes anonymous location data from mobile users to provide real-time vehicle tracking for Bengaluru's public transportation.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐                           ┌─────────────────┐          │
│  │   Android App   │                           │    iOS App      │          │
│  │                 │                           │                 │          │
│  │ • Location      │                           │ • Location      │          │
│  │   Sharing       │                           │   Sharing       │          │
│  │ • Real-time     │                           │ • Real-time     │          │
│  │   Display       │                           │   Display       │          │
│  │ • Offline Cache │                           │ • Offline Cache │          │
│  │ • Trip Planning │                           │ • Trip Planning │          │
│  └─────────────────┘                           └─────────────────┘          │
└─────────────────────┬───────────────────────────────┬─────────────────────────┘
                      │                               │
         ┌─────────────┼───────────────────────────────┼─────────────────┐
         │           HTTPS/WSS                   HTTPS/WSS              │
         │                                                              │
┌────────▼──────────────────────────────────────────────────────────────▼──────┐
│                              API GATEWAY                                     │
│                                                                               │
│  • Authentication & Authorization                                             │
│  • Rate Limiting & Throttling                                                │
│  • Request Routing                                                            │
│  • WebSocket Connection Management                                            │
│  • API Versioning                                                             │
└────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
         │          │          │          │          │          │
┌────────▼──────────▼──────────▼──────────▼──────────▼──────────▼──────────────┐
│                           MICROSERVICES TIER                                 │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌───────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │   User Service    │  │  Route Service  │  │   Location Processing       │  │
│  │                   │  │                 │  │        Service               │  │
│  │ • Registration    │  │ • Route Data    │  │                             │  │
│  │ • Authentication  │  │ • Stop Info     │  │ • Real-time Validation      │  │
│  │ • Profile Mgmt    │  │ • Schedule Data │  │ • Anonymization             │  │
│  │ • Gamification    │  │ • Route Mapping │  │ • Speed/Movement Detection  │  │
│  └───────────────────┘  └─────────────────┘  │ • GPS Spoofing Detection    │  │
│                                              │ • Data Aggregation          │  │
│  ┌───────────────────┐  ┌─────────────────┐  └─────────────────────────────┘  │
│  │   Trip Service    │  │ Reporting Svc   │                                   │
│  │                   │  │                 │  ┌─────────────────────────────┐  │
│  │ • Trip Planning   │  │ • Service       │  │      Real-time Stream       │  │
│  │ • Navigation      │  │   Reports       │  │       Processing            │  │
│  │ • ETA Calculation │  │ • Crowding      │  │                             │  │
│  │ • Notifications   │  │   Levels        │  │ • Apache Kafka/RabbitMQ     │  │
│  └───────────────────┘  │ • Issue         │  │ • Stream Processing         │  │
│                         │   Tracking      │  │ • Event Sourcing            │  │
│  ┌───────────────────┐  └─────────────────┘  │ • Real-time Analytics       │  │
│  │   ML/Analytics    │                       └─────────────────────────────┘  │
│  │     Service       │  ┌─────────────────┐                                   │
│  │                   │  │ Notification    │  ┌─────────────────────────────┐  │
│  │ • Data Validation │  │    Service      │  │       Cache Layer           │  │
│  │ • Anomaly         │  │                 │  │                             │  │
│  │   Detection       │  │ • Push Notifs   │  │ • Redis Cluster             │  │
│  │ • ML Pipeline     │  │ • Real-time     │  │ • Route Data Cache          │  │
│  │ • Quality Scoring │  │   Alerts        │  │ • Location Cache            │  │
│  └───────────────────┘  │ • User          │  │ • Session Management        │  │
│                         │   Messages      │  └─────────────────────────────┘  │
│                         └─────────────────┘                                   │
└────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
         │          │          │          │          │          │
┌────────▼──────────▼──────────▼──────────▼──────────▼──────────▼──────────────┐
│                              DATA TIER                                       │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Primary Database (PostgreSQL)                       │  │
│  │                                                                         │  │
│  │ • User accounts and profiles                                            │  │
│  │ • Route definitions and stop information                                │  │
│  │ • Gamification data (points, achievements, leaderboards)                │  │
│  │ • Service reports and feedback                                          │  │
│  │ • Aggregated analytics data                                             │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                   Time-Series Database (InfluxDB)                       │  │
│  │                                                                         │  │
│  │ • Real-time location data (24-hour retention)                           │  │
│  │ • Vehicle movement history                                              │  │
│  │ • Performance metrics and monitoring data                               │  │
│  │ • Usage statistics and analytics                                        │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                   Geospatial Database (PostGIS)                         │  │
│  │                                                                         │  │
│  │ • Route geometries and spatial indexes                                  │  │
│  │ • Stop locations and proximity searches                                 │  │
│  │ • Geofencing data for route validation                                  │  │
│  │ • Spatial analytics and route optimization                              │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### Client Tier

**Mobile Applications (Android/iOS)**
- Native or React Native applications
- Real-time location sharing with privacy controls
- Offline-first architecture with local caching
- Background location processing with battery optimization
- Real-time map display with smooth vehicle animations
- Trip planning and navigation features

### API Gateway

**Responsibilities:**
- Single entry point for all client requests
- Authentication and authorization
- Rate limiting and DDoS protection
- Request routing to appropriate microservices
- WebSocket connection management for real-time features
- API versioning and backward compatibility

### Microservices Tier

**Location Processing Service**
- Real-time location data ingestion and validation
- Anonymous data processing and aggregation
- GPS spoofing detection and filtering
- Movement pattern analysis (vehicle vs walking)
- Speed validation and anomaly detection

**User Service**
- User registration and authentication
- Profile management and preferences
- Gamification system (points, achievements, leaderboards)
- Privacy settings and data controls

**Route Service**
- BMTC route definitions and variants
- Bus stop and Metro station data
- Schedule information (for cold start)
- Route geometry and spatial data

**Trip Service**
- Trip planning and routing algorithms
- Real-time ETA calculations
- Navigation assistance
- Alternative route suggestions

**Reporting Service**
- Crowdsourced service quality reports
- Issue tracking and aggregation
- Crowding level reports
- Service disruption notifications

**ML/Analytics Service**
- Data validation and quality scoring
- Anomaly detection algorithms
- Predictive analytics for ETAs
- Usage pattern analysis

**Notification Service**
- Push notifications for mobile apps
- Real-time alerts and updates
- User engagement messaging

**Real-time Stream Processing**
- Apache Kafka or RabbitMQ for message queuing
- Stream processing for real-time data
- Event sourcing for audit trails
- Real-time analytics and monitoring

### Data Tier

**Primary Database (PostgreSQL)**
- User accounts and authentication data
- Route definitions and stop information
- Gamification data and leaderboards
- Service reports and feedback
- System configuration and metadata

**Time-Series Database (InfluxDB)**
- Real-time location data (24-hour retention)
- Vehicle movement patterns
- Performance metrics and system monitoring
- Usage analytics and statistics

**Geospatial Database (PostGIS)**
- Route geometries and spatial indexes
- Stop locations with proximity searches
- Geofencing for route validation
- Spatial analytics and optimization

## Data Flow

### Location Sharing Flow
1. User activates location sharing in mobile app
2. App validates user is on selected route
3. GPS coordinates sent to Location Processing Service
4. Service anonymizes and validates location data
5. Validated data published to real-time stream
6. Other users receive updates via WebSocket connections

### Real-time Display Flow
1. Mobile app subscribes to route-specific WebSocket channels
2. Location Processing Service publishes validated location updates
3. Real-time Stream Processing distributes to subscribed clients
4. Mobile app interpolates positions for smooth animations
5. Cache layer stores recent data for quick access

## Scalability Considerations

- **Horizontal scaling**: Microservices can be scaled independently
- **Load balancing**: API Gateway distributes traffic across service instances
- **Caching**: Redis cluster for frequently accessed data
- **Database sharding**: Route-based partitioning for geospatial data
- **CDN**: Static content delivery for mobile app assets

## Privacy and Security

- **Data anonymization**: Immediate anonymization of all location data
- **Encryption**: TLS 1.3 for all communications
- **Authentication**: JWT tokens with refresh mechanism
- **Data retention**: Automatic deletion of location data after 24 hours
- **Privacy controls**: User-controlled location sharing with granular permissions