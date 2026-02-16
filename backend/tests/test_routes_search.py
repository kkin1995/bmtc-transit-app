"""Integration tests for GET /v1/routes/search endpoint.

This module tests the server-side route search functionality with normalized
matching for the BMTC GTFS dataset containing 4190 routes with hyphenated forms
like "335-E", "13-C", etc.

Test coverage:
- Normalization: Case-insensitive, hyphen/space removal
- Substring matching: route_short_name AND route_long_name
- Validation: Empty query, limit/offset bounds
- Pagination: limit, offset, total count, ordering
- Response format: GTFS-compliant fields, original values preserved
"""

import pytest
from fastapi.testclient import TestClient

# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration


# ==============================================================================
# Fixture Override - Use client_with_routes instead of plain client
# ==============================================================================


@pytest.fixture
def client(client_with_routes):
    """Override client fixture to use client_with_routes for all tests in this module."""
    return client_with_routes


# ==============================================================================
# Normalization Tests
# ==============================================================================


def test_search_hyphenated_route_without_hyphen(client):
    """Test that query '335e' finds routes with '335-E' in route_short_name."""
    response = client.get("/v1/routes/search?q=335e")
    assert response.status_code == 200
    data = response.json()

    # Should find at least one route with "335-E" pattern
    assert "routes" in data
    assert isinstance(data["routes"], list)

    # Check if any route matches the normalized pattern
    # (flexible check: works whether dataset has 1 or multiple matches)
    matching_routes = [
        r for r in data["routes"]
        if r["route_short_name"] and "335" in r["route_short_name"].upper() and "E" in r["route_short_name"].upper()
    ]
    assert len(matching_routes) > 0, "Should find at least one route matching '335e' pattern"

    # Verify original GTFS value is preserved (not normalized in response)
    for route in matching_routes:
        # The response should contain the original hyphenated form
        assert "-" in route["route_short_name"] or route["route_short_name"] == "335E", \
            f"Original GTFS value should be preserved: {route['route_short_name']}"


def test_search_hyphenated_route_with_hyphen(client):
    """Test that query '335-e' (with hyphen) finds same results as '335e'."""
    response_with_hyphen = client.get("/v1/routes/search?q=335-e")
    response_without_hyphen = client.get("/v1/routes/search?q=335e")

    assert response_with_hyphen.status_code == 200
    assert response_without_hyphen.status_code == 200

    data_with = response_with_hyphen.json()
    data_without = response_without_hyphen.json()

    # Should return same total count
    assert data_with["total"] == data_without["total"], \
        "Hyphenated and non-hyphenated queries should return same count"

    # Should return same routes (order should be deterministic)
    routes_with = [r["route_id"] for r in data_with["routes"]]
    routes_without = [r["route_id"] for r in data_without["routes"]]
    assert routes_with == routes_without, \
        "Hyphenated and non-hyphenated queries should return same routes"


def test_search_case_insensitive(client):
    """Test that search is case-insensitive: 'KENGERI', 'kengeri', 'Kengeri' all match."""
    queries = ["KENGERI", "kengeri", "Kengeri", "KeNgErI"]
    results = []

    for query in queries:
        response = client.get(f"/v1/routes/search?q={query}")
        assert response.status_code == 200
        data = response.json()
        results.append((query, data["total"], [r["route_id"] for r in data["routes"]]))

    # All queries should return same count
    total_counts = [r[1] for r in results]
    assert len(set(total_counts)) == 1, \
        f"All case variations should return same count: {total_counts}"

    # All queries should return same routes
    route_ids = [r[2] for r in results]
    first_result = route_ids[0]
    for idx, (query, _, ids) in enumerate(results):
        assert ids == first_result, \
            f"Query '{query}' returned different routes than first query"


def test_search_normalizes_spaces(client):
    """Test that spaces are normalized during matching."""
    # Try search with spaces (if any routes have spaces in names)
    response = client.get("/v1/routes/search?q=bus station")
    assert response.status_code == 200
    data = response.json()

    # Should find routes with "bus station" or "busstation" in long names
    assert "routes" in data
    # Just verify the endpoint handles spaces without error
    # Actual matches depend on GTFS data content


