-- Add missing columns to courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- Add missing columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS categories JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tiered_pricing JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_kyc BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_coming_soon BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_contact_only BOOLEAN DEFAULT false;

-- Add missing columns to kyc_verifications
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS id_proof_urls JSONB;
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS business_id VARCHAR(100);
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS business_location_link TEXT;
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS business_proof_url VARCHAR(500);
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS upgraded_to_business BOOLEAN DEFAULT false;
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS business_upgraded_at TIMESTAMP;

-- Create product_kyc_verifications table
CREATE TABLE IF NOT EXISTS product_kyc_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    whatsapp_number VARCHAR(20) NOT NULL,
    id_proofs JSONB DEFAULT '[]'::jsonb,
    business_proofs JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    rejection_reason TEXT,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create timestamp trigger for product_kyc_verifications
DROP TRIGGER IF EXISTS update_product_kyc_verifications_updated_at ON product_kyc_verifications;
CREATE TRIGGER update_product_kyc_verifications_updated_at BEFORE UPDATE ON product_kyc_verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create site_settings table
CREATE TABLE IF NOT EXISTS site_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'text',
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings if they don't exist
INSERT INTO site_settings (setting_key, setting_value, description)
VALUES 
('hero_title', 'Master Diagnostic Tools', 'Main title on the homepage hero section'),
('hero_description', 'Learn from the best in the industry', 'Subtitle on the homepage hero section'),
('hero_video_url', '', 'URL for the hero background video')
ON CONFLICT (setting_key) DO NOTHING;
