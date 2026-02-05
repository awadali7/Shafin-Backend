-- ========================================
-- Fix Server Product KYC Table
-- ========================================
-- Run this script on your server to check and fix the product_kyc_verifications table

-- First, ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ensure update trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

-- ========================================
-- Create or Update Product KYC Table
-- ========================================

-- Drop and recreate if exists (CAUTION: This will delete all data!)
-- Comment out if you want to preserve existing data
-- DROP TABLE IF EXISTS product_kyc_verifications CASCADE;

-- Create product_kyc_verifications table
CREATE TABLE IF NOT EXISTS product_kyc_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Personal Information
    full_name VARCHAR(200) NOT NULL,
    address TEXT NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    whatsapp_number VARCHAR(20) NOT NULL,
    
    -- Documents (JSONB arrays for multiple files)
    id_proofs JSONB NOT NULL DEFAULT '[]'::jsonb,
    business_proofs JSONB DEFAULT '[]'::jsonb,
    
    -- Status Tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    rejection_reason TEXT,
    
    -- Verification Tracking
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- One KYC per user
    UNIQUE(user_id)
);

-- ========================================
-- Add Missing Columns (if table already exists)
-- ========================================

-- Add columns if they don't exist
DO $$ 
BEGIN
    -- Check and add full_name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='full_name') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN full_name VARCHAR(200) NOT NULL DEFAULT '';
    END IF;

    -- Check and add address
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='address') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN address TEXT NOT NULL DEFAULT '';
    END IF;

    -- Check and add contact_number
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='contact_number') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN contact_number VARCHAR(20) NOT NULL DEFAULT '';
    END IF;

    -- Check and add whatsapp_number
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='whatsapp_number') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN whatsapp_number VARCHAR(20) NOT NULL DEFAULT '';
    END IF;

    -- Check and add id_proofs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='id_proofs') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN id_proofs JSONB NOT NULL DEFAULT '[]'::jsonb;
    END IF;

    -- Check and add business_proofs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='business_proofs') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN business_proofs JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Check and add status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='status') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending';
    END IF;

    -- Check and add rejection_reason
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='rejection_reason') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN rejection_reason TEXT;
    END IF;

    -- Check and add verified_by
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='verified_by') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN verified_by UUID REFERENCES users(id);
    END IF;

    -- Check and add verified_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='verified_at') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN verified_at TIMESTAMP;
    END IF;

    -- Check and add created_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='created_at') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;

    -- Check and add updated_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='product_kyc_verifications' AND column_name='updated_at') THEN
        ALTER TABLE product_kyc_verifications ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- ========================================
-- Indexes
-- ========================================
CREATE INDEX IF NOT EXISTS idx_product_kyc_user_id ON product_kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_product_kyc_status ON product_kyc_verifications(status);

-- ========================================
-- Trigger for updated_at
-- ========================================
DROP TRIGGER IF EXISTS update_product_kyc_updated_at ON product_kyc_verifications;
CREATE TRIGGER update_product_kyc_updated_at 
    BEFORE UPDATE ON product_kyc_verifications
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Verify Installation
-- ========================================
SELECT 
    'product_kyc_verifications table structure:' as info;

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'product_kyc_verifications'
ORDER BY ordinal_position;

SELECT 'Installation complete!' as status;

