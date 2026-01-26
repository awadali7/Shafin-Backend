#!/bin/bash

# ========================================
# Run New KYC System Migration on Server
# ========================================

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  New KYC System - Server Migration     ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f "../.env" ]; then
    set -a
    source <(cat ../.env | grep -v '^#' | grep -v '^$' | sed 's/\r$//')
    set +a
    echo -e "${GREEN}✓${NC} Loaded .env file"
else
    echo -e "${RED}✗${NC} .env file not found!"
    exit 1
fi

# Extract database connection details from DATABASE_URL
# Format: postgresql://user:password@host:port/database
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}✗${NC} DATABASE_URL not found in .env file"
    exit 1
fi

# Parse DATABASE_URL
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo "📊 Database Connection:"
echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo ""

# Confirm before running
echo -e "${YELLOW}⚠️  This will update your server database with the new KYC system.${NC}"
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

# Method 1: Try with DATABASE_URL directly
echo "Attempting connection with DATABASE_URL..."
psql "$DATABASE_URL" -f phase1_complete_new_kyc_system.sql 2>/dev/null

# If that fails, try with parsed credentials
if [ $? -ne 0 ]; then
    echo "Trying with parsed credentials..."
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f phase1_complete_new_kyc_system.sql
fi

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     MIGRATION SUCCESSFUL! ✅            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "✓ New KYC system database structure is ready"
    echo "✓ User types added (student/business_owner)"
    echo "✓ Course and product terms tracking enabled"
    echo "✓ Student → Business upgrade capability added"
    echo ""
else
    echo ""
    echo -e "${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║     MIGRATION FAILED! ❌                ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "Please check the errors above and try again."
    exit 1
fi

