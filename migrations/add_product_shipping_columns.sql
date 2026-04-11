-- Add missing product shipping/dimension columns required by productController.js
-- Safe to run multiple times on production

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS length DECIMAL(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS width DECIMAL(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS height DECIMAL(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS volumetric_weight DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS extra_shipping_charge DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS shipping_zones_config JSONB,
    ADD COLUMN IF NOT EXISTS weight_slabs_config JSONB,
    ADD COLUMN IF NOT EXISTS origin_city VARCHAR(255),
    ADD COLUMN IF NOT EXISTS origin_state VARCHAR(255),
    ADD COLUMN IF NOT EXISTS origin_pincode VARCHAR(20);
