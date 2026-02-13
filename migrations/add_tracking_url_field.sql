-- Add tracking URL field to orders table
-- This allows adding external courier tracking links

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS tracking_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN orders.tracking_url IS 'External courier tracking URL/link (optional)';

