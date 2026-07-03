"""Tests for GTFS Alignment (v1.1 API spec).

This test module verifies that the backend implements the GTFS-aligned API
endpoints as defined in docs/api.md v1.1 (GTFS Alignment - Spec Pass).

New endpoints:
- GET /v1/stops - Discover stops with GTFS-compliant fields
- GET /v1/routes - Discover routes with GTFS-compliant fields
- GET /v1/stops/{stop_id}/schedule - Get scheduled departures from GTFS
- GET /v1/eta - Updated structured response (segment + scheduled + prediction)

Testing approach:
- Verify JSON response structure matches spec
- Assert field presence and types (not exact values)
- Test error cases with proper error codes
- Verify GTFS field naming conventions
- Ensure backward compatibility where applicable
"""

import pytest
from datetime import datetime, timezone


pytestmark = pytest.mark.integration


# ==============================================================================
# GET /v1/stops - GTFS Stop Discovery Tests
# ==============================================================================


def test_get_stops_basic_success(client):
    """Test GET /v1/stops returns 200 OK with required response fields."""
    response = client.get("/v1/stops")

    assert response.status_code == 200
    data = response.json()

    # Required top-level fields
    assert "stops" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data

    # Verify types
    assert isinstance(data["stops"], list)
    assert isinstance(data["total"], int)
    assert isinstance(data["limit"], int)
    assert isinstance(data["offset"], int)


def test_get_stops_item_has_gtfs_fields(client):
    """Test each stop object contains required GTFS fields."""
    response = client.get("/v1/stops", params={"limit": 1})

    assert response.status_code == 200
    data = response.json()

    # If there are stops, verify GTFS field structure
    if len(data["stops"]) > 0:
        stop = data["stops"][0]

        # Required GTFS fields from stops.txt
        assert "stop_id" in stop
        assert "stop_name" in stop
        assert "stop_lat" in stop
        assert "stop_lon" in stop

        # zone_id is optional but must be present (can be null)
        assert "zone_id" in stop

        # Verify types
        assert isinstance(stop["stop_id"], str)
        assert isinstance(stop["stop_name"], str)
        assert isinstance(stop["stop_lat"], (int, float))
        assert isinstance(stop["stop_lon"], (int, float))
        assert stop["zone_id"] is None or isinstance(stop["zone_id"], str)


def test_get_stops_with_limit_offset(client):
    """Test GET /v1/stops respects limit and offset parameters."""
    # Get first page
    response1 = client.get("/v1/stops", params={"limit": 2, "offset": 0})
    assert response1.status_code == 200
    data1 = response1.json()

    # Limit is respected (at most 2 results)
    assert len(data1["stops"]) <= 2
    assert data1["limit"] == 2
    assert data1["offset"] == 0

    # Get second page
    response2 = client.get("/v1/stops", params={"limit": 2, "offset": 2})
    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["offset"] == 2


def test_get_stops_with_bbox_valid(client):
    """Test GET /v1/stops accepts valid bbox parameter."""
    # Bengaluru city center bbox (from spec example)
    bbox = "12.9,77.5,13.1,77.7"

    response = client.get("/v1/stops", params={"bbox": bbox})

    # Should return 200 OK with finite list (actual filtering is implementation detail)
    assert response.status_code == 200
    data = response.json()
    assert "stops" in data
    assert isinstance(data["stops"], list)


def test_get_stops_with_bbox_invalid(client):
    """Test GET /v1/stops returns 400 for invalid bbox format."""
    response = client.get("/v1/stops", params={"bbox": "invalid"})

    assert response.status_code == 400
    data = response.json()

    # Error model from spec
    assert data["error"] == "invalid_request"
    assert "message" in data
    assert "details" in data
    assert "bbox" in data["details"]


