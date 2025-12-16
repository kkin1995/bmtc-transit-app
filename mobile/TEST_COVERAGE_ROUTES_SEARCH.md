# Test Coverage: Routes Screen Search Feature

## Summary

Comprehensive test suite for the client-side search functionality in the Routes screen, following TDD methodology.

**Status:** RED Phase (Tests written, feature not implemented)
**Total Tests Added:** 13 tests
**Current Results:** 12 failing, 1 passing (the "show all routes when search is empty" test passes because it matches current behavior)

## Test Suite Structure

### Location
`/home/karan-kinariwala/KARAN/1-Projects/bmtc-transit-app/mobile/app/(tabs)/__tests__/RoutesScreen.test.tsx`

### Test Organization

#### Describe Block: "Search Functionality"
A new test suite added to the existing `RoutesScreen` test file, containing 13 comprehensive test cases.

## Test Cases

### 1. Core Search Input
| Test | Description | Status |
|------|-------------|--------|
| `should render search input with placeholder` | Verifies TextInput with placeholder "Search routes..." exists | FAIL (RED) |

### 2. Basic Filtering
| Test | Description | Status |
|------|-------------|--------|
| `should show all routes when search is empty` | All 5 mock routes visible when no search query | PASS |
| `should filter by short name (case-insensitive)` | Search "335e" shows only route 335E | FAIL (RED) |
| `should filter by long name (case-insensitive)` | Search "whitefield" shows only matching route | FAIL (RED) |
| `should show "No routes found" when no matches` | Empty state for "nonexistent route" | FAIL (RED) |
| `should clear filter when search is cleared` | All routes reappear when search cleared | FAIL (RED) |

### 3. Edge Cases
| Test | Description | Status |
|------|-------------|--------|
| `should handle null short_name gracefully` | Route with null short_name but matching long_name | FAIL (RED) |
| `should handle null long_name gracefully` | Route with null long_name but matching short_name | FAIL (RED) |
| `should trim whitespace in search query` | "  335e  " matches route 335E | FAIL (RED) |
| `should perform partial matching on route names` | "elec" matches "Electronic City" | FAIL (RED) |

### 4. Integration
| Test | Description | Status |
|------|-------------|--------|
| `should navigate correctly from filtered list` | Navigation works from filtered results | FAIL (RED) |
| `should maintain search state during loading` | Search query persists when data refetches | FAIL (RED) |
| `should match routes with either short_name or long_name containing query` | "g" matches both "G4" and "Jayanagar" | FAIL (RED) |

## Mock Data

The test suite uses 5 carefully designed mock routes to cover all scenarios:

```typescript
const mockSearchRoutes = [
  {
    route_id: '335E',
    route_short_name: '335E',
    route_long_name: 'Kengeri to Electronic City',
    route_type: 3,
    agency_id: 'BMTC',
  },
  {
    route_id: '340',
    route_short_name: '340',
    route_long_name: 'Jayanagar to Whitefield',
    route_type: 3,
    agency_id: 'BMTC',
  },
  {
    route_id: 'G4',
    route_short_name: 'G4',
    route_long_name: 'Banashankari to Yelahanka',
    route_type: 3,
    agency_id: 'BMTC',
  },
  {
    route_id: 'R500',
    route_short_name: null, // Test null short_name
    route_long_name: 'Airport Express',
    route_type: 3,
    agency_id: 'BMTC',
  },
  {
    route_id: 'R600',
    route_short_name: 'R600',
    route_long_name: null, // Test null long_name
    route_type: 3,
    agency_id: 'BMTC',
  },
];
```

## Test Methodology

### Testing Patterns Used

1. **Existing Pattern Compliance**: All tests follow the existing structure in `RoutesScreen.test.tsx`
2. **Mock Consistency**: Uses `mockUseRoutes` from existing tests
3. **Fire Events**: Uses `fireEvent.changeText()` for search input
4. **Assertions**: Uses `screen.getByText()` and `screen.queryByText()` for validation
5. **Router Mocking**: Reuses existing `mockRouter` for navigation tests

### Assertions Verified

