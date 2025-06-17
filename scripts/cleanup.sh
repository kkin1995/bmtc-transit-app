#!/bin/bash

# BMTC Transit App - Cleanup Script
# This script cleans up the development environment

set -e

echo "🧹 BMTC Transit App - Development Environment Cleanup"
echo "===================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Parse command line arguments
FULL_CLEANUP=false
KEEP_DATA=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --full)
            FULL_CLEANUP=true
            shift
            ;;
        --remove-data)
            KEEP_DATA=false
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --full         Perform full cleanup including images"
            echo "  --remove-data  Remove persistent data volumes"
            echo "  -h, --help     Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Stop all running containers
stop_containers() {
    print_status "Stopping all containers..."
    
    docker-compose -f docker/docker-compose.dev.yml down
    
    print_success "All containers stopped"
}

# Remove containers and networks
remove_containers() {
    print_status "Removing containers and networks..."
    
    docker-compose -f docker/docker-compose.dev.yml down --remove-orphans
    
    print_success "Containers and networks removed"
}

# Remove volumes (data)
remove_volumes() {
    if [ "$KEEP_DATA" = false ]; then
        print_warning "Removing persistent data volumes..."
        
        docker-compose -f docker/docker-compose.dev.yml down -v
        
        print_success "Data volumes removed"
    else
        print_status "Keeping persistent data volumes"
    fi
}

# Clean Docker system
clean_docker_system() {
    if [ "$FULL_CLEANUP" = true ]; then
        print_status "Performing full Docker cleanup..."
        
        # Remove unused images
        docker image prune -f
        
        # Remove unused containers
        docker container prune -f
        
        # Remove unused networks
        docker network prune -f
        
        # Remove build cache
        docker builder prune -f
        
        print_success "Docker system cleaned"
    else
        print_status "Skipping Docker system cleanup (use --full for complete cleanup)"
    fi
}

# Clean node modules
clean_node_modules() {
    print_status "Cleaning Node.js dependencies..."
    
    # Remove node_modules from root
    if [ -d "node_modules" ]; then
        rm -rf node_modules
        print_success "Removed root node_modules"
    fi
    
    # Remove node_modules from services
    for service_dir in services/*/; do
        if [ -d "$service_dir/node_modules" ]; then
            rm -rf "$service_dir/node_modules"
            print_success "Removed node_modules from $(basename "$service_dir")"
        fi
    done
    
    # Remove node_modules from packages
    for package_dir in packages/*/; do
        if [ -d "$package_dir/node_modules" ]; then
            rm -rf "$package_dir/node_modules"
            print_success "Removed node_modules from $(basename "$package_dir")"
        fi
    done
    
    # Remove node_modules from mobile
    if [ -d "mobile/node_modules" ]; then
        rm -rf mobile/node_modules
        print_success "Removed node_modules from mobile"
    fi
}

# Clean build artifacts
clean_build_artifacts() {
    print_status "Cleaning build artifacts..."
    
    # Remove dist directories
    find . -name "dist" -type d -not -path "./node_modules/*" -exec rm -rf {} + 2>/dev/null || true
    
    # Remove build directories
    find . -name "build" -type d -not -path "./node_modules/*" -exec rm -rf {} + 2>/dev/null || true
    
    # Remove coverage directories
    find . -name "coverage" -type d -not -path "./node_modules/*" -exec rm -rf {} + 2>/dev/null || true
    
    # Remove TypeScript build info
    find . -name "*.tsbuildinfo" -type f -not -path "./node_modules/*" -delete 2>/dev/null || true
    
    print_success "Build artifacts cleaned"
}

# Clean logs
clean_logs() {
    print_status "Cleaning log files..."
    
    # Remove log files
    find . -name "*.log" -type f -not -path "./node_modules/*" -delete 2>/dev/null || true
    
    # Remove log directories
    find . -name "logs" -type d -not -path "./node_modules/*" -exec rm -rf {} + 2>/dev/null || true
    
    print_success "Log files cleaned"
}

# Show cleanup summary
show_summary() {
    echo ""
    echo "🎉 Cleanup completed!"
    echo ""
    echo "What was cleaned:"
    echo "  ✅ Docker containers and networks"
    
    if [ "$KEEP_DATA" = false ]; then
        echo "  ✅ Persistent data volumes"
    else
        echo "  ⏭️  Persistent data volumes (kept)"
    fi
    
    if [ "$FULL_CLEANUP" = true ]; then
        echo "  ✅ Docker images and build cache"
    else
        echo "  ⏭️  Docker images and build cache (kept)"
    fi
    
    echo "  ✅ Node.js dependencies"
    echo "  ✅ Build artifacts"
    echo "  ✅ Log files"
    echo ""
    echo "To start fresh:"
    echo "  ./scripts/dev-setup.sh"
    echo ""
}

# Main execution
main() {
    echo "Starting cleanup process..."
    echo ""
    
    if [ "$FULL_CLEANUP" = true ]; then
        print_warning "Performing FULL cleanup including Docker images"
    fi
    
    if [ "$KEEP_DATA" = false ]; then
        print_warning "Will REMOVE persistent data volumes"
    fi
    
    echo ""
    read -p "Continue with cleanup? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Cleanup cancelled"
        exit 0
    fi
    
    stop_containers
    remove_containers
    remove_volumes
    clean_docker_system
    clean_node_modules
    clean_build_artifacts
    clean_logs
    show_summary
    
    print_success "Environment cleanup completed! 🧹"
}

# Run main function
main "$@"