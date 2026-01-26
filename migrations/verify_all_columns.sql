-- ============================================================
-- Comprehensive check of all products table columns
-- Run this on your SERVER to see what columns exist
-- ============================================================

SELECT '=== Products Table Columns ===' as info;
SELECT 
    column_name, 
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'products'
ORDER BY ordinal_position;

SELECT '=== Checking Critical Columns ===' as info;
SELECT 
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'tiered_pricing') 
        THEN '✓ tiered_pricing EXISTS'
        ELSE '✗ tiered_pricing MISSING' 
    END as tiered_pricing_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'quantity_pricing') 
        THEN '✓ quantity_pricing EXISTS (OLD - needs rename)'
        ELSE '✓ quantity_pricing not found' 
    END as quantity_pricing_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'categories') 
        THEN '✓ categories EXISTS'
        ELSE '✗ categories MISSING' 
    END as categories_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_featured') 
        THEN '✓ is_featured EXISTS'
        ELSE '✗ is_featured MISSING' 
    END as is_featured_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_coming_soon') 
        THEN '✓ is_coming_soon EXISTS'
        ELSE '✗ is_coming_soon MISSING' 
    END as is_coming_soon_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'requires_kyc') 
        THEN '✓ requires_kyc EXISTS'
        ELSE '✗ requires_kyc MISSING' 
    END as requires_kyc_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'images') 
        THEN '✓ images EXISTS'
        ELSE '✗ images MISSING' 
    END as images_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'videos') 
        THEN '✓ videos EXISTS'
        ELSE '✗ videos MISSING' 
    END as videos_status;

SELECT '=== Checking Orders Table Columns ===' as info;
SELECT 
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'discount') 
        THEN '✓ discount EXISTS'
        ELSE '✗ discount MISSING' 
    END as discount_status;

SELECT '=== Checking Order Items Table Columns ===' as info;
SELECT 
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'custom_price') 
        THEN '✓ custom_price EXISTS'
        ELSE '✗ custom_price MISSING' 
    END as custom_price_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'price_type') 
        THEN '✓ price_type EXISTS'
        ELSE '✗ price_type MISSING' 
    END as price_type_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'product_type') 
        THEN '✓ product_type EXISTS'
        ELSE '✗ product_type MISSING' 
    END as product_type_status;