- **Element Existence**: `screen.getByPlaceholderText()`, `screen.getByText()`
- **Element Absence**: `screen.queryByText()` returns null
- **Navigation**: `mockRouter.push()` called with correct params
- **Input Value**: `searchInput.props.value` maintains state

## Test Coverage Analysis

### Happy Paths
- ✓ Search input renders
- ✓ Filter by short name
- ✓ Filter by long name
- ✓ Clear search
- ✓ Navigate from filtered list

### Edge Cases
- ✓ Null short_name handling
- ✓ Null long_name handling
- ✓ Whitespace trimming
- ✓ Partial matching
- ✓ Case-insensitive search

### Error Conditions
- ✓ No matches found

### State Management
- ✓ Empty search shows all
- ✓ State persists during loading
- ✓ Multiple field matching (OR logic)

## Running the Tests

### Run All Tests
```bash
npm test -- RoutesScreen.test.tsx
```

### Run Only Search Tests
```bash
npm test -- RoutesScreen.test.tsx -t "Search Functionality"
```

### Expected Output (RED Phase)
```
Test Suites: 1 failed, 1 total
Tests:       12 failed, 15 passed, 27 total
```

## Next Steps (Implementation Phase)

Once the implementation is complete, these tests should all pass (GREEN phase):

1. Add `useState` for search query in `routes.tsx`
2. Add `TextInput` component above the route list
3. Filter routes using `useMemo` based on search query
4. Implement case-insensitive matching with null-safety
5. Trim whitespace from search input

## Implementation Requirements (Derived from Tests)

Based on the test suite, the implementation must:

1. **Search Input**
   - Placeholder: "Search routes..."
   - Controlled component with state
   - Position: Above route list, below subtitle

2. **Filtering Logic**
   - Case-insensitive matching (`.toLowerCase()`)
   - Search both `route_short_name` and `route_long_name`
   - OR logic: match if EITHER field contains query
   - Null-safe: handle `null` values without crashing
   - Trim whitespace: `query.trim()`
   - Partial matching: substring match, not exact

3. **State Management**
   - Local state: `const [searchQuery, setSearchQuery] = useState('')`
   - Persist during loading/refetch
   - Clear button optional (clearing text field is sufficient)

4. **User Experience**
   - Empty search = show all routes
   - No matches = show "No routes found" empty state
   - Navigation works from filtered results
   - Filter count/indicator optional

## Code Quality Notes

- **Test Isolation**: Each test is independent, can run in any order
- **Descriptive Names**: Test names clearly indicate what is being tested
- **Comprehensive Comments**: Each test has inline comments explaining assertions
- **Mock Data**: Reusable `mockSearchRoutes` array covers all scenarios
- **Pattern Consistency**: Follows existing test structure exactly

## Files Modified

- `/home/karan-kinariwala/KARAN/1-Projects/bmtc-transit-app/mobile/app/(tabs)/__tests__/RoutesScreen.test.tsx` (UPDATED)
  - Added 13 new tests in "Search Functionality" describe block
  - Total lines added: ~450 lines

## Test Metrics

- **Coverage Increase**: +13 tests (+48%)
- **Scenarios Covered**: 13 distinct scenarios
- **Mock Routes**: 5 (covering normal, null short_name, null long_name)
- **Search Queries Tested**: 8 different search patterns
- **Navigation Tests**: 1 (from filtered list)
- **State Tests**: 1 (persist during loading)

## Validation Checklist

- [x] All tests follow existing patterns
- [x] Tests use existing mock infrastructure
- [x] Tests cover happy paths
- [x] Tests cover edge cases
- [x] Tests cover error conditions
- [x] Tests verify navigation
- [x] Tests verify state management
- [x] Tests fail appropriately (RED phase verified)
- [x] Test names are descriptive
- [x] Assertions have clear failure messages
- [x] No implementation changes made (test-only)

---

**Created:** 2025-12-16
**Test Framework:** Jest + React Native Testing Library
**Pattern:** TDD (Red-Green-Refactor)
**Phase:** RED (Tests written, awaiting implementation)
