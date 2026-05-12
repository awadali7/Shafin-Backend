-- Add weight capacity column to courier_boxes so the system can auto-select
-- the smallest fitting box based on total cart weight.
ALTER TABLE courier_boxes
    ADD COLUMN IF NOT EXISTS weight_grams INTEGER NOT NULL DEFAULT 0;
