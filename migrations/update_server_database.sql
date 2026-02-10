-- Comprehensive Database Update Script
-- This script adds all missing tables and columns to your database
-- Run this on your server to update the database

-- ============================================
-- 1. Missing Tables
-- ============================================

-- Create course_orders table if it doesn't exist
CREATE TABLE IF NOT EXISTS course_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    course_name VARCHAR(255) NOT NULL,
    course_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_course_orders_order_id ON course_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_course_orders_course_id ON course_orders(course_id);

COMMENT ON TABLE course_orders IS 'Tracks which orders are for course purchases (separate from product orders)';

-- ============================================
-- 2. Missing Columns - users table
-- ============================================

-- Add terms_accepted_at column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'terms_accepted_at'
    ) THEN
        ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMP;
        CREATE INDEX IF NOT EXISTS idx_users_terms_accepted ON users(terms_accepted_at);
    END IF;
END $$;

-- Add last_login_at column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_login_at'
    ) THEN
        ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
    END IF;
END $$;

-- Add last_login_ip column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_login_ip'
    ) THEN
        ALTER TABLE users ADD COLUMN last_login_ip VARCHAR(45);
    END IF;
END $$;

-- Add last_login_device column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_login_device'
    ) THEN
        ALTER TABLE users ADD COLUMN last_login_device JSONB;
    END IF;
END $$;

-- ============================================
-- 3. Missing Columns - products table
-- ============================================

-- Add images column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'images'
    ) THEN
        ALTER TABLE products ADD COLUMN images JSONB DEFAULT '[]'::jsonb;
        
        -- Migrate existing cover_image to images array if cover_image exists
        UPDATE products 
        SET images = CASE 
            WHEN cover_image IS NOT NULL AND cover_image != '' THEN jsonb_build_array(cover_image)
            ELSE '[]'::jsonb
        END
        WHERE images IS NULL OR images = '[]'::jsonb;
        
        CREATE INDEX IF NOT EXISTS idx_products_images ON products USING GIN (images);
    END IF;
END $$;

-- Add videos column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'videos'
    ) THEN
        ALTER TABLE products ADD COLUMN videos JSONB DEFAULT '[]'::jsonb;
        CREATE INDEX IF NOT EXISTS idx_products_videos ON products USING GIN (videos);
    END IF;
END $$;

-- ============================================
-- 4. Missing Columns - kyc_verifications table
-- ============================================

-- Add id_proof_urls column (if kyc_verifications table exists)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'kyc_verifications'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'kyc_verifications' AND column_name = 'id_proof_urls'
        ) THEN
            ALTER TABLE kyc_verifications ADD COLUMN id_proof_urls JSONB;
            
            -- Migrate existing single URL to array format
            UPDATE kyc_verifications 
            SET id_proof_urls = CASE 
                WHEN id_proof_url IS NOT NULL THEN jsonb_build_array(id_proof_url)
                ELSE NULL
            END
            WHERE id_proof_urls IS NULL;
        END IF;
    END IF;
END $$;

-- ============================================
-- 5. Update notifications table constraint
-- ============================================

-- Update notifications type constraint to include KYC types
DO $$ 
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    
    -- Add new constraint with KYC types
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
EXCEPTION
    WHEN duplicate_object THEN
        -- Constraint already exists, skip
        NULL;
END $$;

-- ============================================
-- Verification Queries (run separately to verify)
-- ============================================

-- Verify course_orders table exists
-- SELECT 'course_orders' as table_name, COUNT(*) as exists 
-- FROM information_schema.tables 
-- WHERE table_name = 'course_orders';

-- Verify users table columns
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'users' 
-- AND column_name IN ('terms_accepted_at', 'last_login_at', 'last_login_ip', 'last_login_device')
-- ORDER BY column_name;

-- Verify products table columns
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'products' 
-- AND column_name IN ('images', 'videos')
-- ORDER BY column_name;

-- Verify kyc_verifications column
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'kyc_verifications' 
-- AND column_name = 'id_proof_urls';





