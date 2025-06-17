# REST API Design - BMTC Transit App

## Overview

This document defines the RESTful API endpoints for the BMTC Transit App. The API follows REST principles, implements proper HTTP methods and status codes, and supports both mobile applications and web interfaces.

## API Design Principles

### 1. RESTful Architecture
- Resources identified by URIs
- Standard HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Stateless communication
- Consistent response formats
- Proper HTTP status codes

### 2. Versioning Strategy
- URL-based versioning: `/api/v1/`
- Backward compatibility for at least 2 versions
- Deprecation notices for older versions
- Migration guides for version updates

### 3. Security Standards
- JWT-based authentication
- Rate limiting and throttling
- Input validation and sanitization
- Privacy-preserving data handling

## Base URL Structure

```
Production: https://api.bmtctransit.com/v1
Staging: https://staging-api.bmtctransit.com/v1
Development: https://dev-api.bmtctransit.com/v1
```

## Authentication

### JWT Authentication
```http
Authorization: Bearer <jwt_token>
```

### API Key Authentication (for public endpoints)
```http
X-API-Key: <api_key>
```

## API Endpoints

### 1. User Management

#### Register User
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "string (3-50 chars)",
  "email": "string (valid email)",
  "password": "string (min 8 chars)",
  "display_name": "string (optional)",
  "preferred_language": "string (en|kn, default: en)"
}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "success": true,
  "data": {
    "user_id": "uuid",
    "username": "string",
    "email": "string",
    "display_name": "string",
    "preferred_language": "string",
    "created_at": "ISO 8601 timestamp"
  },
  "token": {
    "access_token": "jwt_string",
    "refresh_token": "jwt_string",
    "expires_in": 3600
  }
}
```

#### User Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "string",
  "password": "string"
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "user_id": "uuid",
    "username": "string",
    "email": "string",
    "display_name": "string",
    "last_login_at": "ISO 8601 timestamp"
  },
  "token": {
    "access_token": "jwt_string",
    "refresh_token": "jwt_string",
    "expires_in": 3600
  }
}
```

#### Get User Profile
```http
GET /api/v1/users/profile
Authorization: Bearer <token>
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "user_id": "uuid",
    "username": "string",
    "email": "string",
    "display_name": "string",
    "avatar_url": "string",
    "preferred_language": "string",
    "total_points": 1500,
    "level": 3,
    "total_distance_shared": 245.7,
    "total_time_shared": 1440,
    "achievements_count": 12,
    "privacy_settings": {
      "location_sharing_enabled": true,
      "profile_visibility": "public",
      "data_retention_days": 30
    },
    "created_at": "ISO 8601 timestamp",
    "last_login_at": "ISO 8601 timestamp"
  }
}
```

#### Update User Profile
```http
PATCH /api/v1/users/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "display_name": "string (optional)",
  "avatar_url": "string (optional)",
  "preferred_language": "string (optional)"
}
```

#### Update Privacy Settings
```http
PATCH /api/v1/users/privacy-settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "location_sharing_enabled": true,
  "profile_visibility": "public|private",
  "data_retention_days": 30,
  "analytics_opt_out": false
}
```

### 2. Route Management

#### Get All Routes
```http
GET /api/v1/routes
Query Parameters:
  - route_type: string (bus|metro)
  - operator: string (bmtc|bmrcl)
  - operational_status: string (active|suspended)
  - search: string (route number or name)
  - limit: integer (default: 50, max: 100)
  - offset: integer (default: 0)
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "routes": [
      {
        "route_id": "uuid",
        "route_number": "500A",
        "route_name": "Kempegowda Bus Station - Electronic City",
        "route_type": "bus",
        "operator": "bmtc",
        "variant": "A",
        "service_type": "ordinary",
        "operational_status": "active",
        "frequency_peak_minutes": 15,
        "frequency_offpeak_minutes": 25,
        "first_service_time": "05:30:00",
        "last_service_time": "23:00:00",
        "total_distance": 28.5,
        "estimated_duration": 85,
        "active_vehicles": 12,
        "last_updated": "ISO 8601 timestamp"
      }
    ],
    "pagination": {
      "total": 1247,
      "limit": 50,
      "offset": 0,
      "has_next": true
    }
  }
}
```