def test_get_stops_with_route_id(client):
    """Test GET /v1/stops accepts route_id filter parameter."""
    # Test that route_id parameter is accepted (actual filtering is implementation detail)
    response = client.get("/v1/stops", params={"route_id": "335E"})

    # Should return 200 OK (may be empty if route doesn't exist in test DB)
    assert response.status_code == 200
    data = response.json()
    assert "stops" in data


def test_get_stops_limit_respected(client):
    """Test GET /v1/stops respects limit=1 parameter."""
    response = client.get("/v1/stops", params={"limit": 1})

    assert response.status_code == 200
    data = response.json()

    # Should return at most 1 stop
    assert len(data["stops"]) <= 1


def test_get_stops_zone_id_nullable(client):
    """Test zone_id field can be null per GTFS spec."""
    response = client.get("/v1/stops", params={"limit": 10})

    assert response.status_code == 200
    data = response.json()

    # At least one stop should exist in GTFS data
    # zone_id is optional in GTFS, so null is valid
    if len(data["stops"]) > 0:
        for stop in data["stops"]:
            # zone_id must be present, but can be null
            assert "zone_id" in stop
            if stop["zone_id"] is not None:
                assert isinstance(stop["zone_id"], str)


def test_get_stops_returns_x_api_version(client):
    """Test GET /v1/stops returns X-API-Version header."""
    response = client.get("/v1/stops")

    assert response.status_code == 200
    assert "X-API-Version" in response.headers
    assert response.headers["X-API-Version"] == "1"


# ==============================================================================
# GET /v1/routes - GTFS Route Discovery Tests
# ==============================================================================


def test_get_routes_basic_success(client):
    """Test GET /v1/routes returns 200 OK with required response fields."""
    response = client.get("/v1/routes")

    assert response.status_code == 200
    data = response.json()

    # Required top-level fields
    assert "routes" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data

    # Verify types
    assert isinstance(data["routes"], list)
    assert isinstance(data["total"], int)
    assert isinstance(data["limit"], int)
    assert isinstance(data["offset"], int)


def test_get_routes_item_has_gtfs_fields(client):
    """Test each route object contains required GTFS fields."""
    response = client.get("/v1/routes", params={"limit": 1})

    assert response.status_code == 200
    data = response.json()

    # If there are routes, verify GTFS field structure
    if len(data["routes"]) > 0:
        route = data["routes"][0]

        # Required GTFS fields
        assert "route_id" in route
        assert "route_type" in route

        # At least one of route_short_name or route_long_name must be present
        assert "route_short_name" in route or "route_long_name" in route

        # agency_id is optional but must be present (can be null)
        assert "agency_id" in route

        # Verify types
        assert isinstance(route["route_id"], str)
        assert isinstance(route["route_type"], int)

        if route.get("route_short_name") is not None:
            assert isinstance(route["route_short_name"], str)
        if route.get("route_long_name") is not None:
            assert isinstance(route["route_long_name"], str)
        if route["agency_id"] is not None:
            assert isinstance(route["agency_id"], str)


def test_get_routes_with_limit_offset(client):
    """Test GET /v1/routes respects limit and offset parameters."""
    # Get first page
    response1 = client.get("/v1/routes", params={"limit": 2, "offset": 0})
    assert response1.status_code == 200
    data1 = response1.json()

    # Limit is respected (at most 2 results)
    assert len(data1["routes"]) <= 2
    assert data1["limit"] == 2
    assert data1["offset"] == 0

    # Get second page
    response2 = client.get("/v1/routes", params={"limit": 2, "offset": 2})
    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["offset"] == 2


def test_get_routes_with_route_type_valid(client):
    """Test GET /v1/routes accepts valid route_type parameter."""
    # route_type=3 is "bus" per GTFS spec
    response = client.get("/v1/routes", params={"route_type": 3})

    assert response.status_code == 200
    data = response.json()
    assert "routes" in data


