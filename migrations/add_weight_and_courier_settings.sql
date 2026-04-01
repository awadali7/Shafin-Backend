-- Migration: Add weight to products and global courier settings

-- 1. Add weight column to products table (stored in kg or grams, let's use grams for precision and default to 1000g = 1kg if not set)
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight DECIMAL(10,2) DEFAULT 0.00;

-- 2. Add default DTDC courier rates to site_settings
INSERT INTO site_settings (setting_key, setting_value, setting_type, description)
VALUES 
    ('local_base_weight', '1000', 'number', 'Base weight for Local zone in grams (e.g., 1000 for 1kg)'),
    ('local_base_rate', '50', 'number', 'Courier charge for the base weight in Local zone (₹)'),
    ('local_additional_weight', '1000', 'number', 'Additional weight increment for Local zone in grams'),
    ('local_additional_rate', '40', 'number', 'Courier charge for every additional weight increment in Local zone (₹)'),

    ('regional_base_weight', '1000', 'number', 'Base weight for Regional zone in grams'),
    ('regional_base_rate', '70', 'number', 'Courier charge for the base weight in Regional zone (₹)'),
    ('regional_additional_weight', '1000', 'number', 'Additional weight increment for Regional zone in grams'),
    ('regional_additional_rate', '60', 'number', 'Courier charge for every additional weight increment in Regional zone (₹)'),

    ('national_base_weight', '1000', 'number', 'Base weight for National zone in grams'),
    ('national_base_rate', '100', 'number', 'Courier charge for the base weight in National zone (₹)'),
    ('national_additional_weight', '1000', 'number', 'Additional weight increment for National zone in grams'),
    ('national_additional_rate', '90', 'number', 'Courier charge for every additional weight increment in National zone (₹)')
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    setting_type = EXCLUDED.setting_type,
    description = EXCLUDED.description;
