#!/bin/bash

# BMTC Transit App - Database Utilities
# This script provides database management utilities

set -e

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

# Database connection settings
DB_CONTAINER="bmtc-postgres"
DB_NAME="bmtc_transit_dev"
DB_USER="bmtc_user"

# Function to check if database container is running
check_db_container() {
    if ! docker ps | grep -q "$DB_CONTAINER"; then
        print_error "Database container '$DB_CONTAINER' is not running"
        print_status "Start it with: npm run services:up"
        exit 1
    fi
}

# Connect to PostgreSQL
connect_db() {
    print_status "Connecting to PostgreSQL..."
    check_db_container
    docker exec -it "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
}

# Show database status
db_status() {
    print_status "Database Status:"
    check_db_container
    
    echo ""
    echo "Container Status:"
    docker ps --filter "name=$DB_CONTAINER" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    echo ""
    echo "Database Information:"
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 
            current_database() as database,
            current_user as user,
            version() as version;
    "
    
    echo ""
    echo "Database Size:"
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 
            pg_database.datname,
            pg_size_pretty(pg_database_size(pg_database.datname)) AS size
        FROM pg_database
        WHERE pg_database.datname = '$DB_NAME';
    "
}

# List all tables
list_tables() {
    print_status "Database Tables:"
    check_db_container
    
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 
            schemaname,
            tablename,
            tableowner
        FROM pg_tables 
        WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
        ORDER BY schemaname, tablename;
    "
}

# Show table schema
show_schema() {
    if [ -z "$1" ]; then
        print_error "Please provide a table name"
        echo "Usage: $0 schema <table_name>"
        exit 1
    fi
    
    TABLE_NAME="$1"
    print_status "Schema for table: $TABLE_NAME"
    check_db_container
    
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "\d $TABLE_NAME"
}

# Backup database
backup_db() {
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
    print_status "Creating database backup: $BACKUP_FILE"
    check_db_container
    
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE"
    print_success "Backup created: $BACKUP_FILE"
}

# Restore database
restore_db() {
    if [ -z "$1" ]; then
        print_error "Please provide a backup file"
        echo "Usage: $0 restore <backup_file.sql>"
        exit 1
    fi
    
    BACKUP_FILE="$1"
    
    if [ ! -f "$BACKUP_FILE" ]; then
        print_error "Backup file '$BACKUP_FILE' not found"
        exit 1
    fi
    
    print_warning "This will restore the database from: $BACKUP_FILE"
    read -p "Are you sure? This will overwrite existing data! (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Restore cancelled"
        exit 0
    fi
    
    print_status "Restoring database from: $BACKUP_FILE"
    check_db_container
    
    docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$BACKUP_FILE"
    print_success "Database restored from: $BACKUP_FILE"
}

# Reset database
reset_db() {
    print_warning "This will DROP and recreate the database!"
    read -p "Are you sure? This will delete ALL data! (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Reset cancelled"
        exit 0
    fi
    
    print_status "Resetting database..."
    check_db_container
    
    # Drop and recreate database
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
    
    print_success "Database reset completed"
    print_status "Run migrations to recreate tables"
}

# Show database logs
show_logs() {
    print_status "PostgreSQL Logs:"
    docker logs "$DB_CONTAINER" --tail 50 -f
}

# Run custom SQL
run_sql() {
    if [ -z "$1" ]; then
        print_error "Please provide SQL query"
        echo "Usage: $0 sql 'SELECT * FROM users LIMIT 5;'"
        exit 1
    fi
    
    SQL_QUERY="$1"
    print_status "Executing SQL: $SQL_QUERY"
    check_db_container
    
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "$SQL_QUERY"
}

# Show help
show_help() {
    echo "BMTC Transit App - Database Utilities"
    echo "Usage: $0 <command> [arguments]"
    echo ""
    echo "Commands:"
    echo "  connect         Connect to PostgreSQL shell"
    echo "  status          Show database status and information"
    echo "  tables          List all tables in the database"
    echo "  schema <table>  Show schema for specific table"
    echo "  backup          Create a backup of the database"
    echo "  restore <file>  Restore database from backup file"
    echo "  reset           Reset database (WARNING: deletes all data)"
    echo "  logs            Show PostgreSQL logs"
    echo "  sql '<query>'   Execute custom SQL query"
    echo "  help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 status"
    echo "  $0 tables"
    echo "  $0 schema users"
    echo "  $0 backup"
    echo "  $0 restore backup_20231201_120000.sql"
    echo "  $0 sql 'SELECT COUNT(*) FROM users;'"
    echo ""
}

# Main command handler
case "${1:-help}" in
    connect)
        connect_db
        ;;
    status)
        db_status
        ;;
    tables)
        list_tables
        ;;
    schema)
        show_schema "$2"
        ;;
    backup)
        backup_db
        ;;
    restore)
        restore_db "$2"
        ;;
    reset)
        reset_db
        ;;
    logs)
        show_logs
        ;;
    sql)
        run_sql "$2"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac