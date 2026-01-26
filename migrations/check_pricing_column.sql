-- ============================================================
-- Check which pricing column exists on your database
-- Run this FIRST on your server to diagnose the issue
-- ============================================================

SELECT 
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name IN ('quantity_pricing', 'quantity_discounts', 'tiered_pricing')
ORDER BY column_name;

-- Expected outcomes:
-- 1. If you see 'quantity_pricing' -> You need to run fix_quantity_pricing_rename.sql
-- 2. If you see 'tiered_pricing' -> Column is correct, issue might be elsewhere
-- 3. If you see 'quantity_discounts' -> Very old, run fix_quantity_pricing_rename.sql
-- 4. If you see nothing -> Run fix_quantity_pricing_rename.sql to create it

