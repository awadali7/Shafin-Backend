# E-Learning Platform Backend - Project Plan

## Project Overview
A Node.js/Express backend for an e-learning platform that provides access to YouTube unlisted videos. The platform includes user registration, course request/approval workflow, progressive video unlocking, and time-based access management.

## Technology Stack

### Core Technologies
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma (recommended) or Sequelize
- **Authentication**: JWT (jsonwebtoken)
- **Email Service**: Nodemailer (with SMTP service like SendGrid, Mailgun, or Gmail)
- **Validation**: Joi or express-validator
- **Environment Variables**: dotenv

### Additional Packages
- **bcryptjs**: Password hashing
- **cors**: Cross-origin resource sharing
- **helmet**: Security headers
- **express-rate-limit**: Rate limiting
- **morgan**: HTTP request logger
- **uuid**: Unique identifiers

## Core Features & Business Logic

### 1. User Management
- User registration (email, password, name)
- User login/authentication
- JWT token-based authentication
- Password reset functionality
- User profile management

### 2. Course Management
- Course CRUD operations (Admin only)
- Course listing (public)
- Course details with video information
- Course metadata (name, slug, price, cover image, etc.)

### 3. Video Management
- Video CRUD operations (Admin only)
- Video ordering within courses
- YouTube video URL storage
- Video metadata (title, description, PDFs, markdown content)
- First video is always free to view

### 4. Course Access Request System
- User can request access to a course
- Request status: `pending`, `approved`, `rejected`
- Admin can approve/reject requests
- Admin sets access start date/time and duration when approving
- Email notification sent to user upon approval

### 5. Progressive Video Unlocking
- First video (index 0) is always unlocked for all users
- Subsequent videos are locked by default
- User must watch a video AND click "Next" button to unlock the next video
- Video watch tracking (mark video as watched)
- Next button click tracking (unlock next video)

### 6. Access Control & Time Management
- Time-based access: User gets access for a specific period
- Check if access is still valid before allowing video playback
- Access expiration handling

### 7. Admin Panel
- Admin authentication
- Course request management (approve/reject)
- Course and video management
- User management
- Dashboard with statistics

## API Endpoints Structure

### Authentication Routes (`/api/auth`)
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### User Routes (`/api/users`)
- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/courses` - Get user's enrolled courses
- `GET /api/users/courses/:courseId/progress` - Get course progress

### Course Routes (`/api/courses`)
- `GET /api/courses` - Get all courses (public)
- `GET /api/courses/:slug` - Get course details by slug
- `POST /api/courses` - Create course (Admin only)
- `PUT /api/courses/:id` - Update course (Admin only)
- `DELETE /api/courses/:id` - Delete course (Admin only)

### Video Routes (`/api/videos`)
- `GET /api/courses/:courseId/videos` - Get all videos for a course
- `GET /api/courses/:courseId/videos/:videoId` - Get video details
- `POST /api/courses/:courseId/videos` - Create video (Admin only)
- `PUT /api/courses/:courseId/videos/:videoId` - Update video (Admin only)
- `DELETE /api/courses/:courseId/videos/:videoId` - Delete video (Admin only)

### Course Request Routes (`/api/course-requests`)
- `POST /api/course-requests` - Create course access request
- `GET /api/course-requests` - Get user's course requests
- `GET /api/course-requests/:id` - Get specific request details
- `PUT /api/course-requests/:id/approve` - Approve request (Admin only)
- `PUT /api/course-requests/:id/reject` - Reject request (Admin only)

### Video Progress Routes (`/api/progress`)
- `POST /api/progress/videos/:videoId/watch` - Mark video as watched
- `POST /api/progress/videos/:videoId/unlock-next` - Unlock next video (after watching current)
- `GET /api/progress/courses/:courseId` - Get progress for a course

### Admin Routes (`/api/admin`)
- `GET /api/admin/dashboard` - Admin dashboard stats
- `GET /api/admin/requests` - Get all course requests
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:id` - Update user (Admin only)

## Database Schema Design

See `DATABASE_SCHEMA.md` for detailed database design.

### Main Tables
1. **users** - User accounts
2. **courses** - Course information
3. **videos** - Video information (linked to courses)
4. **course_requests** - Course access requests
5. **course_access** - Approved course access with time periods
6. **video_progress** - User video watch progress and unlocking
7. **admin_users** - Admin accounts (or use role in users table)

## Business Logic Flow

### Course Request Flow
1. User registers/logs in
2. User browses courses (can see first video only)
3. User clicks "Request Access" for a course
4. Request is created with status `pending`
5. Admin reviews request in admin panel
6. Admin approves with:
   - Start date/time
   - Duration/end date