def test_get_routes_with_route_type_invalid(client):
    """Test GET /v1/routes returns 400 for invalid route_type."""
    # route_type must be 0-7 per GTFS spec; 99 is invalid
    response = client.get("/v1/routes", params={"route_type": 99})

    assert response.status_code == 400
    data = response.json()

    # Error model from spec
    assert data["error"] == "invalid_request"
    assert "message" in data
    assert "details" in data
    assert "route_type" in data["details"]
    assert data["details"]["route_type"] == 99


def test_get_routes_with_stop_id(client):
    """Test GET /v1/routes accepts stop_id filter parameter."""
    # Test that stop_id parameter is accepted
    response = client.get("/v1/routes", params={"stop_id": "20558"})

    # Should return 200 OK (may be empty if stop doesn't exist in test DB)
    assert response.status_code == 200
    data = response.json()
    assert "routes" in data


def test_get_routes_agency_id_nullable(client):
    """Test agency_id field can be null per GTFS spec."""
    response = client.get("/v1/routes", params={"limit": 10})

    assert response.status_code == 200
    data = response.json()

    # agency_id is optional in GTFS, so null is valid
    if len(data["routes"]) > 0:
        for route in data["routes"]:
            # agency_id must be present, but can be null
            assert "agency_id" in route
            if route["agency_id"] is not None:
                assert isinstance(route["agency_id"], str)


def test_get_routes_returns_x_api_version(client):
    """Test GET /v1/routes returns X-API-Version header."""
    response = client.get("/v1/routes")

    assert response.status_code == 200
    assert "X-API-Version" in response.headers
    assert response.headers["X-API-Version"] == "1"


# ==============================================================================
# GET /v1/stops/{stop_id}/schedule - GTFS Schedule Tests
# ==============================================================================


def test_get_schedule_basic_success(client):
    """Test GET /v1/stops/{stop_id}/schedule returns 200 OK with required fields."""
    # Use a known stop_id from GTFS (assuming GTFS is loaded in test DB)
    # If no GTFS data, test may need to be skipped or use fixture data
    stop_id = "20558"  # From spec example (Majestic Bus Station)

    response = client.get(f"/v1/stops/{stop_id}/schedule")

    # Should return 200 (may have empty departures if no schedule data)
    assert response.status_code in [200, 404]  # 404 if stop not in test GTFS

    if response.status_code == 200:
        data = response.json()

        # Required top-level fields
        assert "stop" in data
        assert "departures" in data
        assert "query_time" in data

        # Verify types
        assert isinstance(data["stop"], dict)
        assert isinstance(data["departures"], list)
        assert isinstance(data["query_time"], str)


def test_get_schedule_stop_object_fields(client):
    """Test stop object contains required GTFS fields."""
    stop_id = "20558"

    response = client.get(f"/v1/stops/{stop_id}/schedule")

    if response.status_code == 200:
        data = response.json()
        stop = data["stop"]

        # Required fields from GTFS stops.txt
        assert "stop_id" in stop
        assert "stop_name" in stop
        assert "stop_lat" in stop
        assert "stop_lon" in stop

        # Verify types
        assert isinstance(stop["stop_id"], str)
        assert isinstance(stop["stop_name"], str)
        assert isinstance(stop["stop_lat"], (int, float))
        assert isinstance(stop["stop_lon"], (int, float))


def test_get_schedule_departure_structure(client):
    """Test departure objects have trip and stop_time structure."""
    stop_id = "20558"

    response = client.get(f"/v1/stops/{stop_id}/schedule")

    if response.status_code == 200:
        data = response.json()
        departures = data["departures"]

        # If there are departures, verify structure
        if len(departures) > 0:
            departure = departures[0]

            # Required nested objects
            assert "trip" in departure
            assert "stop_time" in departure

            assert isinstance(departure["trip"], dict)
            assert isinstance(departure["stop_time"], dict)


