# Server Database Update - Method 2 (Node.js Script) - Step by Step Guide

## Prerequisites Checklist

Before starting, ensure:
- ✅ You have SSH access to your server
- ✅ You know your server IP/domain
- ✅ You have the server path (usually `/var/www/backend` or similar)
- ✅ Your `.env` file on server has `DATABASE_URL` configured correctly
- ✅ Node.js is installed on the server
- ✅ Backend dependencies are installed (`npm install`)

---

## Step-by-Step Instructions

### Step 1: Verify Files Exist Locally

Make sure these files exist in your local project:
- ✅ `backend/migrations/update_server_database.sql`
- ✅ `backend/src/utils/runServerDatabaseUpdate.js`

### Step 2: Copy Files to Server

From your **local machine**, run these commands:

```bash
# Replace with your actual server details
SERVER_USER="root"  # or your SSH username
SERVER_IP="your-server-ip-or-domain"  # e.g., srv1171172.hostgator.com
SERVER_PATH="/var/www/backend"  # or your backend path

# Copy the SQL migration file
scp backend/migrations/update_server_database.sql ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/migrations/

# Copy the Node.js script
scp backend/src/utils/runServerDatabaseUpdate.js ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/src/utils/
```

**Example:**
```bash
scp backend/migrations/update_server_database.sql root@srv1171172:/var/www/backend/migrations/
scp backend/src/utils/runServerDatabaseUpdate.js root@srv1171172:/var/www/backend/src/utils/
```

### Step 3: SSH into Your Server

```bash
ssh root@your-server-ip
# or
ssh your-username@your-server-ip
```

### Step 4: Navigate to Backend Directory

```bash
cd /var/www/backend
# or wherever your backend code is located
```

### Step 5: Verify Files Were Copied

```bash
# Check if SQL file exists
ls -la migrations/update_server_database.sql

# Check if Node.js script exists
ls -la src/utils/runServerDatabaseUpdate.js

# Both should show file details
```

### Step 6: Verify .env File Has DATABASE_URL

```bash
# Check if .env file exists
ls -la .env

# View DATABASE_URL (be careful, don't expose it publicly)
grep DATABASE_URL .env

# The output should show something like:
# DATABASE_URL=postgresql://username:password@localhost:5432/elearning_db
```

**If DATABASE_URL is missing, add it:**
```bash
# Edit .env file
nano .env

# Add this line (replace with your actual database credentials):
DATABASE_URL=postgresql://username:password@localhost:5432/elearning_db

# Save and exit (Ctrl+X, then Y, then Enter)
```

### Step 7: Verify Dependencies Are Installed

```bash
# Check if node_modules exists
ls -la node_modules/

# If not, install dependencies
npm install
```

### Step 8: Test Database Connection (Optional but Recommended)

```bash
# Test if you can connect to the database
node -e "require('dotenv').config(); const { Pool } = require('pg'); const pool = new Pool({ connectionString: process.env.DATABASE_URL }); pool.query('SELECT NOW()').then(() => { console.log('✅ Database connection successful'); process.exit(0); }).catch(err => { console.error('❌ Database connection failed:', err.message); process.exit(1); });"
```

### Step 9: Run the Database Update Script

```bash
# Run the update script
node src/utils/runServerDatabaseUpdate.js
```

**Expected Output:**
```
🔄 Starting server database update...
📋 This will add missing tables and columns

📝 Executing database updates...

✅ Server database update completed successfully!

🔍 Verifying updates...

  ✅ course_orders table exists
  ✅ users.terms_accepted_at exists
  ✅ users.last_login_at exists
  ✅ users.last_login_ip exists
  ✅ users.last_login_device exists
  ✅ products.images exists
  ✅ products.videos exists
  ✅ kyc_verifications.id_proof_urls exists

✅ Database update verification complete!

💡 Next steps:
   1. Restart your backend server
   2. Test the new functionality
   3. Monitor application logs for any issues
```

### Step 10: Restart Your Backend Server

```bash
# If using PM2:
pm2 restart backend
# or
pm2 restart all

# If using systemd:
sudo systemctl restart your-backend-service

# If running manually, stop and start:
# Stop: Ctrl+C (if running in terminal)
# Start: npm start or node server.js
```

### Step 11: Verify Everything Works

1. **Check server logs** for any errors:
   ```bash
   # PM2 logs
   pm2 logs backend
   
   # Or check application logs
   tail -f logs/app.log
   ```

2. **Test the application:**
   - Try creating a product with images/videos
   - Check if user login updates last_login fields
   - Verify course orders work

---

## Troubleshooting

### Error: "Cannot find module 'pg'"
```bash
# Install dependencies
npm install
```

### Error: "DATABASE_URL is not defined"
```bash
# Make sure .env file exists and has DATABASE_URL
cat .env | grep DATABASE_URL

# If missing, add it:
echo "DATABASE_URL=postgresql://username:password@localhost:5432/elearning_db" >> .env
```

### Error: "Migration file not found"
```bash
# Verify file exists
ls -la migrations/update_server_database.sql

# If not, copy it again from Step 2
```

### Error: "permission denied" or "Connection refused"
```bash
# Check database connection string in .env
# Verify PostgreSQL is running
sudo systemctl status postgresql

# Check if database exists
psql -U your_user -d elearning_db -c "SELECT 1;"
```

### Error: "relation already exists" or "column already exists"
- ✅ This is **OK**! It means the table/column already exists
- The script uses `IF NOT EXISTS` so it won't fail
- Just continue to Step 10

---

## Quick Copy-Paste Commands

Replace `YOUR_SERVER` with your actual server IP/domain:

```bash
# From local machine - Copy files
scp backend/migrations/update_server_database.sql root@YOUR_SERVER:/var/www/backend/migrations/
scp backend/src/utils/runServerDatabaseUpdate.js root@YOUR_SERVER:/var/www/backend/src/utils/

# SSH into server
ssh root@YOUR_SERVER

# On server - Navigate and run
cd /var/www/backend
node src/utils/runServerDatabaseUpdate.js

# Restart server
pm2 restart all
```

---

## What Gets Updated

✅ **Table Created:**
- `course_orders` - For tracking course purchases

✅ **Columns Added:**
- `users.terms_accepted_at` - Terms acceptance timestamp
- `users.last_login_at` - Last login time
- `users.last_login_ip` - Last login IP address
- `users.last_login_device` - Last login device info
- `products.images` - Array of image URLs (JSONB)
- `products.videos` - Array of video objects (JSONB)
- `kyc_verifications.id_proof_urls` - Multiple ID proof URLs (JSONB)

✅ **Constraint Updated:**
- `notifications.type` - Added KYC notification types

---

## Need Help?

If you encounter issues:
1. Check the error message carefully
2. Verify all prerequisites (Step 1)
3. Check database connection (Step 8)
4. Review server logs
5. Ensure PostgreSQL is running and accessible


