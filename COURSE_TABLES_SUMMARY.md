# Course-Related Database Tables Summary

## All Course Tables in the Schema

### 1. `courses` Table
**Purpose:** Stores course information

```sql
CREATE TABLE courses (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    cover_image VARCHAR(500),
    icon_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `idx_courses_slug` on `slug`
- `idx_courses_is_active` on `is_active`

---

### 2. `videos` Table
**Purpose:** Stores video content for courses

```sql
CREATE TABLE videos (
    id UUID PRIMARY KEY,
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
```

**Indexes:**
- `idx_videos_course_id` on `course_id`
- `idx_videos_order_index` on `(course_id, order_index)`
- `idx_videos_is_active` on `is_active`

---

### 3. `course_requests` Table ⚠️ OPTIONAL/LEGACY
**Purpose:** For admin-granted course access requests (NOT used for direct purchase)

**NOTE:** This table is optional. Course purchases use direct payment flow and are tracked via `course_orders` table.

```sql
CREATE TABLE course_requests (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected')),
    request_message TEXT,
    admin_notes TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `idx_course_requests_user_id` on `user_id`
- `idx_course_requests_course_id` on `course_id`
- `idx_course_requests_status` on `status`
- `idx_course_requests_user_course` on `(user_id, course_id)`

---

### 4. `course_access` Table
**Purpose:** Stores granted course access (works for both purchase and request-based access)

```sql
CREATE TABLE course_access (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    request_id UUID REFERENCES course_requests(id), -- NULL for purchased courses
    access_start TIMESTAMP NOT NULL,
    access_end TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    granted_by UUID REFERENCES users(id), -- User (purchase) or admin (approval)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (access_end > access_start)
);
```

**Indexes:**
- `idx_course_access_user_id` on `user_id`
- `idx_course_access_course_id` on `course_id`
- `idx_course_access_active` on `(user_id, course_id, is_active, access_end)`
- `idx_course_access_dates` on `(access_start, access_end)`

**Usage:**
- **For Purchased Courses:** `request_id = NULL`, `granted_by` = purchasing user
- **For Request-Based:** `request_id` = reference to `course_requests.id`, `granted_by` = admin

---

### 5. `course_orders` Table ✅ NEW - REQUIRED FOR PURCHASES
**Purpose:** Tracks which orders are for course purchases (separate from shop/product orders)

**IMPORTANT:** This table must be created via migration for course purchase to work!

```sql
CREATE TABLE course_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    course_name VARCHAR(255) NOT NULL,
    course_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id)
);
```

**Indexes:**
- `idx_course_orders_order_id` on `order_id`
- `idx_course_orders_course_id` on `course_id`

**Migration File:** `backend/migrations/add_course_orders_table.sql`

---

### 6. `video_progress` Table
**Purpose:** Tracks user progress on videos (watched status, unlock status, etc.)

```sql
CREATE TABLE video_progress (
    id UUID PRIMARY KEY,
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
```

**Indexes:**
- `idx_video_progress_user_video` on `(user_id, video_id)`
- `idx_video_progress_user_course` on `(user_id, course_id)`
- `idx_video_progress_unlocked` on `(user_id, course_id, is_unlocked)`

---

## Table Relationships

```
courses
  ├── videos (course_id → courses.id)
  ├── course_requests (course_id → courses.id) [Optional]
  ├── course_access (course_id → courses.id)
  └── course_orders (course_id → courses.id) [NEW]

orders
  └── course_orders (order_id → orders.id) [NEW - Links orders to courses]

course_requests [Optional]
  └── course_access (request_id → course_requests.id)

users
  ├── course_requests (user_id → users.id) [Optional]
  ├── course_access (user_id → users.id)
  └── video_progress (user_id → users.id)

videos
  └── video_progress (video_id → videos.id)
```

## Purchase Flow Tables

**Direct Course Purchase:**
1. `courses` - Course info
2. `orders` - Payment order
3. `course_orders` - Links order to course ✅ **MUST EXIST**
4. `course_access` - Grants access after payment
5. `video_progress` - Unlocks all videos after payment

**Shop Products (Separate):**
1. `products` - Product info
2. `orders` - Payment order
3. `order_items` - Links order to products
4. `product_entitlements` - Grants access after payment

## Important Notes

⚠️ **Migration Required:** You must run the migration to create `course_orders` table:
```bash
psql -d your_database -f backend/migrations/add_course_orders_table.sql
```

Or it's already in `schema.sql` if creating a fresh database.

