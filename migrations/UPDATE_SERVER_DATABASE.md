# Update Server Database - Complete Guide

This guide will help you update your production/server database with all missing tables and columns.

## What This Updates

### Missing Tables:
- ✅ `course_orders` - Tracks course purchases

### Missing Columns:

**users table:**
- `terms_accepted_at` - When user accepted terms
- `last_login_at` - Last login timestamp
- `last_login_ip` - Last login IP address
- `last_login_device` - Last login device info (JSONB)

**products table:**
- `images` - Array of image URLs (JSONB)
- `videos` - Array of video objects (JSONB)

**kyc_verifications table:**
- `id_proof_urls` - Array of ID proof URLs (JSONB)

**notifications table:**
- Updated `type` constraint to include KYC notification types

---

## Option 1: Using psql (Recommended)

### Step 1: SSH into your server
```bash
ssh root@srv1171172
# or
ssh your_user@your_server
```

### Step 2: Navigate to backend directory
```bash
cd /var/www/backend
# or wherever your backend code is located
```

### Step 3: Copy the migration file to server

**From your local machine:**
```bash
scp backend/migrations/update_server_database.sql root@srv1171172:/var/www/backend/migrations/
```

**Or create it directly on the server:**
```bash
# On server, create the file
nano /var/www/backend/migrations/update_server_database.sql
# Copy-paste the SQL content from update_server_database.sql
```

### Step 4: Connect to PostgreSQL
```bash
# Find your database name (usually 'elearning_db')
psql -U your_db_user -d elearning_db

# Or if using postgres user:
sudo -u postgres psql -d elearning_db
```

### Step 5: Run the migration
```sql
-- Inside psql:
\i migrations/update_server_database.sql
```

**Or run directly from command line:**
```bash
psql -U your_db_user -d elearning_db -f migrations/update_server_database.sql
```

---

## Option 2: Using Node.js Script (Alternative)

### Step 1: Copy the migration script to server
```bash
scp backend/src/utils/runServerDatabaseUpdate.js root@srv1171172:/var/www/backend/src/utils/
scp backend/migrations/update_server_database.sql root@srv1171172:/var/www/backend/migrations/
```

### Step 2: SSH into server and run
```bash
ssh root@srv1171172
cd /var/www/backend
node src/utils/runServerDatabaseUpdate.js
```

---

## Option 3: Using Database GUI (pgAdmin, DBeaver, etc.)

1. Connect to your production database
2. Open SQL editor/query tool
3. Copy the contents of `update_server_database.sql`
4. Execute the SQL script
5. Verify results

---

## Verification After Migration

After running the migration, verify everything was added correctly:

```sql
-- 1. Check if course_orders table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'course_orders';

-- 2. Check users table columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('terms_accepted_at', 'last_login_at', 'last_login_ip', 'last_login_device')
ORDER BY column_name;

-- 3. Check products table columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('images', 'videos')
ORDER BY column_name;

-- 4. Check kyc_verifications column (if table exists)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'kyc_verifications' 
AND column_name = 'id_proof_urls';

-- 5. List all tables (should show course_orders)
\dt
```

---

## Expected Results

### Tables:
- ✅ `course_orders` should appear in `\dt` output

### Columns:

**users table:**
```
terms_accepted_at    | timestamp without time zone
last_login_at        | timestamp without time zone
last_login_ip        | character varying(45)
last_login_device    | jsonb
```

**products table:**
```
images               | jsonb
videos               | jsonb
```

**kyc_verifications table (if exists):**
```
id_proof_urls        | jsonb
```

---

## Troubleshooting

### Error: "permission denied"
```bash
# Use postgres superuser
sudo -u postgres psql -d elearning_db -f migrations/update_server_database.sql
```

### Error: "relation already exists" or "column already exists"
- These errors are safe to ignore - the script uses `IF NOT EXISTS` checks
- Your database already has the table/column, so nothing needs to be done

### Error: "function uuid_generate_v4() does not exist"
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Error: "foreign key constraint"
- Make sure the `orders` and `courses` tables exist
- These should already exist in your database

---

## Backup Before Migration (Recommended)

```bash
# Create a backup before running migration
pg_dump -U your_db_user -d elearning_db > backup_before_update_$(date +%Y%m%d_%H%M%S).sql

# Or with timestamp
pg_dump -U your_db_user -d elearning_db > backup_$(date +%Y%m%d).sql
```

---

## Rollback (if needed)

If you need to rollback (WARNING: This will delete data):

```sql
-- Remove course_orders table (WARNING: Deletes all data)
DROP TABLE IF EXISTS course_orders CASCADE;

-- Remove columns from users table
ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_at;
ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;
ALTER TABLE users DROP COLUMN IF EXISTS last_login_ip;
ALTER TABLE users DROP COLUMN IF EXISTS last_login_device;

-- Remove columns from products table
ALTER TABLE products DROP COLUMN IF EXISTS images;
ALTER TABLE products DROP COLUMN IF EXISTS videos;

-- Remove column from kyc_verifications table
ALTER TABLE kyc_verifications DROP COLUMN IF EXISTS id_proof_urls;
```

---

## After Migration

1. ✅ Restart your backend server
2. ✅ Test creating a course order
3. ✅ Test product with multiple images/videos
4. ✅ Test user login (should update last_login fields)
5. ✅ Test KYC verification with multiple ID proofs

---

## Support

If you encounter issues:
1. Check PostgreSQL logs: `/var/log/postgresql/`
2. Check backend application logs
3. Verify database user has proper permissions
4. Ensure all required tables exist before adding foreign keys



