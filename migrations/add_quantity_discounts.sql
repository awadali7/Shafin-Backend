-- Add quantity pricing tiers to products table
-- Format: [{"quantity": 3, "price": 270}, {"quantity": 5, "price": 400}]
-- Admin sets exact price for specific quantities

ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_pricing JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_products_quantity_pricing ON products USING GIN (quantity_pricing);

-- Example data:
-- Buy exactly 3: Total ₹270 (₹90 per item)
-- Buy exactly 5: Total ₹400 (₹80 per item)
-- Buy exactly 10: Total ₹650 (₹65 per item)

COMMENT ON COLUMN products.quantity_pricing IS 'Array of quantity-price pairs: [{"quantity": 3, "price": 270}]';

-- Add discount column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- Add discount fields to order_items table
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS custom_price DECIMAL(10,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price_type VARCHAR(20) DEFAULT 'regular';

COMMENT ON COLUMN orders.discount IS 'Total discount amount applied to order';
COMMENT ON COLUMN order_items.custom_price IS 'Custom bulk price if quantity pricing applied';
COMMENT ON COLUMN order_items.price_type IS 'regular or bulk_pricing';


