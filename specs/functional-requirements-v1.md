# Bengaluru Crowdsourced Transit App - Functional Requirements

## 1. Core System Requirements

### 1.1 Platform Support

- **FR-1.1.1**: The app SHALL support Android 8.0+ and iOS 14.0+ devices
- **FR-1.1.2**: The app SHALL function on devices with GPS capabilities and
  network connectivity
- **FR-1.1.3**: The app SHALL support offline mode for basic functionality when
  network is unavailable
- **FR-1.1.4**: The app SHALL be optimized for devices with varying screen sizes
  (4.7" to 6.7")

### 1.2 Geographic Coverage

- **FR-1.2.1**: The app SHALL focus exclusively on Bengaluru metropolitan area
  as defined by BMTC and BMRCL service boundaries
- **FR-1.2.2**: The app SHALL support BMTC bus routes across all operational
  zones
- **FR-1.2.3**: The app SHALL support Namma Metro Purple Line and Green Line
  with future extensibility
- **FR-1.2.4**: The app SHALL maintain a database of all BMTC bus stops and
  Metro stations with coordinates

## 2. Crowdsourcing Core Features

### 2.1 Real-Time Location Sharing (GO Feature)

- **FR-2.1.1**: Users SHALL be able to opt-in to share real-time location while
  riding BMTC buses or Namma Metro
- **FR-2.1.2**: Location sharing SHALL activate only when user confirms they are
  on a specific route/vehicle
- **FR-2.1.3**: Location data SHALL be shared every 3-5 seconds while actively
  traveling
- **FR-2.1.4**: Location sharing SHALL automatically stop when user reaches
  destination or manually exits
- **FR-2.1.5**: All shared location data SHALL be completely anonymous with no
  personal identifiers
- **FR-2.1.6**: Users SHALL see real-time indicator showing how many other
  riders they are helping

### 2.2 Vehicle Detection and Validation

- **FR-2.2.1**: App SHALL use GPS movement patterns to detect when user is on a
  moving vehicle vs walking
- **FR-2.2.2**: App SHALL validate crowdsourced location against expected route
  paths within 100-meter tolerance
- **FR-2.2.3**: App SHALL filter out obviously incorrect location data (e.g.,
  speeds >80 kmph for buses)
- **FR-2.2.4**: System SHALL require minimum 2 users on same route for location
  data validation
- **FR-2.2.5**: App SHALL detect and handle GPS spoofing attempts through
  movement pattern analysis

### 2.3 Route Identification

- **FR-2.3.1**: Users SHALL manually select their bus route number or Metro line
  before starting location sharing
- **FR-2.3.2**: App SHALL maintain comprehensive database of BMTC route numbers
  and Metro lines
- **FR-2.3.3**: App SHALL support route variations (e.g., 500A, 500B, 500C) as
  separate entities
- **FR-2.3.4**: System SHALL handle bi-directional routes with separate tracking
  for each direction

## 3. Real-Time Display Features

### 3.1 Vehicle Location Display

- **FR-3.1.1**: App SHALL display real-time vehicle positions on map using
  crowdsourced data
- **FR-3.1.2**: Vehicle icons SHALL show direction of travel and route
  identification
- **FR-3.1.3**: App SHALL display confidence level of location data based on
  number of contributors
- **FR-3.1.4**: Real-time locations SHALL be updated every 10-15 seconds for
  viewing users
- **FR-3.1.5**: App SHALL show estimated time to nearest stops based on current
  vehicle position and speed
- **FR-3.1.6**: Vehicle icons SHALL move smoothly on the map using position
  interpolation between GPS updates
- **FR-3.1.7**: Icon movement SHALL be animated over 3-5 second intervals to
  create continuous motion appearance
- **FR-3.1.8**: System SHALL calculate intermediate positions using linear
  interpolation based on speed and direction
- **FR-3.1.9**: When GPS data is stale (>30 seconds), icon SHALL gradually fade
  or change appearance but continue predicted movement
- **FR-3.1.10**: App SHALL show smooth deceleration animation when vehicle
  approaches stops
- **FR-3.1.11**: Icons SHALL rotate to match direction of travel for realistic
  movement representation

### 3.2 Stop-Level Predictions

- **FR-3.2.1**: App SHALL calculate estimated arrival times at specific stops
  using real-time vehicle locations
- **FR-3.2.2**: Arrival predictions SHALL account for historical travel time
  patterns between stops
- **FR-3.2.3**: App SHALL display uncertainty ranges for arrival times (e.g.,
  "15-20 minutes")
- **FR-3.2.4**: Predictions SHALL be updated continuously as new crowdsourced
  data arrives
- **FR-3.2.5**: App SHALL indicate when no real-time data is available for a
  route

### 3.3 Data Freshness Indicators

