# Course Purchase Backend Implementation

## Overview
This document explains the backend implementation for course purchase functionality. Courses are purchased separately from shop products, using the same Razorpay payment gateway.

## Database Migration Required

You need to run the migration to create the `course_orders` table:

```sql
-- Run this migration
\i migrations/add_course_orders_table.sql
```

Or manually execute:

```sql
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
```

## API Endpoints

### POST `/api/courses/:id/purchase`
Creates an order for course purchase.

**Authentication:** Required

**Request:**
- URL param: `id` (course ID)

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "uuid"
  }
}
```

**Flow:**
1. Validates course exists and is active
2. Checks if user already has access
3. Creates order in `orders` table
4. Creates entry in `course_orders` table linking order to course
5. Returns `order_id` for payment processing

## Payment Flow

1. **Frontend calls** `/api/courses/:id/purchase` → Gets `order_id`
2. **Frontend calls** `/api/payments/razorpay/order` with `order_id` → Gets Razorpay order
3. **User pays via Razorpay**
4. **Frontend calls** `/api/payments/razorpay/verify` → Payment verified
5. **Backend automatically:**
   - Marks order as paid
   - Checks `course_orders` table to see if it's a course order
   - Grants course access (creates/updates `course_access` record)
   - Unlocks all videos (creates `video_progress` records)

## Course Access Granting

When payment is verified, the system:

1. Checks if order is in `course_orders` table
2. If yes, grants course access:
   - Creates/updates `course_access` record with:
     - `access_start`: Current timestamp
     - `access_end`: 100 years in future (lifetime access)
     - `is_active`: true
   - Unlocks all videos in the course by creating `video_progress` records

## Separation from Shop/Products

- **Shop orders**: Stored in `order_items` table (references `products`)
- **Course orders**: Stored in `course_orders` table (references `courses`)
- Both use the same `orders` table for payment tracking
- Payment verification automatically detects order type and grants appropriate access

## Files Modified

1. **backend/src/controllers/courseController.js**
   - Added `purchaseCourse()` function

2. **backend/src/routes/courses.js**
   - Added route: `POST /:id/purchase`

3. **backend/src/controllers/paymentController.js**
   - Updated `verifyRazorpayPayment()` to handle course orders
   - Updated `razorpayWebhook()` to handle course orders

4. **backend/migrations/add_course_orders_table.sql**
   - Migration file for `course_orders` table

## Testing

1. Run the migration to create `course_orders` table
2. Test course purchase flow:
   - Call `POST /api/courses/:id/purchase`
   - Complete payment via Razorpay
   - Verify course access is granted
   - Verify all videos are unlocked

