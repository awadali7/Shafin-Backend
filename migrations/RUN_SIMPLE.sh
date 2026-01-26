#!/bin/bash

# Simple Migration Script - Uses DATABASE_URL directly

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  New KYC System - Server Migration     ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Load DATABASE_URL from .env
if [ -f "../.env" ]; then
    source ../.env
    echo "✓ Loaded .env file"
else
    echo "✗ .env file not found!"
    exit 1
fi

# Check if DATABASE_URL exists
if [ -z "$DATABASE_URL" ]; then
    echo "✗ DATABASE_URL not found in .env file"
    echo ""
    echo "Please set DATABASE_URL in your .env file:"
    echo "DATABASE_URL=postgresql://username:password@host:port/database"
    exit 1
fi

echo ""
echo "⚠️  This will update your database with the new KYC system."
echo ""
read -p "Do you want to proceed? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Migration cancelled."
    exit 0
fi

# Run the migration
echo "🚀 Running migration..."
echo ""

psql "$DATABASE_URL" -f phase1_complete_new_kyc_system.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║     MIGRATION SUCCESSFUL! ✅            ║"
    echo "╚════════════════════════════════════════╝"
    echo ""
    echo "✓ New KYC system database structure is ready"
    echo "✓ User types added (student/business_owner)"
    echo "✓ Course and product terms tracking enabled"
    echo "✓ Student → Business upgrade capability added"
    echo ""
else
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║     MIGRATION FAILED! ❌                ║"
    echo "╚════════════════════════════════════════╝"
    echo ""
    echo "Possible issues:"
    echo "  1. DATABASE_URL is incorrect"
    echo "  2. Database password is wrong"
    echo "  3. PostgreSQL server is not running"
    echo "  4. Network connection issues"
    echo ""
    echo "Try running manually:"
    echo "  psql \"\$DATABASE_URL\" -f phase1_complete_new_kyc_system.sql"
    echo ""
    exit 1
fi

