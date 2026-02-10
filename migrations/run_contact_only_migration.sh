#!/bin/bash

# Migration script to add is_contact_only field to products
# Run this from the backend directory: ./migrations/run_contact_only_migration.sh

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

echo "Running migration: add_contact_only_to_products.sql"
echo "Database: $DATABASE_URL"
echo ""

# Run the migration
psql "$DATABASE_URL" -f "$(dirname "$0")/add_contact_only_to_products.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Migration completed successfully!"
    echo "✓ Column 'is_contact_only' has been added to products table"
else
    echo ""
    echo "✗ Migration failed!"
    exit 1
fi

