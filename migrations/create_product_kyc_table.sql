-- ========================================
-- Product KYC Verifications Table
-- ========================================

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
    id_proofs JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Minimum 2 personal IDs (Aadhaar, PAN, Passport, etc.)
    business_proofs JSONB DEFAULT '[]'::jsonb,     -- Business documents (GST, Shop license, etc.) - optional
    
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
-- Update Notifications Table
-- ========================================
-- Add product KYC notification types
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
        'kyc_rejected',
        'product_kyc_verified',
        'product_kyc_rejected'
    ));

-- ========================================
-- Comments
-- ========================================
COMMENT ON TABLE product_kyc_verifications IS 'KYC verification for product purchases';
COMMENT ON COLUMN product_kyc_verifications.id_proofs IS 'Array of personal ID proof URLs (minimum 2 required)';
COMMENT ON COLUMN product_kyc_verifications.business_proofs IS 'Array of business proof URLs (optional)';


