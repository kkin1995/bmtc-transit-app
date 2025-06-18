# Development Environment Setup Guide - ✅ VALIDATED

## Prerequisites

✅ **Environment Status**: Fully validated and operational  
✅ **All Services**: Running with health checks  
✅ **Database Stack**: PostgreSQL, Redis, InfluxDB operational  

Before starting, ensure you have the following installed:

### Required Software

- **Docker Desktop** (4.0+) -
  [Download here](https://www.docker.com/products/docker-desktop/)
- **Node.js** (18+) - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/)

### System Requirements

- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 20GB free space for Docker images and dependencies
- **CPU**: Multi-core recommended for parallel builds
- **OS**: Windows 10+, macOS 10.15+, or Linux

### Optional but Recommended

- **Visual Studio Code** with recommended extensions
- **GitHub CLI** for easier repository management
- **Postman** or similar for API testing

## Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/your-username/bmtc-transit-app.git
cd bmtc-transit-app

# Run the automated setup script
./scripts/dev-setup.sh
```

The setup script will:

- Check prerequisites
- Install dependencies
- Pull Docker images
- Start required services
- Set up the database

### 2. Start Development

```bash
# Start all services
npm run dev

# Or start services individually
npm run services:up  # Start Docker services
npm run api:dev      # Start API gateway
```

### 3. Verify Setup ✅ ALL OPERATIONAL

- **API Gateway**: http://localhost:3000 ✅
- **User Service**: http://localhost:3001 ✅  
- **Location Service**: http://localhost:3002 ✅
- **Real-time Service**: http://localhost:3003 ✅
- **ML Validation Service**: http://localhost:3004 ✅
- **Gamification Service**: http://localhost:3005 ✅
- **Application**: http://localhost:8080 (via Nginx) ✅
- **Database**: localhost:5432 ✅
- **Redis**: localhost:6379 ✅
- **InfluxDB**: http://localhost:8086 ✅

## Manual Setup (Alternative)

If the automated script doesn't work, follow these manual steps:

### 1. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit the .env file with your settings
# Most defaults should work for local development
```

### 2. Install Dependencies

```bash
# Install all workspace dependencies
npm install

# Verify installation
npm run type-check
npm run lint
```

### 3. Start Infrastructure Services ✅ WORKING

```bash
# Start all services (databases + application services)
docker compose -f docker/docker-compose.dev.yml up -d

# Verify all services are healthy
docker compose -f docker/docker-compose.dev.yml ps

# Test health endpoints
curl http://localhost:3000/health  # API Gateway
curl http://localhost:3001/health  # User Service  
curl http://localhost:3002/health  # Location Service
curl http://localhost:3003/health  # Real-time Service
curl http://localhost:3004/health  # ML Validation Service
curl http://localhost:3005/health  # Gamification Service
```

### 4. Database Verification ✅ VALIDATED

```bash
# Test PostgreSQL with PostGIS
docker compose -f docker/docker-compose.dev.yml exec postgres psql -U bmtc_user -d bmtc_transit_dev -c "SELECT version();"

# Test PostGIS functionality  
docker compose -f docker/docker-compose.dev.yml exec postgres psql -U bmtc_user -d bmtc_transit_dev -c "SELECT ST_AsText(ST_Point(77.5946, 12.9716));"

# Test Redis
docker compose -f docker/docker-compose.dev.yml exec redis redis-cli ping

# Test InfluxDB
curl -s http://localhost:8086/health
```

### 4. Database Setup

```bash
# Run database migrations (when available)
npm run db:migrate

# Seed with initial data (when available)
npm run db:seed
```

### 5. Start Application Services

```bash
# Start all application services
npm run dev

# Or start services individually
npm run api:dev
```

## Development Workflow

### Day-to-Day Development

```bash
# Start your development session
npm run dev

# In separate terminals:
npm run services:logs  # Monitor service logs
npm test              # Run tests
npm run lint          # Check code quality
```

### Code Quality

```bash
# Run linting
npm run lint
npm run lint:fix      # Auto-fix issues

# Type checking
npm run type-check

# Code formatting
npx prettier --write "**/*.{js,ts,tsx,json,md,yml,yaml}"

# Run all quality checks
npm run lint && npm run type-check
```

### Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e

