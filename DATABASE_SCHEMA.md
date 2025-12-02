# Database Schema Design - PostgreSQL

## Overview
This document describes the complete database schema for the e-learning platform backend using PostgreSQL.

## Database: `elearning_db`

---

## Table: `users`

Stores user account information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique user identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL | User email address |
| password_hash | VARCHAR(255) | NOT NULL | Hashed password (bcrypt) |
| first_name | VARCHAR(100) | NOT NULL | User's first name |
| last_name | VARCHAR(100) | NOT NULL | User's last name |
| role | VARCHAR(20) | DEFAULT 'user', CHECK (role IN ('user', 'admin')) | User role |
| email_verified | BOOLEAN | DEFAULT false | Email verification status |
| is_active | BOOLEAN | DEFAULT true | Account active status |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Account creation time |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update time |

### Indexes
- `idx_users_email` on `email`
- `idx_users_role` on `role`

---

## Table: `courses`

Stores course information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique course identifier |
| name | VARCHAR(255) | NOT NULL | Course name |
| slug | VARCHAR(255) | UNIQUE, NOT NULL | URL-friendly course identifier |
| description | TEXT | | Course description |
| price | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Course price |
| cover_image | VARCHAR(500) | | URL to cover image |
| icon_name | VARCHAR(100) | | Icon identifier (for frontend) |
| is_active | BOOLEAN | DEFAULT true | Course active status |
| created_by | UUID | FOREIGN KEY → users.id | Admin who created the course |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Course creation time |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update time |

### Indexes
- `idx_courses_slug` on `slug`
- `idx_courses_is_active` on `is_active`

---

## Table: `videos`

Stores video information linked to courses.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique video identifier |
| course_id | UUID | FOREIGN KEY → courses.id, ON DELETE CASCADE | Parent course |
| title | VARCHAR(255) | NOT NULL | Video title |
| video_url | VARCHAR(500) | NOT NULL | YouTube embed URL |
| description | TEXT | | Video description |
| order_index | INTEGER | NOT NULL, DEFAULT 0 | Video order in course (0 = first video) |
| pdfs | JSONB | | Array of PDF objects: `[{name: string, url: string}]` |
| markdown | TEXT | | Markdown content for video |
| is_active | BOOLEAN | DEFAULT true | Video active status |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Video creation time |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update time |

### Indexes
- `idx_videos_course_id` on `course_id`
- `idx_videos_order_index` on `(course_id, order_index)`
- `idx_videos_is_active` on `is_active`

### Constraints
- `order_index` must be unique per course
- First video (order_index = 0) is always free

---

## Table: `course_requests`

Stores course access requests from users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique request identifier |
| user_id | UUID | FOREIGN KEY → users.id, ON DELETE CASCADE | User who made the request |
| course_id | UUID | FOREIGN KEY → courses.id, ON DELETE CASCADE | Requested course |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending', CHECK (status IN ('pending', 'approved', 'rejected')) | Request status |
| request_message | TEXT | | Optional message from user |
| admin_notes | TEXT | | Admin notes (for rejection/approval) |
| reviewed_by | UUID | FOREIGN KEY → users.id | Admin who reviewed the request |
| reviewed_at | TIMESTAMP | | When request was reviewed |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Request creation time |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update time |

### Indexes
- `idx_course_requests_user_id` on `user_id`
- `idx_course_requests_course_id` on `course_id`
- `idx_course_requests_status` on `status`
- `idx_course_requests_user_course` on `(user_id, course_id)` (for preventing duplicate requests)

### Constraints
- One pending request per user per course (can be enforced in application logic or unique constraint)

---

## Table: `course_access`

