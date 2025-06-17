# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Bengaluru Crowdsourced Transit App - a real-time public transportation tracking system that relies entirely on crowdsourced location data from users riding BMTC buses and Namma Metro. The app focuses exclusively on Bengaluru metropolitan area and does not use official transit APIs.

## Key Architectural Principles

### Crowdsourcing-First Design
- All real-time data comes from users sharing location while riding transit
- No integration with official BMTC/Metro APIs - purely crowdsourced
- Minimum 2 users required on same route for data validation
- Anonymous location sharing with 3-5 second intervals during active travel

### Privacy-by-Design
- All location data must be immediately anonymized upon receipt
- No personally identifiable information stored or transmitted
- Real-time location data retained for maximum 24 hours only
- Users have complete control over location sharing activation

### Mobile-First Platform Requirements
- Support Android 8.0+ and iOS 14.0+
- Offline mode for basic functionality
- Battery usage <5% during 30-minute sharing session
- Data usage <50MB per month for typical users

## Core System Components

### Real-Time Location Processing
- GPS movement pattern detection (vehicle vs walking)
- Route validation within 100-meter tolerance
- Speed filtering (>80 kmph invalid for buses)
- GPS spoofing detection through movement analysis

### Data Validation Pipeline
- Automatic anomalous data filtering
- Confidence scoring for all predictions
- Historical pattern validation
- Machine learning algorithms for data quality

### Gamification System
- Points for location sharing minutes
- Route-specific and city-wide leaderboards
- Achievement badges for milestones
- Monthly leaderboard resets

## Performance Requirements

### Scalability Targets
- 10,000+ concurrent active users across Bengaluru
- 100+ simultaneous contributors per major route during peak
- 1 million+ registered users capacity
- 99.5% uptime during peak transit hours (7-10 AM, 5-8 PM)

### Real-Time Processing
- Location updates every 10-15 seconds for viewers
- <15 second latency for real-time data updates
- Smooth vehicle icon animation with position interpolation
- Gradual fade for stale GPS data (>30 seconds)

## Development Considerations

### Multi-Platform Strategy
The app requires both Android and iOS support. Consider:
- React Native, Flutter, or native development approaches
- Shared backend services for real-time processing
- Platform-specific optimizations for GPS and battery usage

### Backend Architecture
- Real-time data streaming capabilities
- Geospatial data processing for route validation
- Scalable user session management
- Anonymous data aggregation systems

### Accessibility Requirements
- Android TalkBack and iOS VoiceOver compatibility
- High contrast mode and adjustable fonts
- Audio announcements for navigation
- English and Kannada language support

## Cold Start Strategy

Since the app depends entirely on crowdsourced data:
- Initially display official BMTC/Metro schedules
- Gradually transition to real-time as user base grows
- Focus on major routes first for user acquisition
- Implement referral mechanisms and viral sharing

## Route and Stop Data

- Comprehensive BMTC route database with variations (500A, 500B, etc.)
- Bi-directional route tracking
- All BMTC bus stops and Metro stations with coordinates
- Support for Purple and Green Metro lines with future extensibility