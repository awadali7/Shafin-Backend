#!/bin/bash

echo "🚀 Running Coming Soon migration..."

# Load DATABASE_URL from .env file
if [ -f .env ]; then
    export $(cat .env | grep DATABASE_URL | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL not found in .env file"
    echo "Please set your DATABASE_URL in backend/.env"
    exit 1
fi

# Run the migration
psql "$DATABASE_URL" -f migrations/add_coming_soon_to_products.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully!"
    echo "✅ Column 'is_coming_soon' added to products table"
else
    echo "❌ Migration failed. Check error messages above."
    exit 1
fi
