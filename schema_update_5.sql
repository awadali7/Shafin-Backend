-- Add discount column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) NOT NULL DEFAULT 0.00;
