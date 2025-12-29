-- ============================================
-- Migration: Add E-commerce Tables
-- Description: Adds products, orders, order_items, and product_entitlements tables
-- Date: 2025-01-XX
-- ============================================

-- Ensure UUID extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ensure the update_updated_at_column function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =========================
-- Shop Products (Physical + Digital)
-- =========================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    category VARCHAR(255),
    product_type VARCHAR(20) NOT NULL CHECK (product_type IN ('physical', 'digital')),
    cover_image VARCHAR(500),

    -- Digital file metadata (file stored privately on disk; served via authenticated endpoint)
    digital_file_storage_path VARCHAR(1000),
    digital_file_name VARCHAR(500),
    digital_file_format VARCHAR(10) CHECK (digital_file_format IN ('zip', 'rar')),

    -- Physical stock
    stock_quantity INTEGER,

    -- Optional UI fields (no review system yet)
    rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    reviews_count INTEGER NOT NULL DEFAULT 0,

    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, created_at DESC);

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================
-- Orders + Digital Entitlements
-- =========================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','refunded','failed')),
    payment_provider VARCHAR(50),
    payment_reference VARCHAR(255),
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(10,2) NOT NULL DEFAULT 0.00,

    -- Shipping/contact fields (required only if there are physical items)
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(30),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    product_type VARCHAR(20) NOT NULL CHECK (product_type IN ('physical','digital')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- Entitlements: users can download digital products if they have an entitlement
CREATE TABLE IF NOT EXISTS product_entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    source VARCHAR(30) NOT NULL CHECK (source IN ('order','admin_grant')),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    granted_by UUID REFERENCES users(id),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_entitlements_user ON product_entitlements(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_entitlements_product ON product_entitlements(product_id);

-- ============================================
-- Migration Complete
-- ============================================
-- Tables created:
-- 1. products - Store physical and digital products
-- 2. orders - Store customer orders
-- 3. order_items - Store items in each order
-- 4. product_entitlements - Store digital product access for users
-- ============================================


