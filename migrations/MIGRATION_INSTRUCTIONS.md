# Database Migration Instructions

## Missing Tables for E-commerce Functionality

Based on your current database, you are missing the following tables required for the order/payment system:

1. **`products`** - Stores physical and digital products
2. **`orders`** - Stores customer orders
3. **`order_items`** - Stores items in each order
4. **`product_entitlements`** - Stores digital product access for users

## Step-by-Step Migration Guide

### Option 1: Using psql (Recommended)

1. **SSH into your production server:**
   ```bash
   ssh root@srv1171172
   ```

2. **Navigate to your backend directory:**
   ```bash
   cd /var/www/backend
   ```

3. **Copy the migration file to your server** (if not already there):
   ```bash
   # If you need to upload the file, use scp from your local machine:
   # scp migrations/add_ecommerce_tables.sql root@srv1171172:/var/www/backend/migrations/
   ```

4. **Connect to PostgreSQL:**
   ```bash
   # Find your database name (usually 'elearning_db' or similar)
   psql -U your_db_user -d your_database_name
   ```
   
   Or if using postgres user:
   ```bash
   sudo -u postgres psql -d your_database_name
   ```

5. **Run the migration:**
   ```sql
   \i migrations/add_ecommerce_tables.sql
   ```
   
   Or copy-paste the SQL directly:
   ```bash
   psql -U your_db_user -d your_database_name -f migrations/add_ecommerce_tables.sql
   ```

6. **Verify tables were created:**
   ```sql
   \dt
   ```
   
   You should see:
   - `products`
   - `orders`
   - `order_items`
   - `product_entitlements`

### Option 2: Using pgAdmin or Database GUI

1. Open your database management tool (pgAdmin, DBeaver, etc.)
2. Connect to your production database
3. Open the SQL editor
4. Copy the contents of `migrations/add_ecommerce_tables.sql`
5. Execute the SQL script
6. Verify tables were created

### Option 3: Direct SQL Execution

1. **SSH into your server:**
   ```bash
   ssh root@srv1171172
   cd /var/www/backend
   ```

2. **Run the migration directly:**
   ```bash
   # Replace with your actual database credentials
   PGPASSWORD=your_password psql -h localhost -U your_db_user -d your_database_name -f migrations/add_ecommerce_tables.sql
   ```

## Verification Steps

After running the migration, verify everything is correct:

```sql
-- Check if all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('products', 'orders', 'order_items', 'product_entitlements');

-- Check table structure
\d products
\d orders
\d order_items
\d product_entitlements

-- Check indexes
\di idx_products*
\di idx_orders*
\di idx_order_items*
\di idx_product_entitlements*
```

## Expected Output

After successful migration, you should see:

```
✅ products table created
✅ orders table created
✅ order_items table created
✅ product_entitlements table created
✅ All indexes created
✅ All triggers created
```

## Troubleshooting

### Error: "function update_updated_at_column() does not exist"
- The migration script includes the function creation, so this shouldn't happen
- If it does, the function will be created automatically by the script

### Error: "relation already exists"
- This means the table already exists
- The script uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run multiple times
- If you want to recreate, drop the table first: `DROP TABLE IF EXISTS table_name CASCADE;`

### Error: "permission denied"
- Make sure you're using a database user with CREATE TABLE permissions
- Use `sudo -u postgres psql` if needed

### Error: "column does not exist" or foreign key errors
- Make sure the `users` table exists (it should based on your current tables)
- Check that all foreign key references are valid

## Rollback (if needed)

If you need to rollback the migration:

```sql
-- WARNING: This will delete all data in these tables!
DROP TABLE IF EXISTS product_entitlements CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
```

## Next Steps

After migration:

1. ✅ Restart your backend server
2. ✅ Test creating a product (via admin panel)
3. ✅ Test creating an order (via checkout)
4. ✅ Verify payment integration works

## Support

If you encounter any issues:
1. Check PostgreSQL logs: `/var/log/postgresql/`
2. Check backend logs for database errors
3. Verify database user has proper permissions