#### Get Route Details
```http
GET /api/v1/routes/{route_id}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "route_id": "uuid",
    "route_number": "500A",
    "route_name": "Kempegowda Bus Station - Electronic City",
    "route_type": "bus",
    "operator": "bmtc",
    "description": "High-frequency route connecting city center to IT corridor",
    "stops": [
      {
        "stop_id": "uuid",
        "stop_name": "Kempegowda Bus Station",
        "stop_code": "KBS",
        "sequence_number": 1,
        "direction": "up",
        "distance_from_start": 0.0,
        "estimated_travel_time": 0,
        "is_major_stop": true,
        "latitude": 12.9767,
        "longitude": 77.5993
      }
    ],
    "geometry": {
      "type": "LineString",
      "coordinates": [[77.5993, 12.9767], [77.6001, 12.9760]]
    },
    "real_time_data": {
      "active_vehicles": 12,
      "average_speed": 18.5,
      "current_delays": 5.2,
      "last_updated": "ISO 8601 timestamp"
    }
  }
}
```

#### Get Route Stops
```http
GET /api/v1/routes/{route_id}/stops
Query Parameters:
  - direction: string (up|down|forward|backward)
```

### 3. Stop Management

#### Get All Stops
```http
GET /api/v1/stops
Query Parameters:
  - stop_type: string (bus_stop|metro_station)
  - bounds: string (lat_min,lng_min,lat_max,lng_max)
  - search: string (stop name or code)
  - limit: integer (default: 50)
  - offset: integer (default: 0)
```

#### Get Stop Details
```http
GET /api/v1/stops/{stop_id}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "stop_id": "uuid",
    "stop_code": "KBS",
    "stop_name": "Kempegowda Bus Station",
    "stop_name_kannada": "ಕೆಂಪೇಗೌಡ ಬಸ್ ನಿಲ್ದಾಣ",
    "stop_type": "bus_stop",
    "latitude": 12.9767,
    "longitude": 77.5993,

    "accessibility": {
      "wheelchair_accessible": true,
      "has_shelter": true,
      "has_seating": true,
      "has_lighting": true
    },
    "routes": [
      {
        "route_id": "uuid",
        "route_number": "500A",
        "direction": "up",
        "sequence_number": 1
      }
    ],
    "real_time_data": {
      "arriving_vehicles": [
        {
          "route_id": "uuid",
          "route_number": "500A",
          "estimated_arrival": "2024-01-15T10:25:00Z",
          "confidence": 0.85,
          "crowding_level": "medium"
        }
      ],
      "last_updated": "ISO 8601 timestamp"
    }
  }
}
```

### 4. Location Sharing

#### Start Location Sharing
```http
POST /api/v1/location/start-sharing
Authorization: Bearer <token>
Content-Type: application/json

{
  "route_id": "uuid",
  "direction": "up|down|forward|backward"
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "session_id": "uuid",
    "route_id": "uuid",
    "direction": "up",
    "started_at": "ISO 8601 timestamp",
    "privacy_level": "medium",
    "expected_contribution_points": 15
  }
}
```

#### Submit Location Data
```http
POST /api/v1/location/update
Authorization: Bearer <token>
Content-Type: application/json

{
  "session_id": "uuid",
  "latitude": 12.9767,
  "longitude": 77.5993,
  "speed": 25.5,
  "heading": 135.0,
  "accuracy": 5.0,
  "timestamp": "ISO 8601 timestamp"
}
```

**Response:**
```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "success": true,
  "data": {
    "processed": true,
    "contribution_points": 1,
    "other_contributors": 5,
    "data_quality_score": 0.92
  }
}
```

