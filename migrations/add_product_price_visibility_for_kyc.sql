ALTER TABLE products
    ADD COLUMN IF NOT EXISTS show_price_before_kyc BOOLEAN DEFAULT false;
