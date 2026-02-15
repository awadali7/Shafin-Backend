-- Add tracking and delivery columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_date TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
