CREATE TABLE IF NOT EXISTS product_extra_infos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    body TEXT,
    zip_file_path VARCHAR(1000),
    image_files JSONB DEFAULT '[]'::jsonb,
    pdf_files JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE product_extra_infos
    ADD COLUMN IF NOT EXISTS image_files JSONB DEFAULT '[]'::jsonb;

ALTER TABLE product_extra_infos
    ADD COLUMN IF NOT EXISTS pdf_files JSONB DEFAULT '[]'::jsonb;

ALTER TABLE product_extra_infos
    ADD COLUMN IF NOT EXISTS slug VARCHAR(255);

UPDATE product_extra_infos
SET slug = CONCAT('extra-info-', SUBSTRING(id::text, 1, 8))
WHERE slug IS NULL OR slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_extra_infos_slug ON product_extra_infos(slug);

ALTER TABLE product_extra_infos
    ALTER COLUMN slug SET NOT NULL;

ALTER TABLE product_extra_infos
    ALTER COLUMN zip_file_path DROP NOT NULL;

CREATE TABLE IF NOT EXISTS product_extra_info_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_extra_info_id UUID NOT NULL REFERENCES product_extra_infos(id) ON DELETE CASCADE,
    source VARCHAR(30) NOT NULL CHECK (source IN ('admin_grant', 'order')),
    granted_by UUID REFERENCES users(id),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_extra_info_id)
);

CREATE INDEX IF NOT EXISTS idx_product_extra_info_access_user ON product_extra_info_access(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_extra_info_access_info ON product_extra_info_access(product_extra_info_id);

DROP TRIGGER IF EXISTS update_product_extra_info_access_updated_at ON product_extra_info_access;
CREATE TRIGGER update_product_extra_info_access_updated_at BEFORE UPDATE ON product_extra_info_access
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS product_extra_info_id UUID;

CREATE INDEX IF NOT EXISTS idx_products_extra_info ON products(product_extra_info_id);

ALTER TABLE products
    DROP CONSTRAINT IF EXISTS fk_products_product_extra_info;

ALTER TABLE products
    ADD CONSTRAINT fk_products_product_extra_info
    FOREIGN KEY (product_extra_info_id)
    REFERENCES product_extra_infos(id)
    ON DELETE SET NULL;

DROP TRIGGER IF EXISTS update_product_extra_infos_updated_at ON product_extra_infos;
CREATE TRIGGER update_product_extra_infos_updated_at BEFORE UPDATE ON product_extra_infos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
