-- Migrate tiered_pricing JSONB courier charge fields from the old 3-zone names
-- (courier_charge_local / courier_charge_regional / courier_charge_national) to the
-- new 6-zone names (courier_charge_a / courier_charge_b / courier_charge_d).
--
-- Zone mapping:
--   local     → A  (same city / same pincode)
--   regional  → B  (same state)
--   national  → D  (rest of India — default fallback)
--   C (metro-to-metro), E (northeast), F (remote) are new; no old data to migrate.
--
-- The generic courier_charge column is preserved as-is and continues to serve as
-- the fallback when a zone-specific field is NULL.

UPDATE products
SET tiered_pricing = (
    SELECT jsonb_agg(
        -- Add new zone keys from old ones, then remove old keys
        (tier
            || jsonb_build_object('courier_charge_a', tier -> 'courier_charge_local')
            || jsonb_build_object('courier_charge_b', tier -> 'courier_charge_regional')
            || jsonb_build_object('courier_charge_d', tier -> 'courier_charge_national')
        )
        - 'courier_charge_local'
        - 'courier_charge_regional'
        - 'courier_charge_national'
    )
    FROM jsonb_array_elements(tiered_pricing) AS tier
)
WHERE
    tiered_pricing IS NOT NULL
    AND jsonb_array_length(tiered_pricing) > 0
    AND (
        tiered_pricing::text LIKE '%courier_charge_local%'
        OR tiered_pricing::text LIKE '%courier_charge_regional%'
        OR tiered_pricing::text LIKE '%courier_charge_national%'
    );

-- Add shipping_origin_pincode to site_settings if not already present
INSERT INTO site_settings (setting_key, setting_value, setting_type, description)
VALUES ('shipping_origin_pincode', '', 'text', 'Default origin pincode for products that do not have one set')
ON CONFLICT (setting_key) DO NOTHING;
