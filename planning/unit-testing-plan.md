# BMTC Transit App - Unit Testing Plan (US-001 Stage)

## 📋 Plan Overview

**Created**: June 19, 2025  
**Stage**: US-001 (Foundation Infrastructure)  
**Estimated Duration**: 12-16 hours  
**Target Coverage**: 90%+ for critical functionality  

## 🎯 Testing Scope at US-001 Stage

**Current Infrastructure:**
- ✅ 6 microservices with health endpoints
- ✅ 5 shared packages (config, database, shared, types, utils)
- ✅ Jest configured in all workspaces
- ✅ Docker environment operational
- ✅ GitHub Actions CI/CD pipeline
- ✅ Linting issues resolved

**Testing Focus:**
- Service initialization and health endpoints
- Shared package utilities and configurations
- Database connections and environment variables
- Docker container functionality
- CI/CD integration

---

## 🚀 Phase 1: Test Infrastructure Setup (2-3 hours) ✅

### Step 1.1: Configure Global Test Environment ✅
**Duration**: 30 minutes  
**Completed**: June 19, 2025

**Actions:**
1. **Create root-level Jest configuration**
   - Set up `jest.config.js` with workspace support
   - Configure global test environment variables
   - Set up test database configurations
   - Add code coverage thresholds (80% minimum)

2. **Set up test database**
   - Create separate test PostgreSQL database
   - Configure test-specific environment variables
   - Add database cleanup utilities
   - Set up test data seeding functions

3. **Configure test utilities**
   - Create shared test helpers in `packages/shared/src/test-utils`
   - Add request/response mocking utilities
   - Set up database transaction rollback for tests
   - Create service health check utilities

### Step 1.2: Update CI/CD Pipeline for Testing ✅
**Duration**: 30 minutes  
**Completed**: June 19, 2025

**Actions:**
1. **Enhance GitHub Actions workflow**
   - Add test execution step with coverage reporting
   - Configure test database services in CI
   - Set up test result reporting
   - Add test coverage badges

2. **Add pre-commit hooks**
   - Ensure tests run before commits
   - Add test coverage validation
   - Configure automatic test discovery

---

## 🧪 Phase 2: Shared Package Unit Tests (3-4 hours)

### Step 2.1: Config Package Tests ⏳
**Duration**: 45 minutes

**Test Cases:**
- ✅ Environment variable parsing and validation
- ✅ Default configuration loading
- ✅ Configuration validation functions
- ✅ Error handling for missing required configs
- ✅ Type safety for configuration objects

**Files to Create:**
- `packages/config/src/__tests__/config.test.ts`
- `packages/config/src/__tests__/validation.test.ts`

### Step 2.2: Database Package Tests ⏳
**Duration**: 60 minutes

**Test Cases:**
- ✅ Database connection establishment
- ✅ Connection pool configuration
- ✅ Database health checks
- ✅ Connection error handling
- ✅ Transaction management utilities
- ✅ Query builder functions (if any)

**Files to Create:**
- `packages/database/src/__tests__/connection.test.ts`
- `packages/database/src/__tests__/health.test.ts`
- `packages/database/src/__tests__/transactions.test.ts`

### Step 2.3: Utils Package Tests ⏳
**Duration**: 45 minutes

**Test Cases:**
- ✅ Utility function correctness
- ✅ Error handling in utility functions
- ✅ Edge cases and boundary conditions
- ✅ Input validation
- ✅ Type safety verification

**Files to Create:**
- `packages/utils/src/__tests__/helpers.test.ts`
- `packages/utils/src/__tests__/validators.test.ts`

### Step 2.4: Types Package Tests ⏳
**Duration**: 30 minutes

**Test Cases:**
- ✅ Type definition validation
- ✅ Interface compliance tests
- ✅ Enum value validation
- ✅ Type guard functions (if any)

**Files to Create:**
- `packages/types/src/__tests__/types.test.ts`
- `packages/types/src/__tests__/guards.test.ts`

### Step 2.5: Shared Package Tests ⏳
**Duration**: 45 minutes

**Test Cases:**
- ✅ Common utilities and constants
- ✅ Shared business logic functions
- ✅ Error classes and handling
- ✅ Common validation functions

**Files to Create:**
- `packages/shared/src/__tests__/constants.test.ts`
- `packages/shared/src/__tests__/errors.test.ts`
- `packages/shared/src/__tests__/validators.test.ts`

---

## 🔧 Phase 3: Service Unit Tests (4-5 hours)

### Step 3.1: API Gateway Service Tests ⏳
**Duration**: 60 minutes

**Test Cases:**
- ✅ Service initialization and startup
- ✅ Health endpoint response validation
- ✅ Root endpoint functionality  
- ✅ Port configuration handling
- ✅ Environment variable processing
- ✅ Error handling for service startup failures
- ✅ Express app configuration

