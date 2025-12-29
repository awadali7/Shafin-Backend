# Course Purchase Schema Documentation

## Overview

Courses can be accessed through two separate flows:

1. **Direct Purchase** (Current Implementation)
   - User purchases course directly via payment gateway
   - No request/approval needed
   - Tracked via `course_orders` table
   - Course access granted automatically after payment

2. **Request-Based Approval** (Optional/Legacy)
   - User requests course access
   - Admin approves/rejects request
   - Tracked via `course_requests` table
   - Used for free access or special cases

## Database Tables

### `course_orders` Table

Tracks which orders are for course purchases (separate from product orders).

```sql
CREATE TABLE course_orders (
    id UUID PRIMARY KEY,
    order_id UUID REFERENCES orders(id), -- Links to orders table
    course_id UUID REFERENCES courses(id),
    course_name VARCHAR(255),
    course_price DECIMAL(10,2),
    created_at TIMESTAMP,
    UNIQUE(order_id) -- One course per order
);
```

**Purpose:**
- Links orders to courses
- Used during payment verification to grant course access
- Separates course purchases from shop product purchases

### `course_access` Table

Stores granted course access (works for both purchase and request-based access).

```sql
CREATE TABLE course_access (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    course_id UUID REFERENCES courses(id),
    request_id UUID REFERENCES course_requests(id), -- NULL for purchased courses
    access_start TIMESTAMP,
    access_end TIMESTAMP,
    is_active BOOLEAN,
    granted_by UUID REFERENCES users(id), -- User (purchase) or admin (approval)
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**For Purchased Courses:**
- `request_id` = NULL
- `granted_by` = User who purchased (or NULL for system grants)
- `access_end` = 100 years in future (lifetime access)

**For Request-Based Access:**
- `request_id` = Reference to `course_requests.id`
- `granted_by` = Admin who approved
- `access_end` = Admin-defined expiry date

### `course_requests` Table

**NOTE:** This table is optional and only used if you want to keep request-based approval functionality for special cases (free access, admin grants, etc.).

For direct purchase flow, this table is NOT used. All course access comes through purchases tracked via `course_orders`.

## Purchase Flow

1. User clicks "Purchase Course" on course page
2. Frontend calls `POST /api/courses/:id/purchase`
3. Backend:
   - Creates order in `orders` table
   - Creates entry in `course_orders` table linking order to course
   - Returns `order_id`
4. Frontend processes payment via Razorpay
5. On payment success, backend:
   - Marks order as paid
   - Checks `course_orders` table
   - Creates/updates `course_access` record
   - Unlocks all videos via `video_progress` table

## Key Differences

| Aspect | Course Purchase | Shop Products |
|--------|----------------|---------------|
| Order Tracking | `course_orders` table | `order_items` table |
| Access Granting | `course_access` table | `product_entitlements` table |
| Payment Flow | Direct purchase | Cart → Checkout → Payment |
| Approval Needed | No | No |

## Migration

Run the migration to add `course_orders` table:

```bash
psql -d your_database -f migrations/add_course_orders_table.sql
```

Or add it to your main schema.sql file (already added).

