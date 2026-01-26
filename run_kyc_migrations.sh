#!/bin/bash

# KYC Database Migration Script
# This script runs the KYC verification and fix migrations

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  KYC Database Migration Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Load environment variables
if [ -f .env ]; then
    source .env
    echo -e "${GREEN}✓ Loaded environment variables from .env${NC}"
else
    echo -e "${RED}✗ Error: .env file not found!${NC}"
    echo -e "Please create .env file with DATABASE_URL"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}✗ Error: DATABASE_URL not set in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Database URL found${NC}"
echo -e "${YELLOW}→ Using DATABASE_URL from .env${NC}"
echo ""

# Function to run SQL file
run_sql_file() {
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

# Step 1: Verify schema
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Step 1: Verifying KYC Schema${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

run_sql_file "migrations/verify_kyc_schema.sql" "KYC Schema Verification"

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠ Schema verification had issues, but continuing...${NC}"
    echo ""
fi

# Step 2: Run migration fix
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Step 2: Running KYC Migration Fix${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

run_sql_file "migrations/fix_kyc_id_proof_urls.sql" "KYC ID Proof URLs Migration"

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Migration failed!${NC}"
    exit 1
fi

# Step 3: Final verification
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Step 3: Final Verification${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

echo -e "${YELLOW}→ Checking migration results...${NC}"
psql "$DATABASE_URL" -c "
SELECT 
    COUNT(*) as total_records,
    COUNT(CASE WHEN id_proof_urls IS NOT NULL THEN 1 END) as records_with_urls,
    COUNT(CASE WHEN id_proof_urls IS NULL THEN 1 END) as records_without_urls
FROM kyc_verifications;
"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Migration Complete! ✓${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}✓ All KYC migrations have been applied successfully${NC}"
echo -e "${YELLOW}→ Next steps:${NC}"
echo -e "  1. Test Course KYC submission"
echo -e "  2. Test Product KYC submission"
echo -e "  3. Verify admin can approve both types"
echo ""
