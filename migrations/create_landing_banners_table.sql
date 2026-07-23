CREATE TABLE IF NOT EXISTS landing_banners (
    id SERIAL PRIMARY KEY,
    image_url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