- **FR-3.3.1**: App SHALL display timestamp of most recent location update for
  each vehicle
- **FR-3.3.2**: App SHALL use visual indicators (colors/icons) to show data
  freshness (fresh: <2 min, stale: >5 min)
- **FR-3.3.3**: App SHALL show number of active contributors on each route in
  real-time
- **FR-3.3.4**: App SHALL clearly distinguish between crowdsourced data and
  estimated/historical data

## 4. User Engagement and Gamification

### 4.1 Contribution Tracking

- **FR-4.1.1**: App SHALL track individual user contributions (distance
  traveled, time shared, routes helped)
- **FR-4.1.2**: Users SHALL earn points for each minute of location sharing
- **FR-4.1.3**: App SHALL provide daily, weekly, and monthly contribution
  statistics
- **FR-4.1.4**: System SHALL calculate and display "riders helped" metric based
  on user's sharing activity

### 4.2 Leaderboards and Recognition

- **FR-4.2.1**: App SHALL maintain route-specific leaderboards showing top
  contributors
- **FR-4.2.2**: App SHALL provide city-wide leaderboards with anonymized
  usernames/avatars
- **FR-4.2.3**: Users SHALL be able to customize avatar and display name for
  leaderboards
- **FR-4.2.4**: App SHALL offer achievement badges for milestones (e.g., "100 km
  shared", "Route Champion")
- **FR-4.2.5**: Leaderboards SHALL reset monthly to maintain engagement

### 4.3 Social Features

- **FR-4.3.1**: Users SHALL be able to see anonymous avatars of other active
  sharers on their route
- **FR-4.3.2**: App SHALL display real-time count of active contributors in
  user's vicinity
- **FR-4.3.3**: Users SHALL receive notifications when they become top
  contributor on a route
- **FR-4.3.4**: App SHALL show community impact metrics (total kilometers
  tracked, riders helped citywide)

## 5. Service Quality Reporting

### 5.1 Crowd-Reported Service Information

- **FR-5.1.1**: Users SHALL be able to report vehicle crowding levels
  (Low/Medium/High/Full)
- **FR-5.1.2**: Users SHALL be able to report service disruptions, delays, or
  route changes
- **FR-5.1.3**: App SHALL allow reporting of vehicle conditions (AC working,
  cleanliness, accessibility)
- **FR-5.1.4**: Reports SHALL be time-stamped and location-tagged for accuracy
- **FR-5.1.5**: App SHALL aggregate and display crowding reports to other users
  planning trips

### 5.2 Stop and Route Conditions

- **FR-5.2.1**: Users SHALL be able to report stop-level issues (broken shelter,
  poor lighting, safety concerns)
- **FR-5.2.2**: App SHALL collect reports about Metro station facilities
  (escalator status, platform crowding)
- **FR-5.2.3**: Users SHALL rate overall trip experience on 1-5 scale with
  optional comments
- **FR-5.2.4**: App SHALL display aggregated ratings and recent reports for
  routes and stops

### 5.3 Data Validation and Moderation

- **FR-5.3.1**: System SHALL implement automatic filtering for spam or
  inappropriate reports
- **FR-5.3.2**: App SHALL weight reports based on user's historical accuracy and
  contribution level
- **FR-5.3.3**: Similar reports from multiple users SHALL be aggregated and
  prioritized
- **FR-5.3.4**: Reports SHALL expire after predetermined time periods based on
  report type

## 6. Trip Planning and Navigation

### 6.1 Route Planning

- **FR-6.1.1**: App SHALL provide trip planning from any location to any
  destination within Bengaluru
- **FR-6.1.2**: Trip suggestions SHALL prioritize routes with active real-time
  data
- **FR-6.1.3**: App SHALL calculate walking distances to/from stops and stations
- **FR-6.1.4**: Planning SHALL account for current service disruptions reported
  by users
- **FR-6.1.5**: App SHALL provide alternative route suggestions when primary
  route has no data

### 6.2 Real-Time Trip Guidance

- **FR-6.2.1**: App SHALL provide step-by-step navigation from origin to
  destination
- **FR-6.2.2**: Users SHALL receive notifications for departure times based on
  real-time data
- **FR-6.2.3**: App SHALL alert users of approaching stops during their journey
- **FR-6.2.4**: System SHALL automatically adjust trip timing based on live
  crowdsourced updates
- **FR-6.2.5**: App SHALL provide alternative route suggestions if current trip
  is severely delayed

### 6.3 Offline Capabilities

- **FR-6.3.1**: App SHALL cache route maps and stop information for offline
  access
- **FR-6.3.2**: Basic trip planning SHALL function without network connectivity
  using cached data
- **FR-6.3.3**: App SHALL indicate when offline mode is active and real-time
  data unavailable
- **FR-6.3.4**: Cached data SHALL be updated automatically when network
  connection is restored

## 7. Data Management and Privacy

### 7.1 Privacy Protection

- **FR-7.1.1**: App SHALL NOT store or transmit any personally identifiable
  information
- **FR-7.1.2**: Location data SHALL be immediately anonymized and aggregated
  upon receipt
- **FR-7.1.3**: Users SHALL have complete control over when location sharing is
  active
- **FR-7.1.4**: App SHALL provide clear privacy settings and data usage
  explanations
- **FR-7.1.5**: All user data SHALL be deletable upon user request

### 7.2 Data Retention and Storage

- **FR-7.2.1**: Real-time location data SHALL be retained for maximum 24 hours
- **FR-7.2.2**: Aggregated route pattern data SHALL be retained for historical
  analysis and improvements
- **FR-7.2.3**: User contribution statistics SHALL be stored with anonymous
  identifiers only
- **FR-7.2.4**: Service reports SHALL be retained for 30 days unless marked for
  longer-term tracking

### 7.3 Data Quality Assurance

- **FR-7.3.1**: System SHALL implement machine learning algorithms to detect and
  filter anomalous data
- **FR-7.3.2**: App SHALL maintain confidence scores for all real-time
  predictions
- **FR-7.3.3**: Historical data SHALL be used to validate and improve current
  predictions
- **FR-7.3.4**: System SHALL automatically flag and investigate unusual route
  patterns or timing

## 8. Performance and Scalability

### 8.1 System Performance

- **FR-8.1.1**: App SHALL consume less than 5% battery life during 30-minute
  active sharing session
- **FR-8.1.2**: Real-time data updates SHALL have latency of less than 15
  seconds
- **FR-8.1.3**: App SHALL function smoothly with minimum 2GB RAM and basic GPS
  capabilities
- **FR-8.1.4**: Data usage SHALL not exceed 50MB per month for typical user
  engagement

### 8.2 Scalability Requirements

- **FR-8.2.1**: System SHALL support minimum 10,000 concurrent active users
  across Bengaluru
- **FR-8.2.2**: App SHALL handle 100+ simultaneous contributors per major route
  during peak hours
- **FR-8.2.3**: Database SHALL scale to accommodate all BMTC routes and Metro
  lines with future expansion
- **FR-8.2.4**: System SHALL maintain performance with 1 million+ registered
  users

### 8.3 Reliability and Availability

- **FR-8.3.1**: App SHALL have 99.5% uptime during peak transit hours (7-10 AM,
  5-8 PM)
- **FR-8.3.2**: System SHALL gracefully degrade when server connectivity is poor
- **FR-8.3.3**: App SHALL automatically retry failed data uploads when
  connectivity is restored
- **FR-8.3.4**: Critical functions SHALL continue working with reduced features
  during system maintenance

## 9. Accessibility and Localization

### 9.1 Accessibility Features

- **FR-9.1.1**: App SHALL be fully compatible with Android TalkBack and iOS
  VoiceOver
- **FR-9.1.2**: All UI elements SHALL have appropriate accessibility labels and
  descriptions
- **FR-9.1.3**: App SHALL support high contrast mode and adjustable font sizes
- **FR-9.1.4**: Audio announcements SHALL be available for key navigation
  milestones

### 9.2 Language Support

- **FR-9.2.1**: App SHALL support English and Kannada languages with easy
  switching
- **FR-9.2.2**: Route names and stop names SHALL be displayed in both English
  and Kannada
- **FR-9.2.3**: Voice announcements SHALL be available in both supported
  languages
- **FR-9.2.4**: All user interface elements SHALL be properly localized

## 10. Bootstrapping and Growth Strategy

### 10.1 Cold Start Problem Mitigation

- **FR-10.1.1**: App SHALL initially display route information based on official
  BMTC/Metro schedules
- **FR-10.1.2**: System SHALL gradually transition from scheduled to real-time
  data as user base grows
- **FR-10.1.3**: App SHALL prioritize major routes and corridors for initial
  user acquisition
- **FR-10.1.4**: System SHALL implement referral mechanisms to encourage user
  growth

### 10.2 User Acquisition Features

- **FR-10.2.1**: App SHALL provide clear onboarding explaining value proposition
  of crowdsourcing
- **FR-10.2.2**: New users SHALL receive bonus points for first few sharing
  sessions
- **FR-10.2.3**: App SHALL show potential users real-time demonstration of how
  many people they could help
- **FR-10.2.4**: System SHALL implement viral sharing features for user growth

This comprehensive set of functional requirements provides the foundation for
building a crowdsourced-only transit app specifically designed for Bengaluru's
public transportation needs, addressing the unique challenges of relying
entirely on user-generated real-time data while ensuring privacy, engagement,
and reliable service.