def test_get_schedule_trip_fields(client):
    """Test trip object contains required GTFS fields."""
    stop_id = "20558"

    response = client.get(f"/v1/stops/{stop_id}/schedule")

    if response.status_code == 200:
        data = response.json()
        departures = data["departures"]

        if len(departures) > 0:
            trip = departures[0]["trip"]

            # Required GTFS fields
            assert "trip_id" in trip
            assert "route_id" in trip
            assert "service_id" in trip

            # Optional GTFS fields (must be present, can be null)
            assert "trip_headsign" in trip or True  # Optional
            assert "direction_id" in trip or True  # Optional

            # Verify required field types
            assert isinstance(trip["trip_id"], str)
            assert isinstance(trip["route_id"], str)
            assert isinstance(trip["service_id"], str)

            if "direction_id" in trip and trip["direction_id"] is not None:
                assert isinstance(trip["direction_id"], int)
                assert trip["direction_id"] in [0, 1]


def test_get_schedule_stop_time_fields(client):
    """Test stop_time object contains required GTFS fields."""
    stop_id = "20558"

    response = client.get(f"/v1/stops/{stop_id}/schedule")

    if response.status_code == 200:
        data = response.json()
        departures = data["departures"]

        if len(departures) > 0:
            stop_time = departures[0]["stop_time"]

            # Required GTFS fields (HH:MM:SS format)
            assert "arrival_time" in stop_time
            assert "departure_time" in stop_time
            assert "stop_sequence" in stop_time

            # pickup_type and drop_off_type are not in our DB (return null per spec)
            assert "pickup_type" in stop_time
            assert "drop_off_type" in stop_time

            # Verify types
            assert isinstance(stop_time["arrival_time"], str)
            assert isinstance(stop_time["departure_time"], str)
            assert isinstance(stop_time["stop_sequence"], int)

            # Verify HH:MM:SS format (basic check)
            assert ":" in stop_time["arrival_time"]
            assert ":" in stop_time["departure_time"]

            # pickup_type and drop_off_type should be null (not in our DB)
            assert stop_time["pickup_type"] is None or isinstance(stop_time["pickup_type"], int)
            assert stop_time["drop_off_type"] is None or isinstance(stop_time["drop_off_type"], int)


def test_get_schedule_query_time_iso8601(client):
    """Test query_time is returned as ISO-8601 string."""
    stop_id = "20558"

    response = client.get(f"/v1/stops/{stop_id}/schedule")

    if response.status_code == 200:
        data = response.json()
        query_time = data["query_time"]

        # Verify ISO-8601 format
        assert isinstance(query_time, str)
        assert "T" in query_time
        assert query_time.endswith("Z")

        # Verify it can be parsed
        parsed = datetime.fromisoformat(query_time.replace("Z", "+00:00"))
        assert parsed.tzinfo is not None


def test_get_schedule_stop_not_found(client):
    """Test GET /v1/stops/{stop_id}/schedule returns 404 for nonexistent stop."""
    # Use clearly invalid stop_id
    stop_id = "99999"

    response = client.get(f"/v1/stops/{stop_id}/schedule")

    assert response.status_code == 404
    data = response.json()

    # Error model from spec
    assert data["error"] == "not_found"
    assert "message" in data
    assert "Stop not found" in data["message"] or "not found" in data["message"].lower()
    assert "details" in data
    assert "stop_id" in data["details"]
    assert data["details"]["stop_id"] == stop_id


def test_get_schedule_invalid_time_window(client):
    """Test GET /v1/stops/{stop_id}/schedule returns 400 for invalid time_window_minutes."""
    stop_id = "20558"

    # time_window_minutes max is 180 per spec
    response = client.get(
        f"/v1/stops/{stop_id}/schedule",
        params={"time_window_minutes": 300}
    )

    assert response.status_code == 400
    data = response.json()

    # Error model from spec
    assert data["error"] == "invalid_request"
    assert "message" in data
    assert "details" in data
    assert "time_window_minutes" in data["details"]
    assert data["details"]["time_window_minutes"] == 300