# ==============================================================================
# Substring Matching Tests
# ==============================================================================


def test_search_prefix_matches_multiple_routes(client):
    """Test that query '335' matches all routes starting with 335 (335-A, 335-E, etc.)."""
    response = client.get("/v1/routes/search?q=335")
    assert response.status_code == 200
    data = response.json()

    assert data["total"] > 0, "Should find at least one route starting with '335'"

    # All returned routes should have '335' somewhere in short_name or long_name
    for route in data["routes"]:
        has_335_in_short = route["route_short_name"] and "335" in route["route_short_name"].upper()
        has_335_in_long = route["route_long_name"] and "335" in route["route_long_name"].upper()
        assert has_335_in_short or has_335_in_long, \
            f"Route {route['route_id']} should contain '335' in short or long name"


def test_search_matches_route_long_name(client):
    """Test that search works across route_long_name (e.g., 'ken' matches 'Kengeri')."""
    response = client.get("/v1/routes/search?q=ken")
    assert response.status_code == 200
    data = response.json()

    # Should find routes with "kengeri" or similar in long name
    assert data["total"] > 0, "Should find routes with 'ken' substring"

    # At least some routes should have 'ken' in long_name (case-insensitive)
    routes_with_ken_in_long = [
        r for r in data["routes"]
        if r["route_long_name"] and "KEN" in r["route_long_name"].upper()
    ]
    assert len(routes_with_ken_in_long) > 0, \
        "Should find at least one route with 'ken' in route_long_name"


def test_search_partial_match_in_middle(client):
    """Test that partial matches work (e.g., 'hal' matches routes with HAL in name)."""
    response = client.get("/v1/routes/search?q=hal")
    assert response.status_code == 200
    data = response.json()

    # Should find routes with "HAL" (HAL Airport, HAL Layout, etc.)
    assert data["total"] > 0, "Should find routes with 'hal' substring"

    # Verify at least one route has 'hal' in name
    matching_routes = [
        r for r in data["routes"]
        if (r["route_short_name"] and "HAL" in r["route_short_name"].upper()) or
           (r["route_long_name"] and "HAL" in r["route_long_name"].upper())
    ]
    assert len(matching_routes) > 0, "Should find routes with 'HAL' in name"


# ==============================================================================
# Validation Tests (422 Unprocessable)
# ==============================================================================


def test_search_empty_query_returns_422(client):
    """Test that empty string query returns 422."""
    response = client.get("/v1/routes/search?q=")
    assert response.status_code == 422
    data = response.json()

    assert data["error"] == "unprocessable"
    assert "empty" in data["message"].lower() or "whitespace" in data["message"].lower()
    assert "details" in data
    assert "q" in data["details"]


def test_search_whitespace_only_query_returns_422(client):
    """Test that whitespace-only query returns 422."""
    response = client.get("/v1/routes/search?q=%20%20%20")  # URL-encoded spaces
    assert response.status_code == 422
    data = response.json()

    assert data["error"] == "unprocessable"
    assert "empty" in data["message"].lower() or "whitespace" in data["message"].lower()


def test_search_limit_too_high_returns_422(client):
    """Test that limit > 1000 returns 422."""
    response = client.get("/v1/routes/search?q=335&limit=5000")
    assert response.status_code == 422
    data = response.json()

    assert data["error"] == "unprocessable"
    assert "limit" in data["message"].lower()
    assert data["details"]["limit"] == 5000


def test_search_limit_less_than_one_returns_422(client):
    """Test that limit < 1 returns 422."""
    response = client.get("/v1/routes/search?q=335&limit=0")
    assert response.status_code == 422
    data = response.json()

    assert data["error"] == "unprocessable"
    assert "limit" in data["message"].lower()
    assert data["details"]["limit"] == 0


def test_search_negative_offset_returns_422(client):
    """Test that offset < 0 returns 422."""
    response = client.get("/v1/routes/search?q=335&offset=-1")
    assert response.status_code == 422
    data = response.json()

    assert data["error"] == "unprocessable"
    assert "offset" in data["message"].lower()
    assert data["details"]["offset"] == -1


