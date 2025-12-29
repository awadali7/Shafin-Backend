-- =====================================================
-- Migration: Add Course Purchase Support
-- =====================================================
-- This migration adds:
-- 1. terms_accepted_at column to users table
-- 2. course_orders table for tracking course purchases
-- 
-- Run this file: psql -d your_database -f ADD_COURSE_PURCHASE.sql
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Add terms_accepted_at to users table
-- =====================================================
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_terms_accepted ON users(terms_accepted_at);

COMMENT ON COLUMN users.terms_accepted_at IS 'Timestamp when user accepted terms and conditions (required for course purchase)';

-- =====================================================
-- 2. Create course_orders table
-- =====================================================
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

COMMIT;

-- =====================================================
-- Verification (optional - removes automatically)
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE '✅ Added terms_accepted_at column to users table';
    RAISE NOTICE '✅ Created course_orders table';
END $$;

