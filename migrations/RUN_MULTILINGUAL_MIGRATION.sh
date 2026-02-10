#!/bin/bash

# This script applies the multilingual descriptions migration to your database

echo "=========================================="
echo "Multilingual Descriptions Migration"
echo "=========================================="
echo ""
echo "This will add three new columns to the products table:"
echo "- english_description"
echo "- malayalam_description"  
echo "- hindi_description"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo ""
    echo "Please set it using:"
    echo "export DATABASE_URL='postgresql://user:password@host:port/database'"
    echo ""
    echo "Or provide it directly:"
    read -p "Enter your PostgreSQL connection string: " DB_URL
    
    if [ -z "$DB_URL" ]; then
        echo "❌ No connection string provided. Exiting."
        exit 1
    fi
    
    DATABASE_URL=$DB_URL
fi

echo "Running migration..."
echo ""

# Run the migration
psql "$DATABASE_URL" -f "$(dirname "$0")/add_multilingual_descriptions.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "The products table now has three language-specific description fields."
    echo "You can now add English, Malayalam, and Hindi descriptions to your products."
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    exit 1
fi