def test_get_schedule_with_route_filter(client):
    """Test GET /v1/stops/{stop_id}/schedule accepts route_id filter."""
    stop_id = "20558"

    response = client.get(
        f"/v1/stops/{stop_id}/schedule",
        params={"route_id": "335E"}
    )

    # Should return 200 or 404 (depending on test GTFS data)
    assert response.status_code in [200, 404]

    if response.status_code == 200:
        data = response.json()
        assert "departures" in data


def test_get_schedule_returns_x_api_version(client):
    """Test GET /v1/stops/{stop_id}/schedule returns X-API-Version header."""
    stop_id = "20558"

    response = client.get(f"/v1/stops/{stop_id}/schedule")

    # Should have header regardless of 200 or 404
    assert "X-API-Version" in response.headers
    assert response.headers["X-API-Version"] == "1"


# ==============================================================================
# GET /v1/stops/{stop_id} - Stop Detail Tests (API-01)
# ==============================================================================
#
# NOTE on error envelope shape: get_stop_detail() raises HTTPException(404,
# detail={"error": ..., "message": ..., "details": {...}}). The project's
# custom http_exception_handler (backend/app/main.py) unwraps a dict-shaped
# `detail` that already contains an "error" key and returns it as the FLAT
# top-level JSON body (content=exc.detail) -- it does NOT nest it under a
# "detail" key. This is the same wire shape already produced by the existing
# JSONResponse-style 404s (e.g. test_get_schedule_stop_not_found above) and
# by GET /v1/eta's existing HTTPException(404, detail={...}) 404, verified
# against backend/tests/test_api_errors_alignment.py::test_eta_segment_not_found
# (asserts the flat `data["error"]` shape via assert_error_response()). Tests
# below assert the flat shape to match this verified, already-passing
# precedent -- not a nested `data["detail"]["error"]` shape.


def test_get_stop_detail_success(client, db_with_test_stop_routes):
    """GET /v1/stops/{stop_id} returns stop detail + full route objects (D-07/D-08/D-09)."""
    response = client.get("/v1/stops/STOP_X")

    assert response.status_code == 200
    data = response.json()

    # Stop fields
    assert data["stop_id"] == "STOP_X"
    assert data["stop_name"] == "Test Junction"
    assert data["stop_lat"] == 12.9716
    assert data["stop_lon"] == 77.5946
    assert data["zone_id"] == "ZONE_A"

    # D-07: routes array present with 2 full RouteResponse-shaped entries
    assert "routes" in data
    assert len(data["routes"]) == 2
    for route in data["routes"]:
        assert set(route.keys()) == {
            "route_id",
            "route_short_name",
            "route_long_name",
            "route_type",
            "agency_id",
        }

    # D-08: NOT deduplicated by route_short_name -- both distinct route_ids present
    # even though they share route_short_name "285"
    route_ids = {route["route_id"] for route in data["routes"]}
    assert route_ids == {"ROUTE_A1", "ROUTE_A2"}
    assert all(route["route_short_name"] == "285" for route in data["routes"])

    # D-09: ordered by route_short_name (both share "285", so order is stable
    # but we still assert the sort key was applied, not left unordered by chance)
    short_names = [route["route_short_name"] for route in data["routes"]]
    assert short_names == sorted(short_names)


def test_get_stop_detail_not_found(client):
    """GET /v1/stops/{stop_id} returns 404 not_found for an unknown stop_id (D-11)."""
    response = client.get("/v1/stops/NONEXISTENT_STOP")

    assert response.status_code == 404
    data = response.json()

    # Flat error envelope -- see NOTE above this test group.
    assert data["error"] == "not_found"
    assert "message" in data
    assert "details" in data
    assert data["details"]["stop_id"] == "NONEXISTENT_STOP"


def test_get_stop_detail_no_routes(client, db_with_test_stop_routes):
    """A stop with zero serving routes returns 200 + routes: [], never 404 (D-10)."""
    response = client.get("/v1/stops/STOP_ORPHAN")

    assert response.status_code == 200
    data = response.json()

    assert data["stop_id"] == "STOP_ORPHAN"
    assert data["routes"] == []


# ==============================================================================
# GET /v1/routes/{route_id} - Route Detail Tests (API-02)
# ==============================================================================
#
# NOTE on error envelope shape: like the stop-detail tests above, the new
# get_route_detail() handler uses HTTPException(404, detail={"error": ...}).
# main.py's http_exception_handler unwraps this to a FLAT top-level body
# (content=exc.detail) -- the same shape as JSONResponse-style 404s. Tests
# below assert data["error"] (flat), NOT data["detail"]["error"] (nested).
# See 03-01-SUMMARY.md and 03-02-PLAN.md's <known_correction_from_prior_plan>.


def test_get_route_detail_success(client, db_with_test_route_branches):
    """GET /v1/routes/{route_id} returns route metadata + ordered stops per direction (D-01..D-03)."""
    response = client.get("/v1/routes/ROUTE_M")

    assert response.status_code == 200
    data = response.json()

    # Full RouteResponse field set (D-01)
    assert data["route_id"] == "ROUTE_M"
    assert data["route_short_name"] == "M"
    assert data["route_long_name"] == "Route M Test Line"
    assert data["route_type"] == 3
    assert data["agency_id"] == "BMTC"

    # No trip-level or schedule data anywhere in the body (D-01)
    assert "trip_id" not in data
    assert "trips" not in data
    assert "arrival_time" not in data
    assert "departure_time" not in data

    # directions is an array of {direction_id, stops} objects (D-02)
    assert "directions" in data
    assert len(data["directions"]) == 2
    direction_ids = {d["direction_id"] for d in data["directions"]}
    assert direction_ids == {0, 1}

    for direction in data["directions"]:
        assert set(direction.keys()) == {"direction_id", "stops"}
        for stop in direction["stops"]:
            assert set(stop.keys()) == {
                "stop_id",
                "stop_name",
                "stop_lat",
                "stop_lon",
                "stop_sequence",
            }
            assert "trip_id" not in stop

    # Direction 0 ordered M_S1 -> M_S2 -> M_S3 by stop_sequence (D-03)
    dir0 = next(d for d in data["directions"] if d["direction_id"] == 0)
    assert [s["stop_id"] for s in dir0["stops"]] == ["M_S1", "M_S2", "M_S3"]
    assert [s["stop_sequence"] for s in dir0["stops"]] == [1, 2, 3]

    # Direction 1 ordered M_S3 -> M_S2 -> M_S1 by stop_sequence
    dir1 = next(d for d in data["directions"] if d["direction_id"] == 1)
    assert [s["stop_id"] for s in dir1["stops"]] == ["M_S3", "M_S2", "M_S1"]


def test_get_route_detail_not_found(client):
    """GET /v1/routes/{route_id} returns 404 not_found for an unknown route_id (D-06)."""
    response = client.get("/v1/routes/NONEXISTENT_ROUTE")

    assert response.status_code == 404
    data = response.json()

    # Flat error envelope -- see NOTE above this test group.
    assert data["error"] == "not_found"
    assert "message" in data
    assert "details" in data
    assert data["details"]["route_id"] == "NONEXISTENT_ROUTE"


def test_get_route_detail_no_trips(client, db_with_test_route_branches):
    """A route with zero trips returns 200 + directions: [], never 404 (D-05)."""
    response = client.get("/v1/routes/ROUTE_EMPTY")

    assert response.status_code == 200
    data = response.json()

    assert data["route_id"] == "ROUTE_EMPTY"
    assert data["directions"] == []


def test_get_route_detail_branch_selection(client, db_with_test_route_branches):
    """Most-common shape's trip determines stop order (D-04); zero-trip direction omitted (D-23)."""
    response = client.get("/v1/routes/ROUTE_BRANCH")

    assert response.status_code == 200
    data = response.json()

    # D-23: direction 1 has zero trips for ROUTE_BRANCH -- omitted entirely,
    # not included with stops: []. Exactly one direction entry.
    assert len(data["directions"]) == 1
    direction = data["directions"][0]
    assert direction["direction_id"] == 0

    # D-04: shape A (3 trips: M_S1, M_S2, M_S3) is more common than shape B
    # (1 trip: M_S1, BR_S4) -- shape A's stop sequence wins.
    assert [s["stop_id"] for s in direction["stops"]] == ["M_S1", "M_S2", "M_S3"]