**Files to Create:**
- `services/api-gateway/src/__tests__/index.test.ts`
- `services/api-gateway/src/__tests__/health.test.ts`
- `services/api-gateway/src/__tests__/config.test.ts`

### Step 3.2: User Service Tests ⏳
**Duration**: 50 minutes

**Test Cases:**
- ✅ Service initialization
- ✅ Health endpoint functionality
- ✅ Database connection validation
- ✅ Environment configuration
- ✅ Service-specific logic (if any)

**Files to Create:**
- `services/user-service/src/__tests__/index.test.ts`
- `services/user-service/src/__tests__/health.test.ts`

### Step 3.3: Location Service Tests ⏳
**Duration**: 50 minutes

**Test Cases:**
- ✅ Service startup and configuration
- ✅ Database connections (PostgreSQL + InfluxDB)
- ✅ Health checks for both databases
- ✅ Environment variable handling
- ✅ Service health endpoint

**Files to Create:**
- `services/location-service/src/__tests__/index.test.ts`
- `services/location-service/src/__tests__/database.test.ts`

### Step 3.4: Real-time Service Tests ⏳
**Duration**: 50 minutes

**Test Cases:**
- ✅ Service initialization
- ✅ Redis connection validation
- ✅ Health endpoint functionality
- ✅ WebSocket preparation (basic setup)
- ✅ Kafka/Redpanda connection readiness

**Files to Create:**
- `services/realtime-service/src/__tests__/index.test.ts`
- `services/realtime-service/src/__tests__/connections.test.ts`

### Step 3.5: ML Validation Service Tests ⏳
**Duration**: 50 minutes

**Test Cases:**
- ✅ Service startup validation
- ✅ InfluxDB connection testing
- ✅ Health endpoint verification
- ✅ Configuration loading
- ✅ Basic ML pipeline initialization (if any)

**Files to Create:**
- `services/ml-validation-service/src/__tests__/index.test.ts`
- `services/ml-validation-service/src/__tests__/influx.test.ts`

### Step 3.6: Gamification Service Tests ⏳
**Duration**: 50 minutes

**Test Cases:**
- ✅ Service initialization
- ✅ PostgreSQL + Redis connections
- ✅ Health endpoint testing
- ✅ Configuration validation
- ✅ Basic gamification logic setup (if any)

**Files to Create:**
- `services/gamification-service/src/__tests__/index.test.ts`
- `services/gamification-service/src/__tests__/connections.test.ts`

---

## 🏗️ Phase 4: Integration Tests (2-3 hours)

### Step 4.1: Service-to-Database Integration ⏳
**Duration**: 90 minutes

**Test Cases:**
- ✅ All services can connect to their respective databases
- ✅ Database health checks work end-to-end
- ✅ Connection pooling and cleanup
- ✅ Database transactions and rollbacks

**Files to Create:**
- `e2e-tests/integration/database-connections.test.ts`
- `e2e-tests/integration/health-checks.test.ts`

### Step 4.2: Inter-Service Communication Tests ⏳
**Duration**: 60 minutes

**Test Cases:**
- ✅ API Gateway can route to all services
- ✅ Service discovery and health propagation
- ✅ Network connectivity between containers
- ✅ Basic request/response flow

**Files to Create:**
- `e2e-tests/integration/service-communication.test.ts`
- `e2e-tests/integration/api-gateway.test.ts`

---

## 🐳 Phase 5: Docker & Environment Tests (1-2 hours)

### Step 5.1: Docker Container Tests ⏳
**Duration**: 60 minutes

**Test Cases:**
- ✅ All containers start successfully
- ✅ Environment variables are properly passed
- ✅ Health checks work in containers
- ✅ Network connectivity between containers
- ✅ Volume mounts and persistence

**Files to Create:**
- `e2e-tests/docker/container-startup.test.ts`
- `e2e-tests/docker/networking.test.ts`

### Step 5.2: Environment Configuration Tests ⏳
**Duration**: 30 minutes

**Test Cases:**
- ✅ Development vs production configuration loading
- ✅ Secret and environment variable injection
- ✅ Configuration validation in different environments

**Files to Create:**
- `e2e-tests/config/environment.test.ts`

---

## 📊 Phase 6: Test Coverage & Quality (1 hour)

### Step 6.1: Coverage Analysis ⏳
**Duration**: 30 minutes

**Actions:**
- ✅ Ensure 80%+ code coverage across all packages
- ✅ Identify and test uncovered critical paths
- ✅ Set up coverage reporting in CI/CD
- ✅ Add coverage badges to README

### Step 6.2: Test Quality Assurance ⏳
**Duration**: 30 minutes

