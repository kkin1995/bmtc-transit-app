-- Create necessary PostgreSQL extensions for BMTC Transit App
-- This script runs during database initialization

-- Enable PostGIS for geospatial operations
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable PostGIS topology support
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable crypto functions for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable btree_gist for advanced indexing
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create a function to update timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a function to generate short UUIDs
CREATE OR REPLACE FUNCTION generate_short_uuid()
RETURNS TEXT AS $$
BEGIN
    RETURN SUBSTR(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 12);
END;
$$ language 'plpgsql';

-- Create a function for geospatial distance calculation
CREATE OR REPLACE FUNCTION calculate_distance_meters(
    lat1 DOUBLE PRECISION,
    lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION,
    lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION AS $$
BEGIN
    RETURN ST_Distance(
        ST_Transform(ST_SetSRID(ST_MakePoint(lon1, lat1), 4326), 3857),
        ST_Transform(ST_SetSRID(ST_MakePoint(lon2, lat2), 4326), 3857)
    );
END;
$$ language 'plpgsql';

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'BMTC Transit App database extensions created successfully';
END $$;