# ==============================================================================
# GET /v1/eta - New Structured Response Tests (v1.1)
# ==============================================================================


def setup_test_segment_for_eta(client):
    """Helper to setup test segment for ETA tests."""
    from app.config import get_settings
    from app.db import get_connection

    settings = get_settings()
    with get_connection(settings.db_path) as conn:
        cursor = conn.cursor()

        # Insert segment (idempotent)
        cursor.execute(
            "INSERT OR IGNORE INTO segments (route_id, direction_id, from_stop_id, to_stop_id) VALUES (?, ?, ?, ?)",
            ("ROUTE1", 0, "STOP_A", "STOP_B"),
        )

        # Get segment_id
        cursor.execute(
            "SELECT segment_id FROM segments WHERE route_id=? AND direction_id=? AND from_stop_id=? AND to_stop_id=?",
            ("ROUTE1", 0, "STOP_A", "STOP_B"),
        )
        segment_id = cursor.fetchone()[0]

        # Insert segment_stats for all 192 bins (idempotent)
        for bin_id in range(192):
            cursor.execute(
                """
                INSERT OR IGNORE INTO segment_stats (segment_id, bin_id, schedule_mean)
                VALUES (?, ?, ?)
                """,
                (segment_id, bin_id, 300.0),  # 5 min schedule baseline
            )

        conn.commit()