7. System creates `course_access` record
8. Email sent to user with access details
9. User can now access all videos (subject to progressive unlocking)

### Progressive Unlocking Flow
1. User has approved course access
2. First video (index 0) is always unlocked
3. User watches video → `video_progress` record created with `watched: true`
4. User clicks "Next" button → Next video unlocked in `video_progress`
5. User can only access unlocked videos
6. Previous videos remain accessible

### Access Validation Flow
1. User requests to watch a video
2. Check if user has approved `course_access` for the course
3. Check if access period is still valid (not expired)
4. Check if video is unlocked (first video OR previous video watched + next clicked)
5. Allow/deny access accordingly

## Security Considerations

1. **Authentication**
   - JWT tokens with expiration
   - Refresh token mechanism
   - Password hashing with bcrypt (salt rounds: 10-12)

2. **Authorization**
   - Role-based access control (User, Admin)
   - Middleware for protected routes
   - Admin-only route protection

3. **Input Validation**
   - Validate all user inputs
   - Sanitize data before database operations
   - Prevent SQL injection (use ORM)

4. **Rate Limiting**
   - Limit login attempts
   - Limit API requests per IP
   - Limit email sending

5. **Data Protection**
   - Never expose passwords in responses
   - Use HTTPS in production
   - Secure session management

## Email Service Integration

### Email Templates Needed
1. **Welcome Email** - After registration
2. **Course Access Approved** - When admin approves request
3. **Course Access Rejected** - When admin rejects request
4. **Password Reset** - Password reset link
5. **Access Expiring Soon** - Reminder before access expires

### Email Configuration
- Use environment variables for SMTP credentials
- Support for multiple email providers (SendGrid, Mailgun, AWS SES, Gmail)
- Email queue system for reliability (optional: Bull/BullMQ)

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js
│   │   ├── email.js
│   │   └── jwt.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── courseController.js
│   │   ├── videoController.js
│   │   ├── requestController.js
│   │   ├── progressController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── admin.js
│   │   ├── validate.js
│   │   └── errorHandler.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Course.js
│   │   ├── Video.js
│   │   ├── CourseRequest.js
│   │   ├── CourseAccess.js
│   │   └── VideoProgress.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── courses.js
│   │   ├── videos.js
│   │   ├── requests.js
│   │   ├── progress.js
│   │   └── admin.js
│   ├── services/
│   │   ├── emailService.js
│   │   ├── accessService.js
│   │   └── unlockService.js
│   ├── utils/
│   │   ├── validators.js
│   │   ├── helpers.js
│   │   └── constants.js
│   └── app.js
├── prisma/
│   └── schema.prisma (if using Prisma)
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js
```

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/elearning_db

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_REFRESH_EXPIRES_IN=30d

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# Admin
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=secure-password
```

## Development Phases

### Phase 1: Setup & Foundation
- [ ] Initialize Node.js project
- [ ] Setup Express server
- [ ] Configure PostgreSQL database
- [ ] Setup Prisma/ORM
- [ ] Create database schema
- [ ] Setup environment variables
- [ ] Basic error handling

### Phase 2: Authentication
- [ ] User registration
- [ ] User login
- [ ] JWT token generation
- [ ] Password hashing
- [ ] Auth middleware
- [ ] Password reset flow

### Phase 3: Course & Video Management
- [ ] Course CRUD operations
- [ ] Video CRUD operations
- [ ] Course listing API
- [ ] Course details API
- [ ] Admin authorization

### Phase 4: Course Request System
- [ ] Create course request
- [ ] Get user requests
- [ ] Admin request management
- [ ] Approve/reject logic
- [ ] Course access creation

### Phase 5: Email Integration
- [ ] Email service setup
- [ ] Email templates
- [ ] Send approval emails
- [ ] Send rejection emails
- [ ] Welcome emails

### Phase 6: Progressive Unlocking
- [ ] Video watch tracking
- [ ] Next button unlock logic
- [ ] Video access validation
- [ ] Progress tracking API

### Phase 7: Access Control
- [ ] Time-based access validation
- [ ] Access expiration checks
- [ ] Access status API

### Phase 8: Testing & Optimization
- [ ] Unit tests
- [ ] Integration tests
- [ ] API documentation
- [ ] Performance optimization
- [ ] Security audit

## Future Enhancements (E-commerce Phase)

- Payment gateway integration (Stripe, PayPal)
- Order management
- Invoice generation
- Subscription plans
- Coupon/discount codes
- Payment history
- Refund management

## Notes

- All dates/times should be stored in UTC
- Use transactions for critical operations
- Implement proper logging
- Add API rate limiting
- Consider caching for frequently accessed data
- Plan for scalability (database indexing, query optimization)