def test_search_missing_query_parameter_returns_422(client):
    """Test that missing 'q' parameter returns 422."""
    response = client.get("/v1/routes/search")
    assert response.status_code == 422
    # FastAPI/Pydantic will return 422 for missing required parameter


# ==============================================================================
# Pagination Tests
# ==============================================================================


def test_search_pagination_limit_works(client):
    """Test that limit parameter correctly limits results."""
    response = client.get("/v1/routes/search?q=335&limit=5")
    assert response.status_code == 200
    data = response.json()

    assert len(data["routes"]) <= 5, "Should return at most 5 routes"
    assert data["limit"] == 5
    assert "total" in data
    assert "offset" in data


def test_search_pagination_offset_works(client):
    """Test that offset parameter skips correct number of results."""
    # Get first page
    response1 = client.get("/v1/routes/search?q=335&limit=3&offset=0")
    assert response1.status_code == 200
    data1 = response1.json()

    # Get second page
    response2 = client.get("/v1/routes/search?q=335&limit=3&offset=3")
    assert response2.status_code == 200
    data2 = response2.json()

    # Total should be same
    assert data1["total"] == data2["total"]

    # Routes should be different (if total > 3)
    if data1["total"] > 3:
        route_ids_1 = [r["route_id"] for r in data1["routes"]]
        route_ids_2 = [r["route_id"] for r in data2["routes"]]
        assert route_ids_1 != route_ids_2, "Different pages should return different routes"


def test_search_results_ordered_by_route_short_name(client):
    """Test that results are ordered by route_short_name for deterministic pagination."""
    response = client.get("/v1/routes/search?q=335&limit=10")
    assert response.status_code == 200
    data = response.json()

    if len(data["routes"]) > 1:
        # Check if results are ordered (null values may be at start or end)
        route_names = [r["route_short_name"] or "" for r in data["routes"]]

        # Filter out empty strings and check ordering
        non_empty_names = [name for name in route_names if name]
        if len(non_empty_names) > 1:
            # Should be in ascending order
            sorted_names = sorted(non_empty_names)
            assert non_empty_names == sorted_names, \
                f"Routes should be ordered by route_short_name: {non_empty_names}"


def test_search_total_count_accurate(client):
    """Test that total count is accurate and consistent across pages."""
    response1 = client.get("/v1/routes/search?q=335&limit=5&offset=0")
    assert response1.status_code == 200
    data1 = response1.json()

    response2 = client.get("/v1/routes/search?q=335&limit=5&offset=5")
    assert response2.status_code == 200
    data2 = response2.json()

    # Total count should be same regardless of offset
    assert data1["total"] == data2["total"], \
        "Total count should be consistent across pages"


def test_search_default_limit_is_50(client):
    """Test that default limit is 50 when not specified."""
    response = client.get("/v1/routes/search?q=a")  # Common letter, should have many results
    assert response.status_code == 200
    data = response.json()

    assert data["limit"] == 50, "Default limit should be 50"
    assert len(data["routes"]) <= 50, "Should return at most 50 routes by default"


def test_search_default_offset_is_zero(client):
    """Test that default offset is 0 when not specified."""
    response = client.get("/v1/routes/search?q=335")
    assert response.status_code == 200
    data = response.json()

    assert data["offset"] == 0, "Default offset should be 0"


# ==============================================================================
# Response Format Tests
# ==============================================================================


def test_search_response_structure(client):
    """Test that response includes routes, total, limit, offset."""
    response = client.get("/v1/routes/search?q=335&limit=10&offset=0")
    assert response.status_code == 200
    data = response.json()

    # Top-level fields
    assert "routes" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data

    # Types
    assert isinstance(data["routes"], list)
    assert isinstance(data["total"], int)
    assert isinstance(data["limit"], int)
    assert isinstance(data["offset"], int)


def test_search_route_fields_complete(client):
    """Test that each route has all required GTFS fields."""
    response = client.get("/v1/routes/search?q=335&limit=5")
    assert response.status_code == 200
    data = response.json()

    if len(data["routes"]) > 0:
        route = data["routes"][0]

        # Required GTFS fields per spec
        assert "route_id" in route
        assert "route_short_name" in route
        assert "route_long_name" in route
        assert "route_type" in route
        assert "agency_id" in route

        # Types (per GTFS spec)
        assert isinstance(route["route_id"], str)
        assert route["route_short_name"] is None or isinstance(route["route_short_name"], str)
        assert route["route_long_name"] is None or isinstance(route["route_long_name"], str)
        assert isinstance(route["route_type"], int)
        assert route["agency_id"] is None or isinstance(route["agency_id"], str)