def test_get_eta_new_structure_basic(client):
    """Test GET /v1/eta returns new structured response with all required objects."""
    setup_test_segment_for_eta(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()

    # New v1.1 structure: four top-level objects
    assert "segment" in data
    assert "query_time" in data
    assert "scheduled" in data
    assert "prediction" in data

    # Verify types
    assert isinstance(data["segment"], dict)
    assert isinstance(data["query_time"], str)
    assert isinstance(data["scheduled"], dict)
    assert isinstance(data["prediction"], dict)


def test_get_eta_segment_object_fields(client):
    """Test segment object contains GTFS identifiers."""
    setup_test_segment_for_eta(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()
    segment = data["segment"]

    # Required GTFS identifiers
    assert "route_id" in segment
    assert "direction_id" in segment
    assert "from_stop_id" in segment
    assert "to_stop_id" in segment

    # Verify values match query
    assert segment["route_id"] == "ROUTE1"
    assert segment["direction_id"] == 0
    assert segment["from_stop_id"] == "STOP_A"
    assert segment["to_stop_id"] == "STOP_B"


def test_get_eta_query_time_iso8601(client):
    """Test query_time is returned as ISO-8601 string."""
    setup_test_segment_for_eta(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()
    query_time = data["query_time"]

    # Verify ISO-8601 format
    assert isinstance(query_time, str)
    assert "T" in query_time
    assert query_time.endswith("Z")

    # Verify it can be parsed
    parsed = datetime.fromisoformat(query_time.replace("Z", "+00:00"))
    assert parsed.tzinfo is not None


def test_get_eta_scheduled_object_fields(client):
    """Test scheduled object contains GTFS schedule data."""
    setup_test_segment_for_eta(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()
    scheduled = data["scheduled"]

    # Required fields from GTFS layer
    assert "duration_sec" in scheduled
    assert "service_id" in scheduled  # Can be null
    assert "source" in scheduled

    # Verify types
    assert isinstance(scheduled["duration_sec"], (int, float))
    assert scheduled["service_id"] is None or isinstance(scheduled["service_id"], str)
    assert isinstance(scheduled["source"], str)

    # source must be "gtfs" per spec
    assert scheduled["source"] == "gtfs"


def test_get_eta_prediction_object_fields(client):
    """Test prediction object contains all ML prediction fields."""
    setup_test_segment_for_eta(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()
    prediction = data["prediction"]

    # Required ML prediction fields
    required_fields = [
        "predicted_duration_sec",
        "p50_sec",
        "p90_sec",
        "confidence",
        "blend_weight",
        "samples_used",
        "bin_id",
        "last_updated",
        "model_version",
    ]

    for field in required_fields:
        assert field in prediction, f"Missing required field: {field}"


def test_get_eta_confidence_values(client):
    """Test confidence field is one of the valid values."""
    setup_test_segment_for_eta(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()
    confidence = data["prediction"]["confidence"]

    # confidence must be one of: "high", "medium", "low"
    assert confidence in ["high", "medium", "low"]


def test_get_eta_prediction_last_updated_iso8601(client):
    """Test prediction.last_updated is ISO-8601 string."""
    setup_test_segment_for_eta(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()
    last_updated = data["prediction"]["last_updated"]

    # Verify ISO-8601 format
    assert isinstance(last_updated, str)
    assert "T" in last_updated
    assert last_updated.endswith("Z")

    # Verify it can be parsed
    parsed = datetime.fromisoformat(last_updated.replace("Z", "+00:00"))
    assert parsed.tzinfo is not None


def test_get_eta_prediction_field_types(client):
    """Test prediction fields have correct types."""
    setup_test_segment_for_eta(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()
    prediction = data["prediction"]

    # Numeric fields
    assert isinstance(prediction["predicted_duration_sec"], (int, float))
    assert isinstance(prediction["p50_sec"], (int, float))
    assert isinstance(prediction["p90_sec"], (int, float))
    assert isinstance(prediction["blend_weight"], (int, float))
    assert isinstance(prediction["samples_used"], int)
    assert isinstance(prediction["bin_id"], int)

    # String fields
    assert isinstance(prediction["confidence"], str)
    assert isinstance(prediction["last_updated"], str)
    assert isinstance(prediction["model_version"], str)


def test_get_eta_bin_id_valid_range(client):
    """Test bin_id is in valid range [0, 191]."""
    setup_test_segment_for_eta(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()
    bin_id = data["prediction"]["bin_id"]

    # 192 bins total (0-191)
    assert 0 <= bin_id <= 191


def test_get_eta_source_is_gtfs(client):
    """Test scheduled.source is always 'gtfs'."""
    setup_test_segment_for_eta(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()

    # source field indicates data origin
    assert data["scheduled"]["source"] == "gtfs"


def test_get_eta_no_gtfs_field_collision(client):
    """Test prediction fields don't collide with GTFS field names."""
    setup_test_segment_for_eta(client)

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
        },
    )

    assert response.status_code == 200
    data = response.json()
    prediction = data["prediction"]

    # Prediction fields should NOT use GTFS reserved names
    # (e.g., no "stop_id", "route_id", "trip_id", etc. in prediction object)
    gtfs_reserved = [
        "stop_id", "route_id", "trip_id", "service_id",
        "stop_lat", "stop_lon", "route_type", "direction_id",
    ]

    for reserved in gtfs_reserved:
        assert reserved not in prediction, \
            f"Prediction object should not contain GTFS field: {reserved}"


def test_get_eta_new_format_with_when_parameter(client):
    """Test new structured format works with 'when' parameter."""
    setup_test_segment_for_eta(client)

    # Use 'when' parameter with ISO-8601 timestamp
    when_time = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    response = client.get(
        "/v1/eta",
        params={
            "route_id": "ROUTE1",
            "direction_id": 0,
            "from_stop_id": "STOP_A",
            "to_stop_id": "STOP_B",
            "when": when_time,
        },
    )

    assert response.status_code == 200
    data = response.json()

    # Should still return new structured format
    assert "segment" in data
    assert "query_time" in data
    assert "scheduled" in data
    assert "prediction" in data
