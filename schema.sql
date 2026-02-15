-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    email_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    profile_picture VARCHAR(500), -- Optional profile picture URL/path
    user_type VARCHAR(20) CHECK (user_type IN ('student', 'business_owner')),
    terms_accepted_at TIMESTAMP, -- Required for course purchase
    product_terms_accepted_at TIMESTAMP, -- Required for product purchase
    last_login_at TIMESTAMP,
    last_login_ip VARCHAR(45),
    last_login_device JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_terms_accepted ON users(terms_accepted_at);

-- Create courses table
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    cover_image VARCHAR(500),
    icon_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);
CREATE INDEX IF NOT EXISTS idx_courses_is_active ON courses(is_active);

-- Create videos table
CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    video_url VARCHAR(500) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    pdfs JSONB,
    markdown TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_videos_course_id ON videos(course_id);
CREATE INDEX IF NOT EXISTS idx_videos_order_index ON videos(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_videos_is_active ON videos(is_active);

-- Create course_requests table
-- NOTE: This table is for admin-granted course access requests (optional feature)
-- Course purchases use direct payment flow and do NOT use this table
-- Purchased courses are tracked via course_orders table
CREATE TABLE IF NOT EXISTS course_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    request_message TEXT,
    admin_notes TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_course_requests_user_id ON course_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_course_requests_course_id ON course_requests(course_id);
CREATE INDEX IF NOT EXISTS idx_course_requests_status ON course_requests(status);
CREATE INDEX IF NOT EXISTS idx_course_requests_user_course ON course_requests(user_id, course_id);

-- Create course_access table
-- Stores course access granted via:
-- 1. Direct purchase (request_id = NULL, granted_by = user who purchased)
-- 2. Admin-approved request (request_id = course_requests.id, granted_by = admin)
CREATE TABLE IF NOT EXISTS course_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    request_id UUID REFERENCES course_requests(id), -- NULL for purchased courses
    access_start TIMESTAMP NOT NULL,
    access_end TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    granted_by UUID REFERENCES users(id), -- User who purchased or admin who approved
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (access_end > access_start)
);

CREATE INDEX IF NOT EXISTS idx_course_access_user_id ON course_access(user_id);
CREATE INDEX IF NOT EXISTS idx_course_access_course_id ON course_access(course_id);
CREATE INDEX IF NOT EXISTS idx_course_access_active ON course_access(user_id, course_id, is_active, access_end);
CREATE INDEX IF NOT EXISTS idx_course_access_dates ON course_access(access_start, access_end);

-- Create video_progress table
CREATE TABLE IF NOT EXISTS video_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    is_watched BOOLEAN DEFAULT false,
    is_unlocked BOOLEAN DEFAULT false,
    watched_at TIMESTAMP,
    unlocked_at TIMESTAMP,
    watch_duration INTEGER,
    last_position INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_video_progress_user_video ON video_progress(user_id, video_id);
CREATE INDEX IF NOT EXISTS idx_video_progress_user_course ON video_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_video_progress_unlocked ON video_progress(user_id, course_id, is_unlocked);

-- Create password_resets table
CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);

-- Create email_logs table (optional)
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    email_type VARCHAR(50) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
    error_message TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);

-- Create user_sessions table for device tracking
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_info JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_course_requests_updated_at ON course_requests;
CREATE TRIGGER update_course_requests_updated_at BEFORE UPDATE ON course_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_course_access_updated_at ON course_access;
CREATE TRIGGER update_course_access_updated_at BEFORE UPDATE ON course_access
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_video_progress_updated_at ON video_progress;
CREATE TRIGGER update_video_progress_updated_at BEFORE UPDATE ON video_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Note: user_sessions doesn't have updated_at column, using last_activity instead

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('course_access_granted', 'multiple_device_login', 'announcement', 'course_request_approved', 'course_request_rejected', 'system_update', 'kyc_verified', 'kyc_rejected')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Create push_subscriptions table for browser push notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    user_agent TEXT,
    device_info JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(user_id, is_active);

-- Create announcements table (for admin announcements)
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error')),
    target_audience VARCHAR(50) DEFAULT 'all' CHECK (target_audience IN ('all', 'users', 'admins')),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_target ON announcements(target_audience, is_active);

-- Create blog_posts table
CREATE TABLE IF NOT EXISTS blog_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    cover_image VARCHAR(500),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_published BOOLEAN DEFAULT false,
    published_at TIMESTAMP,
    views INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_author_id ON blog_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_created_at ON blog_posts(created_at DESC);

-- Create trigger for blog_posts updated_at
DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON blog_posts;
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================
-- Shop Products (Physical + Digital)
-- =========================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    english_description TEXT,
    malayalam_description TEXT,
    hindi_description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    category VARCHAR(255),
    product_type VARCHAR(20) NOT NULL CHECK (product_type IN ('physical', 'digital')),
    cover_image VARCHAR(500),
    images JSONB DEFAULT '[]'::jsonb,
    videos JSONB DEFAULT '[]'::jsonb,

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
    is_featured BOOLEAN DEFAULT false,
    is_coming_soon BOOLEAN DEFAULT false,
    is_contact_only BOOLEAN DEFAULT false,
    requires_kyc BOOLEAN DEFAULT false,
    categories JSONB DEFAULT '[]'::jsonb,
    tiered_pricing JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_images ON products USING GIN (images);
CREATE INDEX IF NOT EXISTS idx_products_videos ON products USING GIN (videos);

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================
-- Orders + Digital Entitlements
-- =========================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','refunded')),
    payment_provider VARCHAR(50),
    payment_reference VARCHAR(255),
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
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

    -- Tracking and delivery information
    tracking_number VARCHAR(255),
    tracking_url TEXT,
    estimated_delivery_date TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,

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
    custom_price DECIMAL(10,2),
    price_type VARCHAR(20) DEFAULT 'regular',
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

-- Create course_orders table to track course purchases
-- This is separate from product orders (order_items table)
-- Course purchases use direct payment flow, not request-based approval
CREATE TABLE IF NOT EXISTS course_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    course_name VARCHAR(255) NOT NULL,
    course_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_course_orders_order_id ON course_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_course_orders_course_id ON course_orders(course_id);

-- Create kyc_verifications table
CREATE TABLE IF NOT EXISTS kyc_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    whatsapp_number VARCHAR(20) NOT NULL,
    id_proof_url VARCHAR(500) NOT NULL,
    id_proof_2_url VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    rejection_reason TEXT,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    id_proof_urls JSONB,
    business_id VARCHAR(100),
    business_location_link TEXT,
    business_proof_url VARCHAR(500),
    upgraded_to_business BOOLEAN DEFAULT false,
    business_upgraded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user_id ON kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc_verifications(status);

-- Create trigger for kyc_verifications updated_at
DROP TRIGGER IF EXISTS update_kyc_verifications_updated_at ON kyc_verifications;
CREATE TRIGGER update_kyc_verifications_updated_at BEFORE UPDATE ON kyc_verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create product_kyc_verifications table
CREATE TABLE IF NOT EXISTS product_kyc_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    whatsapp_number VARCHAR(20) NOT NULL,
    id_proofs JSONB DEFAULT '[]'::jsonb,
    business_proofs JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    rejection_reason TEXT,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create trigger for product_kyc_verifications updated_at
DROP TRIGGER IF EXISTS update_product_kyc_verifications_updated_at ON product_kyc_verifications;
CREATE TRIGGER update_product_kyc_verifications_updated_at BEFORE UPDATE ON product_kyc_verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create site_settings table
CREATE TABLE IF NOT EXISTS site_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'text',
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


