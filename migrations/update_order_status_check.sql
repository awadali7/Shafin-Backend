-- Migration to update order status constraint to include all valid statuses

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check
CHECK (status IN ('pending', 'paid', 'shipped', 'dispatched', 'delivered', 'cancelled', 'refunded'));

-- Add comment
COMMENT ON COLUMN orders.status IS 'Order status: pending, paid, shipped, dispatched, delivered, cancelled, refunded';
