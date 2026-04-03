-- Initial PostgreSQL setup
-- This file is run automatically when the postgres container starts

-- Create UUID extension (used by Prisma for cuid generation)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types if needed
-- (Prisma will create tables via migrations, but we can add utilities here)

-- Log initialization complete
\echo 'PostgreSQL initialization complete'
