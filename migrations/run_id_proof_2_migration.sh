#!/bin/bash

# Migration script to rename profile_photo_url to id_proof_2_url
# Run this from the backend directory: ./migrations/run_id_proof_2_migration.sh

set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL environment variable is not set"
    echo "Please set DATABASE_URL in your .env file or export it"
    exit 1
fi

echo "Running migration: rename_profile_photo_to_id_proof_2.sql"
echo "Database: $DATABASE_URL"
echo ""

# Run the migration
psql "$DATABASE_URL" -f "$(dirname "$0")/rename_profile_photo_to_id_proof_2.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Migration completed successfully!"
    echo "✓ Column 'profile_photo_url' has been renamed to 'id_proof_2_url'"
else
    echo ""
    echo "✗ Migration failed!"
    exit 1
fi