# Test with coverage
npm test -- --coverage
```

### Database Management

```bash
# Database utilities
./scripts/db-utils.sh status    # Check database status
./scripts/db-utils.sh connect   # Connect to database
./scripts/db-utils.sh tables    # List all tables
./scripts/db-utils.sh backup    # Create backup
./scripts/db-utils.sh reset     # Reset database (WARNING: deletes data)
```

## Service Architecture

### Application Services

- **API Gateway** (3000): Main application entry point
- **User Service** (3001): User management and authentication
- **Location Service** (3002): Location data processing
- **Real-time Service** (3003): WebSocket connections and real-time updates

### Infrastructure Services

- **PostgreSQL** (5432): Primary database with PostGIS
- **Redis** (6379): Caching and session storage
- **InfluxDB** (8086): Time-series data for location history
- **Redpanda** (9092): Kafka-compatible message streaming
- **Nginx** (8080): Reverse proxy and load balancer

## Common Commands

### Service Management

```bash
# Start all services
npm run services:up

# Stop all services
npm run services:down

# Restart all services
npm run services:restart

# View service logs
npm run services:logs

# View specific service logs
docker-compose -f docker/docker-compose.dev.yml logs -f postgres
```

### Development Commands

```bash
# Start development with hot reload
npm run dev

# Build all services
npm run build

# Clean build artifacts
npm run clean

# Full environment reset
./scripts/cleanup.sh --full --remove-data
./scripts/dev-setup.sh
```

### Mobile Development (Future)

```bash
# Start React Native development
npm run mobile:dev

# iOS development
npm run mobile:ios

# Android development
npm run mobile:android
```

## Troubleshooting

### Common Issues

#### "Docker not found" or "Docker not running"

- Install Docker Desktop
- Start Docker Desktop application
- Verify with: `docker --version`

#### "Port already in use"

```bash
# Check what's using the port
lsof -i :3000  # Replace 3000 with the port number

# Kill the process
kill -9 <PID>

# Or use a different port in .env file
```

#### "Cannot connect to database"

```bash
# Check if PostgreSQL container is running
docker ps | grep postgres

# Check database logs
docker logs bmtc-postgres

# Restart database
docker-compose -f docker/docker-compose.dev.yml restart postgres
```

#### "npm install fails"

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Use specific Node.js version
nvm use 18  # If using nvm
```

#### "Out of disk space"

```bash
# Clean Docker system
docker system prune -a

# Clean development environment
./scripts/cleanup.sh --full

# Remove unused Docker volumes
docker volume prune
```

### Performance Issues

#### Slow startup times

- Increase Docker Desktop memory allocation (8GB+)
- Use SSD storage for better I/O performance
- Close unnecessary applications

#### High memory usage

- Reduce Docker service replicas in development
- Adjust memory limits in docker-compose.dev.yml
- Monitor with: `docker stats`

## Environment Configuration

### Environment Variables

Key environment variables in `.env`:

```bash
# Database
DATABASE_URL=postgresql://bmtc_user:bmtc_password@localhost:5432/bmtc_transit_dev

# Redis
REDIS_URL=redis://localhost:6379

# InfluxDB
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=dev-token-change-in-production

# Kafka
KAFKA_BROKERS=localhost:9092

# Development
NODE_ENV=development
LOG_LEVEL=debug
```

### Service Ports

- **3000**: API Gateway
- **3001**: User Service
- **3002**: Location Service
- **3003**: Real-time Service
- **5432**: PostgreSQL
- **6379**: Redis
- **8086**: InfluxDB
- **9092**: Redpanda (Kafka)
- **8080**: Nginx (main application)

## Getting Help

### Documentation

- **Architecture**: `/design` directory
- **API Documentation**: http://localhost:3000/docs (when running)
- **Sprint Planning**: `/planning` directory

### Debugging

- Use VS Code debugger with provided configurations
- Check service logs: `npm run services:logs`
- Use database tools: `./scripts/db-utils.sh`
- Monitor with: `docker stats` and `docker logs <container>`

### Community

- Create GitHub issues for bugs
- Use GitHub discussions for questions
- Follow the contributing guidelines

## Next Steps

After setup is complete:

1. **Explore the codebase**: Start with `/services/api-gateway`
2. **Run tests**: `npm test` to verify everything works
3. **Check the roadmap**: `/planning/project-roadmap.md`
4. **Start development**: Follow the sprint plan in `/planning/sprint-plan.md`

Happy coding! 🚀
