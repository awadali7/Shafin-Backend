#!/bin/bash

# Phase 1: New KYC System Migration Runner
# This script runs all Phase 1 database migrations

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   PHASE 1: New KYC System Migration    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Load environment variables
if [ -f .env ]; then
    source .env
    echo -e "${GREEN}✓ Loaded environment variables${NC}"
else
    echo -e "${RED}✗ Error: .env file not found!${NC}"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}✗ Error: DATABASE_URL not set in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Database connection ready${NC}"
echo ""

# Function to run SQL file
run_migration() {
    local file=$1
    local description=$2
    
    echo -e "${YELLOW}→ Running: $description${NC}"
    
    psql "$DATABASE_URL" -f "$file"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Success: $description${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}✗ Failed: $description${NC}"
        echo ""
        return 1
    fi
}

# Option 1: Run complete migration (all in one)
echo -e "${BLUE}Running complete Phase 1 migration...${NC}"
echo ""

run_migration "migrations/phase1_complete_new_kyc_system.sql" "Phase 1 Complete Migration"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║    PHASE 1 COMPLETE! ✅                 ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}📋 What was added:${NC}"
    echo -e "  ✓ user_type column (student/business_owner)"
    echo -e "  ✓ course_terms_accepted_at column"
    echo -e "  ✓ product_terms_accepted_at column"
    echo -e "  ✓ Business upgrade fields in Student KYC"
    echo -e "  ✓ Updated notification types"
    echo ""
    echo -e "${BLUE}🎯 Next Steps:${NC}"
    echo -e "  1. Implement Phase 2: Backend API"
    echo -e "  2. Implement Phase 3: Frontend UI"
    echo -e "  3. Test the new KYC flows"
    echo ""
else
    echo -e "${RED}Migration failed! Please check the errors above.${NC}"
    exit 1
fi