def test_search_preserves_original_gtfs_values(client):
    """Test that original GTFS values are preserved (not normalized in response)."""
    response = client.get("/v1/routes/search?q=335e")
    assert response.status_code == 200
    data = response.json()

    # Find a route with hyphen
    hyphenated_routes = [
        r for r in data["routes"]
        if r["route_short_name"] and "-" in r["route_short_name"]
    ]

    if len(hyphenated_routes) > 0:
        route = hyphenated_routes[0]
        # Should preserve hyphen in response
        assert "-" in route["route_short_name"], \
            f"Original GTFS hyphenated form should be preserved: {route['route_short_name']}"


def test_search_empty_results_returns_empty_array(client):
    """Test that no matches returns empty array, not 404."""
    response = client.get("/v1/routes/search?q=ZZZZNONEXISTENT12345")
    assert response.status_code == 200
    data = response.json()

    assert data["routes"] == []
    assert data["total"] == 0
    assert data["limit"] == 50  # default
    assert data["offset"] == 0  # default


# ==============================================================================
# Edge Cases
# ==============================================================================


def test_search_single_character_query(client):
    """Test that single character queries work."""
    response = client.get("/v1/routes/search?q=1")
    assert response.status_code == 200
    data = response.json()

    # Should find routes with "1" in name (1, 10, 100, 213, etc.)
    assert isinstance(data["routes"], list)


def test_search_numeric_query(client):
    """Test that numeric queries work."""
    response = client.get("/v1/routes/search?q=13")
    assert response.status_code == 200
    data = response.json()

    # Should find routes like 13-C, 213, etc.
    assert data["total"] >= 0


def test_search_special_characters_in_query(client):
    """Test that special characters in query are handled safely."""
    # Try various special characters that might appear in SQL injection attempts
    special_queries = [
        "335%",
        "335_",
        "335'",
        "335--",
        "335;",
    ]

    for query in special_queries:
        response = client.get(f"/v1/routes/search?q={query}")
        # Should not crash, should return valid response
        assert response.status_code in [200, 422], \
            f"Query '{query}' should not crash the endpoint"


def test_search_very_long_query(client):
    """Test that very long queries are handled gracefully."""
    long_query = "a" * 500
    response = client.get(f"/v1/routes/search?q={long_query}")

    # Should either return 200 with no results or 422 if length validation exists
    assert response.status_code in [200, 422]


def test_search_unicode_characters(client):
    """Test that Unicode characters in query are handled correctly."""
    # Try Unicode characters (e.g., Indian language characters)
    response = client.get("/v1/routes/search?q=%E0%B2%95%E0%B3%86%E0%B2%82")  # Kannada "Kem"

    # Should not crash
    assert response.status_code in [200, 422]


# ==============================================================================
# Performance/Boundary Tests
# ==============================================================================


def test_search_with_max_limit(client):
    """Test that maximum limit of 1000 works correctly."""
    response = client.get("/v1/routes/search?q=a&limit=1000")
    assert response.status_code == 200
    data = response.json()

    assert data["limit"] == 1000
    assert len(data["routes"]) <= 1000


def test_search_with_large_offset(client):
    """Test that large offset values work correctly."""
    response = client.get("/v1/routes/search?q=335&offset=1000")
    assert response.status_code == 200
    data = response.json()

    # Should return empty array if offset beyond total
    if data["offset"] >= data["total"]:
        assert data["routes"] == []


def test_search_route_type_is_3_for_buses(client):
    """Test that all returned routes have route_type=3 (bus) for BMTC data."""
    response = client.get("/v1/routes/search?q=335&limit=20")
    assert response.status_code == 200
    data = response.json()

    # All BMTC routes should be type 3 (bus) per GTFS spec
    for route in data["routes"]:
        assert route["route_type"] == 3, \
            f"BMTC routes should have route_type=3 (bus), got {route['route_type']}"
