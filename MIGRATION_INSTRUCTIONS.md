# Migration Instructions - Course Purchase Support

## What This Migration Does

This migration adds support for course purchases (separate from shop products):

1. **Adds `terms_accepted_at` column** to `users` table
   - Required for course purchase
   - Users must accept terms before purchasing courses

2. **Creates `course_orders` table**
   - Tracks course purchases
   - Links orders to courses (separate from shop products)
   - Enables automatic course access granting after payment

## How to Run the Migration

### Option 1: Using psql command line

```bash
# Connect to your database and run the migration
psql -d your_database_name -f backend/migrations/001_add_course_purchase_tables.sql
```

### Option 2: Using psql interactive mode

```bash
# Connect to your database
psql -d your_database_name

# Run the migration
\i backend/migrations/001_add_course_purchase_tables.sql
```

### Option 3: Copy and paste SQL

1. Open the migration file: `backend/migrations/001_add_course_purchase_tables.sql`
2. Copy all the SQL code
3. Connect to your database using any PostgreSQL client (pgAdmin, DBeaver, etc.)
4. Paste and execute the SQL

## Verify Migration Success

After running the migration, verify it worked:

```sql
-- Check if terms_accepted_at column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'terms_accepted_at';

-- Check if course_orders table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'course_orders';

-- Check course_orders table structure
\d course_orders
```

You should see:
- ✅ `terms_accepted_at` column in `users` table
- ✅ `course_orders` table exists
- ✅ All indexes created

## Rollback (if needed)

If you need to rollback this migration:

```sql
BEGIN;

-- Drop course_orders table
DROP TABLE IF EXISTS course_orders CASCADE;

-- Remove terms_accepted_at column
ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_at;

COMMIT;
```

## After Migration

Once the migration is complete:

1. ✅ Backend API endpoints will work:
   - `POST /api/courses/:id/purchase` - Purchase course
   - `POST /api/users/accept-terms` - Accept terms

2. ✅ Payment verification will automatically:
   - Detect course orders
   - Grant course access
   - Unlock all videos

3. ⏳ Frontend needs to call terms acceptance API after user accepts terms

## Notes

- This migration is **safe to run multiple times** (uses `IF NOT EXISTS`)
- No data will be lost
- Existing functionality remains unchanged
- Migration runs in a transaction (all-or-nothing)

