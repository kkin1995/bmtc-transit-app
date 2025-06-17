#!/bin/bash

# BMTC Transit App - Development Environment Setup Script
# This script sets up the complete local development environment

set -e

echo "🚀 BMTC Transit App - Development Environment Setup"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed and running
check_docker() {
    print_status "Checking Docker installation..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker Desktop first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
    
    print_success "Docker is installed and running"
}

# Check if Node.js is installed
check_nodejs() {
    print_status "Checking Node.js installation..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version is $NODE_VERSION. Please upgrade to Node.js 18 or higher."
        exit 1
    fi
    
    print_success "Node.js $(node --version) is installed"
}

# Create environment file
setup_environment() {
    print_status "Setting up environment variables..."
    
    if [ ! -f .env ]; then
        cp .env.example .env
        print_success "Created .env file from template"
        print_warning "Please review and update .env file with your specific configuration"
    else
        print_success "Environment file already exists"
    fi
}

# Install dependencies
install_dependencies() {
    print_status "Installing Node.js dependencies..."
    
    npm install
    
    print_success "Dependencies installed successfully"
}

# Pull Docker images
pull_docker_images() {
    print_status "Pulling required Docker images..."
    
    # Pull images in background to speed up process
    docker pull postgis/postgis:15-3.3 &
    docker pull redis:7-alpine &
    docker pull influxdb:2.7-alpine &
    docker pull redpandadata/redpanda:latest &
    docker pull nginx:alpine &
    
    wait
    
    print_success "Docker images pulled successfully"
}

# Start services
start_services() {
    print_status "Starting development services..."
    
    # Start services with Docker Compose
    docker compose -f docker/docker-compose.dev.yml up -d postgres redis influxdb redpanda
    
    print_status "Waiting for services to be ready..."
    
    # Wait for PostgreSQL
    until docker compose -f docker/docker-compose.dev.yml exec -T postgres pg_isready -U bmtc_user -d bmtc_transit_dev; do
        print_status "Waiting for PostgreSQL to be ready..."
        sleep 2
    done
    
    # Wait for Redis
    until docker compose -f docker/docker-compose.dev.yml exec -T redis redis-cli ping; do
        print_status "Waiting for Redis to be ready..."
        sleep 2
    done
    
    print_success "All services are ready!"
}

# Setup databases
setup_databases() {
    print_status "Setting up databases..."
    
    # Database migrations will be handled by individual services
    # This is just a placeholder for future database setup scripts
    
    print_success "Database setup completed"
}

# Verify setup
verify_setup() {
    print_status "Verifying development environment setup..."
    
    # Check if services are running
    POSTGRES_STATUS=$(docker compose -f docker/docker-compose.dev.yml ps postgres | grep -c "Up" || true)
    REDIS_STATUS=$(docker compose -f docker/docker-compose.dev.yml ps redis | grep -c "Up" || true)
    INFLUXDB_STATUS=$(docker compose -f docker/docker-compose.dev.yml ps influxdb | grep -c "Up" || true)
    REDPANDA_STATUS=$(docker compose -f docker/docker-compose.dev.yml ps redpanda | grep -c "Up" || true)
    
    if [ "$POSTGRES_STATUS" -eq 1 ] && [ "$REDIS_STATUS" -eq 1 ] && [ "$INFLUXDB_STATUS" -eq 1 ] && [ "$REDPANDA_STATUS" -eq 1 ]; then
        print_success "All services are running correctly"
    else
        print_warning "Some services may not be running correctly. Check docker-compose logs."
    fi
}

# Show next steps
show_next_steps() {
    echo ""
    echo "🎉 Development environment setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Review and update .env file if needed"
    echo "2. Run 'npm run dev' to start all services"
    echo "3. Access the application at http://localhost:8080"
    echo ""
    echo "Useful commands:"
    echo "  npm run services:up     - Start all Docker services"
    echo "  npm run services:down   - Stop all Docker services"
    echo "  npm run services:logs   - View service logs"
    echo "  npm run dev            - Start development servers"
    echo ""
    echo "Service URLs (development):"
    echo "  API Gateway:    http://localhost:3000"
    echo "  User Service:   http://localhost:3001"
    echo "  Location:       http://localhost:3002"
    echo "  Real-time:      http://localhost:3003"
    echo "  PostgreSQL:     localhost:5432"
    echo "  Redis:          localhost:6379"
    echo "  InfluxDB:       http://localhost:8086"
    echo "  Redpanda:       localhost:9092"
    echo "  Nginx:          http://localhost:8080"
    echo ""
}

# Main execution
main() {
    echo "Starting development environment setup..."
    echo ""
    
    check_docker
    check_nodejs
    setup_environment
    install_dependencies
    pull_docker_images
    start_services
    setup_databases
    verify_setup
    show_next_steps
    
    print_success "Development environment is ready! 🚀"
}

# Run main function
main "$@"