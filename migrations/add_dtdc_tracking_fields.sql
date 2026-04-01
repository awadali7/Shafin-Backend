-- Migration: Add DTDC-style tracking fields to orders table
ALTER TABLE orders 
ADD COLUMN origin_city VARCHAR(100),
ADD COLUMN destination_city VARCHAR(100),
ADD COLUMN courier_service_type VARCHAR(100), -- e.g., 'Express', 'Lite'
ADD COLUMN tracking_history JSONB DEFAULT '[]'::JSONB;

-- Comment on progress history structure:
-- Each Entry in tracking_history: 
-- {
--   "status": "In Transit",
--   "location": "Ahmadabad Hub",
--   "timestamp": "2026-02-12T10:30:00Z",
--   "description": "Shipment arrived at hub"
-- }