#### Stop Location Sharing
```http
POST /api/v1/location/stop-sharing
Authorization: Bearer <token>
Content-Type: application/json

{
  "session_id": "uuid"
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "session_id": "uuid",
    "duration_minutes": 25,
    "distance_covered": 8.5,
    "points_earned": 25,
    "riders_helped": 12,
    "stopped_at": "ISO 8601 timestamp"
  }
}
```

### 5. Real-Time Data

#### Get Real-Time Vehicle Locations
```http
GET /api/v1/real-time/routes/{route_id}/vehicles
Query Parameters:
  - direction: string (up|down|forward|backward)
  - bounds: string (lat_min,lng_min,lat_max,lng_max)
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "vehicles": [
      {
        "vehicle_id": "anonymous_id",
        "route_id": "uuid",
        "direction": "up",
        "latitude": 12.9767,
        "longitude": 77.5993,
        "speed": 18.5,
        "heading": 135.0,
        "contributor_count": 3,
        "confidence_score": 0.88,
        "last_updated": "ISO 8601 timestamp",
        "data_freshness": "fresh",
        "next_stops": [
          {
            "stop_id": "uuid",
            "stop_name": "Dairy Circle",
            "estimated_arrival": "2024-01-15T10:25:00Z",
            "distance": 2.1
          }
        ]
      }
    ],
    "route_status": {
      "active_vehicles": 8,
      "total_contributors": 15,
      "average_speed": 19.2,
      "service_status": "normal"
    },
    "last_updated": "ISO 8601 timestamp"
  }
}
```

#### Get Stop ETAs
```http
GET /api/v1/real-time/stops/{stop_id}/etas
Query Parameters:
  - route_id: string (optional, filter by route)
  - limit: integer (default: 10)
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "stop_id": "uuid",
    "stop_name": "Dairy Circle",
    "arrivals": [
      {
        "route_id": "uuid",
        "route_number": "500A",
        "direction": "up",
        "estimated_arrival": "2024-01-15T10:25:00Z",
        "confidence": 0.85,
        "vehicle_id": "anonymous_id",
        "crowding_level": "medium",
        "delay_minutes": 3,
        "data_source": "crowdsourced"
      }
    ],
    "last_updated": "ISO 8601 timestamp"
  }
}
```

### 6. Trip Planning

#### Plan Trip
```http
POST /api/v1/trips/plan
Content-Type: application/json

{
  "origin": {
    "latitude": 12.9767,
    "longitude": 77.5993
  },
  "destination": {
    "latitude": 12.8456,
    "longitude": 77.6632
  },
  "departure_time": "ISO 8601 timestamp (optional)",
  "route_types": ["bus", "metro"],
  "preferences": {
    "minimize": "time|cost|walking",
    "max_walking_distance": 1000,
    "accessibility_required": false
  }
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "trip_options": [
      {
        "trip_id": "uuid",
        "total_duration": 45,
        "total_distance": 18.5,
        "walking_distance": 0.8,
        "estimated_cost": 25,
        "carbon_footprint": 1.2,
        "confidence": 0.78,
        "legs": [
          {
            "leg_type": "walking",
            "duration": 5,
            "distance": 0.4,
            "from": {
              "name": "Current Location",
              "latitude": 12.9767,
              "longitude": 77.5993
            },
            "to": {
              "name": "Kempegowda Bus Station",
              "stop_id": "uuid"
            },
            "instructions": "Walk 400m north to bus stop"
          },
          {
            "leg_type": "transit",
            "route_id": "uuid",
            "route_number": "500A",
            "duration": 35,
            "distance": 17.7,
            "boarding_stop": {
              "stop_id": "uuid",
              "stop_name": "Kempegowda Bus Station",
              "departure_time": "2024-01-15T10:30:00Z"
            },
            "alighting_stop": {
              "stop_id": "uuid",
              "stop_name": "Electronic City",
              "arrival_time": "2024-01-15T11:05:00Z"
            },
            "real_time_data": {
              "next_departure": "2024-01-15T10:28:00Z",
              "crowding_level": "medium"
            }
          }
        ]
      }
    ]
  }
}
```

