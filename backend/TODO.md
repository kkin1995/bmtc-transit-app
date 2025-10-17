# TODO - BMTC Transit API

## Test Infrastructure Issue

**Problem**: Tests fail with cross-module interference when run with `pytest` (all modules together), but pass individually.

**Root Cause**: Settings cache contamination between test modules despite `conftest.py` fixture.

**Current State**:
- ✅ All 33 tests pass when run per-module
- ❌ Some tests fail when run together due to env var / settings cache conflicts
- Each test module sets different `os.environ` values before imports
- Module-level cache clearing in `conftest.py` doesn't fully isolate

**Solution Options**:

1. **Separate test databases per module** (quickest fix)
   - Each module uses uniquely named temp DB
   - Prevents DB-level conflicts
   - Still may have settings cache issues

2. **Process isolation** (cleanest)
   - Use `pytest-xdist` to run each module in separate process
   - Complete isolation, no cache contamination
   - `pip install pytest-xdist && pytest -n auto --dist loadfile`

3. **Reset app state between modules** (complex)
   - Create session-level fixture to reload app module
   - Clear all caches (settings, FastAPI app, DB connections)
   - Risky - may miss hidden state

4. **Standardize test environment** (reduces flexibility)
   - All modules use same env vars
   - Limits testing different configurations
   - Not ideal for comprehensive testing

**Recommended**: Option 2 (pytest-xdist)
- Add to `dependency-groups.dev`: `"pytest-xdist>=3.5.0"`
- Update CI/test commands to use `pytest -n auto --dist loadfile`
- Zero code changes, full isolation

**Files involved**:
- `tests/conftest.py` - Current cache clearing logic
- `tests/test_*.py` - All test modules set env vars before imports
- `pyproject.toml` - Add pytest-xdist dependency

---

## Enhancement Ideas

### High Priority
- [ ] Add pytest-xdist for test isolation (see above)
- [ ] API documentation update for global aggregation features
- [ ] Add device bucket rate limiting enforcement

### Medium Priority
- [ ] Implement actual idempotency response caching (currently just stores keys)
- [ ] Add metrics endpoint for monitoring (rejection rates, device buckets)
- [ ] GTFS update workflow script

### Low Priority
- [ ] GTFS discovery endpoints (routes, stops, schedules)
- [ ] Analytics dashboard (Grafana/simple HTML)
- [ ] Performance benchmarks (100 concurrent POSTs)

---

**Last Updated**: 2025-10-17
**Status**: 33/33 tests passing (per-module), test isolation fix needed
