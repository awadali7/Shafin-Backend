-- Create course_orders table to track course purchases
-- This is separate from product orders (order_items table)

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

-- Add comment
COMMENT ON TABLE course_orders IS 'Tracks which orders are for course purchases (separate from product orders)';

