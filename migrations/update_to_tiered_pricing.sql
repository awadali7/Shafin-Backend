-- Update quantity_pricing to support tiered pricing
-- New format: [{"min_qty": 1, "max_qty": 1, "price_per_item": 100}, {"min_qty": 2, "max_qty": 5, "price_per_item": 90}, ...]

-- Add comment to explain new format
COMMENT ON COLUMN products.quantity_pricing IS 'Tiered pricing array: [{"min_qty": 1, "max_qty": 1, "price_per_item": 100}, {"min_qty": 2, "max_qty": 5, "price_per_item": 90}, {"min_qty": 6, "max_qty": 10, "price_per_item": 80}, {"min_qty": 11, "max_qty": null, "price_per_item": 70}]. null max_qty means unlimited.';

-- Note: No schema change needed, just data format change
-- The JSONB column already supports any structure

