-- Add tracking number and delivery fields to orders table
-- Run this migration to add order tracking and delivery time features

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE,
ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;

-- Create index for tracking number lookups
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON orders(tracking_number) WHERE tracking_number IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN orders.tracking_number IS 'Courier tracking number for physical shipments';
COMMENT ON COLUMN orders.estimated_delivery_date IS 'Expected delivery date for physical items';
COMMENT ON COLUMN orders.shipped_at IS 'Timestamp when order was shipped';
COMMENT ON COLUMN orders.delivered_at IS 'Timestamp when order was delivered';