**Actions:**
- ✅ Review test naming conventions
- ✅ Ensure proper test isolation
- ✅ Validate test performance (< 30 seconds total runtime)
- ✅ Add test documentation and examples

---

## 🔄 Phase 7: CI/CD Integration (30 minutes)

### Step 7.1: Pipeline Enhancement ⏳
**Actions:**
- ✅ Update GitHub Actions to run all tests
- ✅ Add test result reporting and notifications
- ✅ Configure test database services in CI
- ✅ Set up automatic test discovery
- ✅ Add test failure prevention for PR merges

---

## 📋 Implementation Progress Tracking

### ✅ Prerequisites Verified:
- [x] Jest configured in all workspaces
- [x] Docker environment operational
- [x] Services running and healthy
- [x] Database connections established
- [x] Linting issues resolved

### 📦 Expected Deliverables:
- **45+ unit test files** across all packages and services
- **90%+ code coverage** for critical functionality
- **< 30 second** total test execution time
- **Zero failing tests** in CI/CD pipeline
- **Comprehensive test documentation**

### 🎯 Success Criteria:
- ✅ All services have comprehensive unit tests
- ✅ All shared packages are thoroughly tested
- ✅ Integration tests validate service communication
- ✅ Docker environment testing is automated
- ✅ CI/CD pipeline includes automated testing
- ✅ Test coverage meets quality thresholds
- ✅ Tests run quickly and reliably

### ⏱️ Timeline Tracking:
- **Total Duration**: 12-16 hours
- **Started**: June 19, 2025
- **Target Completion**: TBD based on execution
- **Parallel Work**: Shared packages and services tested simultaneously

---

## 🔧 Technical Implementation Notes

### Test Framework Stack:
- **Jest**: Primary testing framework
- **Supertest**: HTTP endpoint testing
- **ts-jest**: TypeScript support
- **@types/jest**: Type definitions
- **jest-environment-node**: Node.js test environment

### Database Testing Strategy:
- **Test Containers**: Isolated test databases
- **Transaction Rollbacks**: Clean state between tests
- **Seeding**: Predictable test data
- **Mocking**: External service dependencies

### CI/CD Integration:
- **GitHub Actions**: Automated test execution
- **Test Reporting**: Coverage and results
- **PR Checks**: Block merges on test failures
- **Notifications**: Test status updates

---

## 📚 Resources for Future Claude Instances

### Key Files and Directories:
- `jest.config.js` - Root Jest configuration
- `packages/*/src/__tests__/` - Shared package tests
- `services/*/src/__tests__/` - Service unit tests
- `e2e-tests/` - Integration and end-to-end tests
- `.github/workflows/` - CI/CD pipeline configurations

### Common Patterns:
- **Service Tests**: Focus on initialization, health endpoints, and configuration
- **Package Tests**: Test utilities, types, and shared logic
- **Integration Tests**: Validate service communication and database connections
- **Mocking**: Use Jest mocks for external dependencies

### Maintenance Guidelines:
- **Keep tests fast**: < 30 seconds total runtime
- **Test isolation**: Each test should be independent
- **Clear naming**: Descriptive test and file names
- **Coverage targets**: 80%+ for critical paths

---

**Status**: ✅ **PHASE 1 COMPLETED** - 🚀 **READY FOR PHASE 2**  
**Last Updated**: June 19, 2025  
**Next Phase**: Phase 2 - Shared Package Unit Tests  

## 📊 Phase 1 Completion Summary

**✅ Accomplished (June 19, 2025):**
- Global Jest configuration with workspace support (`jest.config.js`)
- Test setup and teardown infrastructure (`jest.setup.js`, `jest.teardown.js`)
- Comprehensive test utilities library (`packages/shared/src/test-utils/`)
- Enhanced CI/CD pipeline with coverage reporting
- First test suite created and passing (7/7 tests ✅)
- All required dependencies installed and configured

**📁 Files Created:**
- `jest.config.js` - Root Jest configuration
- `jest.setup.js` - Global test environment setup
- `jest.teardown.js` - Global test cleanup
- `jest.setupAfterEnv.js` - Per-test environment configuration
- `packages/shared/jest.config.js` - Package-specific Jest config
- `packages/shared/src/__tests__/constants.test.ts` - First test suite
- `packages/shared/src/test-utils/` - Complete testing utilities (5 modules)
- Enhanced `.github/workflows/ci.yml` - Updated CI/CD pipeline

**🧪 Test Infrastructure Verified:**
```
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Coverage:    100% (shared constants)
Time:        <1 second
```

**⚠️ Known Issues:**
- Test utility files have linting issues (non-blocking)
- Need to complete Jest configs for remaining packages

**Contact**: Continue with Phase 2 implementation following this plan