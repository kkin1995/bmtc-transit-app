# PRD: Test Isolation & Parallel Execution with pytest-xdist
**Status:** Draft | **Owner:** QA | **Created:** 2025-10-22

## 1. Problem & User Story
Tests pass individually per module (test_learning.py 9/9, test_integration.py 8/8, test_idempotency.py 6/6, test_global_aggregation.py 10/10) but fail when run together due to global settings singletons and environment contamination persisting across test modules. Developers must run 4 separate commands instead of one, delaying CI/CD and local validation. This PRD fixes settings cache isolation and enables parallel execution via pytest-xdist so the full 33-test suite passes with `uv run pytest -n auto --dist loadfile`.

## 2. Scope
**In Scope:**
- Add pytest-xdist to dev dependencies (pyproject.toml)
- Configure pytest.ini for worker isolation and file-level distribution
- Refactor settings singletons to fixture-based dependency injection (config passed to tests, not cached globally)
- Add conftest.py with fixtures for settings, database, and environment isolation
- Cache clearing on test teardown (pytest fixture cleanup)
- Canonical test commands documented and validated

**Out of Scope (Future):**
- Custom pytest plugins
- Docker-based test isolation
- Distributed CI runners (beyond GitHub Actions multi-thread)

## 3. Functional Requirements
1. **FR-1:** Add pytest-xdist and pytest-randomly to dev dependencies
2. **FR-2:** Configure pytest.ini with worker count = `auto`, distribution strategy = `loadfile`
3. **FR-3:** Settings (n0, half_life_days, outlier_sigma, mapmatch_min_conf) accessible via pytest fixtures, not global singletons
4. **FR-4:** Database fixtures provide isolation: in-memory `:memory:` for unit tests, temporary file-based for integration tests
5. **FR-5:** Environment variable isolation via monkeypatch fixtures (e.g., BMTC_API_KEY, BMTC_DB_PATH)
6. **FR-6:** Fixture teardown explicitly clears app state caches (e.g., lifespan.startup_time, settings._cache)
7. **FR-7:** Test commands documented:
   - Single module: `uv run pytest tests/test_learning.py -v`
   - Full sequential: `uv run pytest -v`
   - Full parallel: `uv run pytest -n auto --dist loadfile -v`

## 4. Acceptance Criteria
**Positive Cases:**
- AC1: GIVEN full 33-test suite WHEN run with `uv run pytest -n auto --dist loadfile` THEN all tests pass (9+8+6+10 = 33/33)
- AC2: GIVEN three consecutive runs of full suite WHEN executed without manual intervention THEN zero flaky failures in any run
- AC3: GIVEN single-module run (e.g., test_learning.py) WHEN compared to full-suite results THEN identical pass/fail status and output

**Boundary Cases:**
- AC4: GIVEN environment variable mutation in test_idempotency.py WHEN test_integration.py runs in parallel THEN BMTC_API_KEY and BMTC_DB_PATH isolation verified (no cross-test leakage)
- AC5: GIVEN pytest-randomly enabled (shuffled test order) WHEN all 33 tests run THEN all pass regardless of execution order

**Negative Cases:**
- AC6: GIVEN global settings singleton access WHEN test fixture runs THEN fixture injection provides clean instance (no cross-test cache pollution)
- AC7: GIVEN test database state mutation WHEN next test starts THEN fresh DB state confirmed (no leftover rows from previous test)

## 5. Non-Functional Requirements
- **Parallel Performance:** Full suite runtime ≤ 1.5× single-process baseline (target: 2× speedup on 4+ core systems)
- **Flake-Free:** Zero intermittent failures across 10 consecutive full-suite runs
- **Developer UX:** Clear pytest output; failures identify root cause (settings leak vs. DB isolation vs. environment)
- **CI-Ready:** Works in GitHub Actions without Docker; no external service dependencies

## 6. Privacy & Security Impact
**None.** Test infrastructure only; no PII or production data touched.

## 7. Rollout & Backout
**Rollout:**
1. Add pytest-xdist, pytest-randomly to `backend/pyproject.toml` dev group
2. Create `backend/conftest.py` with settings, db, env fixtures
3. Verify single-module tests still pass: `uv run pytest tests/test_learning.py -v`
4. Validate full parallel suite: `uv run pytest -n auto --dist loadfile -v`
5. Document commands in `README.md` and `backend/README.md`

**Backout Criteria:**
- IF full-suite parallel execution has >2 intermittent failures across 3 runs THEN revert to sequential mode
- IF parallel runtime > 2× slower than baseline THEN revert to single-process

**Validation Commands:**
```bash
# Verify xdist installed
cd backend && uv run pip show pytest-xdist

# Run single module (baseline)
cd backend && uv run pytest tests/test_learning.py -v

# Run full suite sequential (existing behavior)
cd backend && uv run pytest -v

# Run full suite parallel (target)
cd backend && uv run pytest -n auto --dist loadfile -v

# Verify isolation with randomized order
cd backend && uv run pytest --randomly-seed=12345 -v
```

## 8. Test Scenarios
**Unit Tests (test_learning.py):**
- Fixture: in-memory SQLite DB (`:memory:`)
- Isolation: Pure function tests, no side effects
- Validation: `AC1` (9/9 pass)

**Integration Tests (test_integration.py):**
- Fixture: temp file DB (cleaned on teardown)
- Isolation: API request/response flow; environment vars isolated
- Validation: `AC1` (8/8 pass) + `AC4` (env var leakage prevented)

**Idempotency Tests (test_idempotency.py):**
- Fixture: temp file DB + Bearer token isolation
- Isolation: Settings cache cleared between tests
- Validation: `AC2` (zero flakes × 3 runs) + `AC6` (settings per-test instance)

**Global Aggregation Tests (test_global_aggregation.py):**
- Fixture: temp file DB + config settings fixture
- Isolation: Outlier rejection state reset
- Validation: `AC1` (10/10 pass) + `AC5` (order-independent)

## 9. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Fixture setup overhead slows tests | M | Profile fixture creation; lazy-load DB if needed |
| xdist process communication fails | H | Test on CI before rollout; use `--dist=loadfile` (process-safe) |
| Settings cache still leaks despite fixtures | H | Add explicit cache.clear() in fixture teardown; audit app/config.py singletons |
| Test order dependency not caught | M | Enable pytest-randomly by default in pytest.ini; run 5× with random seeds |
| CI timeout due to parallel hangs | M | Set pytest timeout; add health check in conftest fixture |

---

**Next Steps:** A6 (Testing/QA) to implement fixtures, validate isolation, and green the suite.
