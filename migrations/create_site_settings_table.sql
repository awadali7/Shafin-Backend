-- Create site_settings table for storing configurable site settings
CREATE TABLE IF NOT EXISTS site_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(255) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'text',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on setting_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(setting_key);

-- Insert default hero video URL
INSERT INTO site_settings (setting_key, setting_value, setting_type, description)
VALUES 
    ('hero_video_url', 'https://www.youtube.com/embed/IIBU1v3Ae0E?si=_3Ifnu-vi2K5xSyq', 'text', 'YouTube embed URL for the homepage hero section video'),
    ('hero_title', 'Master Automotive Technology with', 'text', 'Main heading text for the hero section'),
    ('hero_description', 'India''s leading e-learning platform for advanced automotive diagnostics, key programming, ECM repairing, and specialized training. Learn in multiple languages including Malayalam, English, Tamil, and Hindi.', 'textarea', 'Hero section description text')
ON CONFLICT (setting_key) DO NOTHING;

-- Add comments to columns
COMMENT ON TABLE site_settings IS 'Stores configurable site-wide settings';
COMMENT ON COLUMN site_settings.setting_key IS 'Unique identifier for the setting';
COMMENT ON COLUMN site_settings.setting_value IS 'The value of the setting';
COMMENT ON COLUMN site_settings.setting_type IS 'Type of input (text, textarea, url, number, etc.)';
COMMENT ON COLUMN site_settings.description IS 'Description of what this setting controls';