Stores approved course access with time periods.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique access identifier |
| user_id | UUID | FOREIGN KEY → users.id, ON DELETE CASCADE | User who has access |
| course_id | UUID | FOREIGN KEY → courses.id, ON DELETE CASCADE | Course with access |
| request_id | UUID | FOREIGN KEY → course_requests.id | Original request that granted access |
| access_start | TIMESTAMP | NOT NULL | When access starts |
| access_end | TIMESTAMP | NOT NULL | When access expires |
| is_active | BOOLEAN | DEFAULT true | Access active status |
| granted_by | UUID | FOREIGN KEY → users.id | Admin who granted access |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Access creation time |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update time |

### Indexes
- `idx_course_access_user_id` on `user_id`
- `idx_course_access_course_id` on `course_id`
- `idx_course_access_active` on `(user_id, course_id, is_active, access_end)`
- `idx_course_access_dates` on `(access_start, access_end)`

### Constraints
- `access_end` must be after `access_start`
- Check for overlapping access periods (can be handled in application logic)

---

## Table: `video_progress`

Tracks user video watch progress and unlocking status.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique progress identifier |
| user_id | UUID | FOREIGN KEY → users.id, ON DELETE CASCADE | User |
| video_id | UUID | FOREIGN KEY → videos.id, ON DELETE CASCADE | Video |
| course_id | UUID | FOREIGN KEY → courses.id, ON DELETE CASCADE | Course (denormalized for faster queries) |
| is_watched | BOOLEAN | DEFAULT false | Video has been watched |
| is_unlocked | BOOLEAN | DEFAULT false | Video is unlocked for user |
| watched_at | TIMESTAMP | | When video was watched |
| unlocked_at | TIMESTAMP | | When video was unlocked |
| watch_duration | INTEGER | | Total watch time in seconds (optional) |
| last_position | INTEGER | | Last watched position in seconds (optional) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Progress creation time |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update time |

### Indexes
- `idx_video_progress_user_video` on `(user_id, video_id)` (UNIQUE)
- `idx_video_progress_user_course` on `(user_id, course_id)`
- `idx_video_progress_unlocked` on `(user_id, course_id, is_unlocked)`

### Constraints
- Unique constraint on `(user_id, video_id)` to prevent duplicates
- First video (order_index = 0) should be auto-unlocked when course access is granted

---

## Table: `password_resets`

Stores password reset tokens.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique reset identifier |
| user_id | UUID | FOREIGN KEY → users.id, ON DELETE CASCADE | User requesting reset |
| token | VARCHAR(255) | UNIQUE, NOT NULL | Reset token |
| expires_at | TIMESTAMP | NOT NULL | Token expiration time |
| used | BOOLEAN | DEFAULT false | Token has been used |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Token creation time |

### Indexes
- `idx_password_resets_token` on `token`
- `idx_password_resets_user_id` on `user_id`

---

## Table: `email_logs` (Optional)

Logs all sent emails for debugging and tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique log identifier |
| user_id | UUID | FOREIGN KEY → users.id | Recipient user |
| email_type | VARCHAR(50) | NOT NULL | Type of email (welcome, approval, etc.) |
| recipient_email | VARCHAR(255) | NOT NULL | Email address |
| subject | VARCHAR(255) | NOT NULL | Email subject |
| status | VARCHAR(20) | DEFAULT 'sent', CHECK (status IN ('sent', 'failed', 'pending')) | Email status |
| error_message | TEXT | | Error message if failed |
| sent_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | When email was sent |

### Indexes
- `idx_email_logs_user_id` on `user_id`
- `idx_email_logs_status` on `status`

---

## SQL Schema Creation Script

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    email_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Create courses table
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX idx_courses_slug ON courses(slug);
CREATE INDEX idx_courses_is_active ON courses(is_active);

