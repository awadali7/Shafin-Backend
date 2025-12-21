# Step-by-Step Guide: Add KYC Table to Production Server

## Prerequisites
- SSH access to your production server
- PostgreSQL database credentials
- Database name: `elearning_db`
- Database user: `elearning_user` (or your configured user)

## Method 1: Using Migration File (Recommended)

### Step 1: Connect to Your Server
```bash
ssh root@your-server-ip
# or
ssh root@api.diagtools.in
```

### Step 2: Navigate to Backend Directory
```bash
cd /var/www/elearning-backend/backend
```

### Step 3: Run the Migration SQL File
```bash
# Option A: Using psql with migration file
psql -U elearning_user -d elearning_db -f migrations/add_kyc_table.sql

# If you need to enter password, use:
PGPASSWORD=your_password psql -U elearning_user -d elearning_db -f migrations/add_kyc_table.sql
```

### Step 4: Verify the Table Was Created
```bash
# Connect to database
psql -U elearning_user -d elearning_db

# Check if table exists
\dt kyc_verifications

# Check table structure
\d kyc_verifications

# Exit psql
\q
```

## Method 2: Manual SQL Execution

### Step 1: Connect to Database
```bash
psql -U elearning_user -d elearning_db
```

### Step 2: Copy and Paste the SQL Commands

Run these SQL commands one by one:

```sql
-- Create kyc_verifications table
CREATE TABLE IF NOT EXISTS kyc_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    whatsapp_number VARCHAR(20) NOT NULL,
    id_proof_url VARCHAR(500) NOT NULL,
    profile_photo_url VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    rejection_reason TEXT,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user_id ON kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc_verifications(status);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_kyc_verifications_updated_at ON kyc_verifications;
CREATE TRIGGER update_kyc_verifications_updated_at BEFORE UPDATE ON kyc_verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update notifications table to include KYC notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
        'course_access_granted', 
        'multiple_device_login', 
        'announcement', 
        'course_request_approved', 
        'course_request_rejected', 
        'system_update',
        'kyc_verified',
        'kyc_rejected'
    ));
```

### Step 3: Verify
```sql
-- Check table exists
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'kyc_verifications';

-- Check table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'kyc_verifications';
```

## Method 3: Using SCP to Upload and Run

### Step 1: From Your Local Machine
```bash
# Upload the migration file to server
scp backend/migrations/add_kyc_table.sql root@your-server-ip:/tmp/
```

### Step 2: On Server
```bash
# Connect to server
ssh root@your-server-ip

# Run the migration
psql -U elearning_user -d elearning_db -f /tmp/add_kyc_table.sql
```

## Troubleshooting

### Error: "role 'elearning_user' does not exist"
```bash
# Check what user you should use
sudo -u postgres psql -c "\du"

# Use the correct username, or create the user:
sudo -u postgres psql -c "CREATE USER elearning_user WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE elearning_db TO elearning_user;"
```

### Error: "database 'elearning_db' does not exist"
```bash
# List databases
sudo -u postgres psql -c "\l"

# Create database if needed
sudo -u postgres psql -c "CREATE DATABASE elearning_db;"
```

### Error: "function update_updated_at_column() does not exist"
```bash
# The function should exist, but if not, create it:
psql -U elearning_user -d elearning_db -c "
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
\$\$ language 'plpgsql';
"
```

### Error: "permission denied"
```bash
# Make sure you're using the correct database user
# Or use postgres user:
sudo -u postgres psql -d elearning_db -f migrations/add_kyc_table.sql
```

## Quick Verification Script

After running the migration, test the API:

```bash
# Test the KYC endpoint (should return empty array, not error)
curl https://api.diagtools.in/api/kyc?page=1&limit=50
```

Expected response:
```json
{
  "success": true,
  "data": {
    "kyc_verifications": [],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 0,
      "pages": 0
    }
  }
}
```

## Complete One-Line Command (If You Have Password)

```bash
PGPASSWORD=your_db_password psql -h localhost -U elearning_user -d elearning_db -f /var/www/elearning-backend/backend/migrations/add_kyc_table.sql
```

## After Migration

1. **Restart your backend** (if needed):
   ```bash
   pm2 restart elearning-backend
   ```

2. **Test the endpoint**:
   ```bash
   curl https://api.diagtools.in/api/kyc?page=1&limit=50
   ```

3. **Check logs** if there are any errors:
   ```bash
   pm2 logs elearning-backend --lines 50
   ```

---

**Note**: Replace `your_password`, `your-server-ip`, and other placeholders with your actual values.

