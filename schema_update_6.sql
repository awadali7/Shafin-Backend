-- Add custom_price and price_type columns to order_items table
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS custom_price DECIMAL(10,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price_type VARCHAR(20) DEFAULT 'regular';