-- Create videos table
CREATE TABLE videos (
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

CREATE INDEX idx_videos_course_id ON videos(course_id);
CREATE INDEX idx_videos_order_index ON videos(course_id, order_index);
CREATE INDEX idx_videos_is_active ON videos(is_active);

-- Create course_requests table
CREATE TABLE course_requests (
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

CREATE INDEX idx_course_requests_user_id ON course_requests(user_id);
CREATE INDEX idx_course_requests_course_id ON course_requests(course_id);
CREATE INDEX idx_course_requests_status ON course_requests(status);
CREATE INDEX idx_course_requests_user_course ON course_requests(user_id, course_id);

-- Create course_access table
CREATE TABLE course_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    request_id UUID REFERENCES course_requests(id),
    access_start TIMESTAMP NOT NULL,
    access_end TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    granted_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (access_end > access_start)
);

CREATE INDEX idx_course_access_user_id ON course_access(user_id);
CREATE INDEX idx_course_access_course_id ON course_access(course_id);
CREATE INDEX idx_course_access_active ON course_access(user_id, course_id, is_active, access_end);
CREATE INDEX idx_course_access_dates ON course_access(access_start, access_end);

-- Create video_progress table
CREATE TABLE video_progress (
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

CREATE INDEX idx_video_progress_user_video ON video_progress(user_id, video_id);
CREATE INDEX idx_video_progress_user_course ON video_progress(user_id, course_id);
CREATE INDEX idx_video_progress_unlocked ON video_progress(user_id, course_id, is_unlocked);

-- Create password_resets table
CREATE TABLE password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_password_resets_token ON password_resets(token);
CREATE INDEX idx_password_resets_user_id ON password_resets(user_id);

-- Create email_logs table (optional)
CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    email_type VARCHAR(50) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
    error_message TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX idx_email_logs_status ON email_logs(status);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_course_requests_updated_at BEFORE UPDATE ON course_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_course_access_updated_at BEFORE UPDATE ON course_access
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_progress_updated_at BEFORE UPDATE ON video_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Key Relationships

1. **User → Course Requests**: One user can have many course requests
2. **Course → Videos**: One course has many videos (ordered by `order_index`)
3. **User → Course Access**: One user can have access to many courses
4. **User → Video Progress**: One user has progress for many videos
5. **Course Request → Course Access**: One approved request creates one access record

## Business Rules Enforced in Database

1. **First Video Always Free**: Application logic should auto-unlock first video (order_index = 0) when course access is granted
2. **Progressive Unlocking**: 
   - Video is unlocked only if previous video is watched AND next button clicked
   - Enforced in application logic, not database constraints
3. **Access Validation**: 
   - Check `course_access.is_active = true`
   - Check `CURRENT_TIMESTAMP BETWEEN access_start AND access_end`
4. **Unique Requests**: Prevent duplicate pending requests per user per course (application logic)

## Sample Queries

### Check if user has access to a course
```sql
SELECT * FROM course_access
WHERE user_id = $1
  AND course_id = $2
  AND is_active = true
  AND CURRENT_TIMESTAMP BETWEEN access_start AND access_end;
```

### Get unlocked videos for a user in a course
```sql
SELECT v.* FROM videos v
LEFT JOIN video_progress vp ON v.id = vp.video_id AND vp.user_id = $1
WHERE v.course_id = $2
  AND (v.order_index = 0 OR vp.is_unlocked = true)
ORDER BY v.order_index;
```

### Get course progress for a user
```sql
SELECT 
    COUNT(*) as total_videos,
    COUNT(CASE WHEN vp.is_watched THEN 1 END) as watched_videos,
    COUNT(CASE WHEN vp.is_unlocked THEN 1 END) as unlocked_videos
FROM videos v
LEFT JOIN video_progress vp ON v.id = vp.video_id AND vp.user_id = $1
WHERE v.course_id = $2;
```

---

## Notes

- All timestamps are stored in UTC
- Use UUID for all primary keys for better security and scalability
- JSONB is used for flexible PDF storage (PostgreSQL-specific)
- Indexes are optimized for common query patterns
- Foreign keys use CASCADE delete for data integrity
- Consider adding soft delete (deleted_at) columns if needed

