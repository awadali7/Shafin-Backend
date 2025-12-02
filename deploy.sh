#!/bin/bash

# Deployment script for Hostinger VPS
# Usage: ./deploy.sh

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Please create .env file from .env.example"
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install --production

# Run database migrations (if needed)
# echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
# psql -U elearning_user -d elearning_db -f schema.sql

# Create uploads directory if it doesn't exist
echo -e "${YELLOW}📁 Creating uploads directory...${NC}"
mkdir -p uploads/images
mkdir -p uploads/documents
mkdir -p uploads/blog
mkdir -p logs

# Set permissions
chmod -R 755 uploads
chmod -R 755 logs

# Restart PM2 process
echo -e "${YELLOW}🔄 Restarting application...${NC}"
if pm2 list | grep -q "elearning-backend"; then
    pm2 restart elearning-backend
else
    pm2 start ecosystem.config.js
    pm2 save
fi

# Show status
echo -e "${GREEN}✅ Deployment completed!${NC}"
echo ""
echo "Application status:"
pm2 status elearning-backend
echo ""
echo "Recent logs:"
pm2 logs elearning-backend --lines 20 --nostream

