-- LeafBridge Postgres extensions for the local dev stack.
-- Enabled at first-boot via docker-entrypoint-initdb.d.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

CREATE DATABASE hapi;
CREATE DATABASE temporal;
CREATE DATABASE leafbridge_lakehouse;
CREATE DATABASE leafbridge_audit;
CREATE DATABASE leafbridge_mpi;
