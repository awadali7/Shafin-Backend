-- Add order_number column to orders table as SERIAL
-- This will automatically assign sequential numbers to existing orders based on their creation date (mostly).
-- Note: PostgreSQL SERIAL creates a sequence and sets the default to nextval().

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number SERIAL;

-- Update existing orders to have a consistent sequence if needed, 
-- though SERIAL usually handles it upon addition if the table has data.
-- To ensure they follow created_at order for existing records:
/*
WITH sequenced_orders AS (
    SELECT id, row_number() OVER (ORDER BY created_at ASC) as new_number
    FROM orders
)
UPDATE orders
SET order_number = sequenced_orders.new_number
FROM sequenced_orders
WHERE orders.id = sequenced_orders.id;
*/