#### Get Trip Updates
```http
GET /api/v1/trips/{trip_id}/updates
Authorization: Bearer <token>
```

### 7. Service Reports

#### Submit Service Report
```http
POST /api/v1/reports
Authorization: Bearer <token>
Content-Type: application/json

{
  "route_id": "uuid",
  "stop_id": "uuid (optional)",
  "report_type": "crowding|delay|service_issue|vehicle_condition",
  "severity": "low|medium|high|critical",
  "description": "string",
  "location": {
    "latitude": 12.9767,
    "longitude": 77.5993
  },
  "details": {
    "crowding_level": "high",
    "vehicle_condition": {
      "ac_working": false,
      "cleanliness": 2,
      "accessibility": true
    }
  }
}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "success": true,
  "data": {
    "report_id": "uuid",
    "status": "submitted",
    "points_awarded": 5,
    "estimated_impact": "medium",
    "reported_at": "ISO 8601 timestamp"
  }
}
```

#### Get Reports
```http
GET /api/v1/reports
Query Parameters:
  - route_id: string (optional)
  - stop_id: string (optional)
  - report_type: string (optional)
  - severity: string (optional)
  - status: string (active|resolved|expired)
  - limit: integer (default: 20)
  - offset: integer (default: 0)
```

### 8. Gamification

#### Get User Statistics
```http
GET /api/v1/gamification/stats
Authorization: Bearer <token>
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "total_points": 1500,
    "level": 3,
    "points_to_next_level": 500,
    "total_distance_shared": 245.7,
    "total_time_shared": 1440,
    "riders_helped": 89,
    "achievements": [
      {
        "achievement_id": "uuid",
        "name": "First Contributor",
        "description": "Share your first location",
        "points": 10,
        "achieved_at": "ISO 8601 timestamp"
      }
    ],
    "current_streaks": {
      "daily_sharing": 5,
      "weekly_contribution": 2
    }
  }
}
```

#### Get Leaderboards
```http
GET /api/v1/gamification/leaderboards
Query Parameters:
  - type: string (daily|weekly|monthly|all_time)
  - route_id: string (optional, for route-specific leaderboards)
  - limit: integer (default: 10, max: 100)
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "leaderboard_type": "weekly",
    "period": {
      "start": "2024-01-08",
      "end": "2024-01-14"
    },
    "user_rank": 15,
    "top_contributors": [
      {
        "rank": 1,
        "username": "TransitChampion",
        "display_name": "Transit Champion",
        "points": 750,
        "distance_shared": 125.8,
        "riders_helped": 45,
        "avatar_url": "string"
      }
    ],
    "total_participants": 1247
  }
}
```

## Error Handling

### Standard Error Response Format
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ],
    "request_id": "uuid",
    "timestamp": "ISO 8601 timestamp"
  }
}
```

### Common Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | VALIDATION_ERROR | Invalid request data |
| 401 | UNAUTHORIZED | Authentication required |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Resource conflict |
| 429 | RATE_LIMITED | Rate limit exceeded |
| 500 | INTERNAL_ERROR | Server error |
| 503 | SERVICE_UNAVAILABLE | Service temporarily unavailable |

## Rate Limiting

### Rate Limit Headers
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

### Rate Limits by Endpoint Type

| Endpoint Category | Limit | Window |
|------------------|-------|---------|
| Authentication | 5 requests | 1 minute |
| Location Updates | 120 requests | 1 minute |
| General API | 1000 requests | 1 hour |
| Real-time Data | 60 requests | 1 minute |

## Pagination

### Standard Pagination Format
```json
{
  "data": [...],
  "pagination": {
    "total": 1247,
    "limit": 50,
    "offset": 0,
    "has_next": true,
    "has_previous": false
  }
}
```

This comprehensive API design provides all necessary endpoints for the BMTC Transit App while maintaining consistency, security, and performance standards.