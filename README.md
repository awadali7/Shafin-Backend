# E-Learning Platform Backend

Node.js/Express backend for an e-learning platform that provides access to YouTube unlisted videos with course request/approval workflow and progressive video unlocking.

## 📚 Documentation

- **[PROJECT_PLAN.md](./PROJECT_PLAN.md)** - Complete project planning document with features, API endpoints, and development phases
- **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)** - Detailed PostgreSQL database schema with SQL scripts

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

### Installation

1. **Clone and navigate to backend directory**
```bash
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Setup database**
```bash
# Create PostgreSQL database
createdb elearning_db

# Run database migrations/schema
psql elearning_db < schema.sql
# OR use Prisma migrations
npx prisma migrate dev
```

5. **Start development server**
```bash
npm run dev
```

## 📋 Core Features

- ✅ User registration and authentication (JWT)
- ✅ Course and video management
- ✅ Course access request system
- ✅ Admin approval workflow with time-based access
- ✅ Progressive video unlocking (watch + next button)
- ✅ Email notifications
- ✅ Video progress tracking

## 🏗️ Project Structure

```
backend/
├── src/
│   ├── config/          # Database, email, JWT configuration
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Auth, validation, error handling
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   ├── services/         # Business logic services
│   ├── utils/            # Helper functions
│   └── app.js            # Express app setup
├── prisma/               # Prisma schema (if using Prisma)
├── .env                  # Environment variables
└── server.js             # Entry point
```

## 🔑 Key Business Logic

### Course Request Flow
1. User requests course access
2. Admin reviews and approves with start date/time and duration
3. System creates course access record
4. Email sent to user
5. User can access course videos

### Progressive Unlocking
- First video (index 0) is always free
- User must watch video AND click "Next" to unlock next video
- Previous videos remain accessible

### Access Validation
- Check if user has approved course access
- Verify access period is valid (not expired)
- Verify video is unlocked (first video OR previous watched + next clicked)

## 📡 API Endpoints Overview

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Courses
- `GET /api/courses` - Get all courses
- `GET /api/courses/:slug` - Get course details
- `POST /api/courses` - Create course (Admin)

### Videos
- `GET /api/courses/:courseId/videos` - Get course videos
- `GET /api/courses/:courseId/videos/:videoId` - Get video details

### Course Requests
- `POST /api/course-requests` - Request course access
- `GET /api/course-requests` - Get user's requests
- `PUT /api/course-requests/:id/approve` - Approve request (Admin)
- `PUT /api/course-requests/:id/reject` - Reject request (Admin)

### Progress
- `POST /api/progress/videos/:videoId/watch` - Mark video as watched
- `POST /api/progress/videos/:videoId/unlock-next` - Unlock next video
- `GET /api/progress/courses/:courseId` - Get course progress

See [PROJECT_PLAN.md](./PROJECT_PLAN.md) for complete API documentation.

## 🗄️ Database

PostgreSQL database with the following main tables:
- `users` - User accounts
- `courses` - Course information
- `videos` - Video information
- `course_requests` - Access requests
- `course_access` - Approved access with time periods
- `video_progress` - Watch progress and unlocking

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema.

## 🔐 Security

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control (User/Admin)
- Input validation and sanitization
- Rate limiting
- CORS configuration

## 📧 Email Service

Configure email service in `.env`:
- SMTP host, port, user, password
- Support for SendGrid, Mailgun, AWS SES, Gmail

Email templates:
- Welcome email
- Course access approved
- Course access rejected
- Password reset

## 🧪 Development

```bash
# Development mode with hot reload
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start
```

## 📝 Environment Variables

Required environment variables (see `.env.example`):
- `PORT` - Server port
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` - Email configuration
- `FRONTEND_URL` - Frontend URL for CORS

## 🚧 Development Phases

1. ✅ Setup & Foundation
2. ✅ Authentication
3. ✅ Course & Video Management
4. ✅ Course Request System
5. ✅ Email Integration
6. ✅ Progressive Unlocking
7. ✅ Access Control
8. ✅ Testing & Optimization

## 🔮 Future Enhancements

- Payment gateway integration (Stripe, PayPal)
- Subscription plans
- Coupon/discount codes
- Advanced analytics
- Video completion certificates

## 📖 Additional Resources

- [Express.js Documentation](https://expressjs.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

## 🤝 Contributing

1. Follow the project structure
2. Write clear commit messages
3. Add tests for new features
4. Update documentation

## 📄 License

[Your License Here]

---

**Note**: This is a planning document. Implementation should follow the phases outlined in [PROJECT_PLAN.md](./PROJECT_PLAN.md).

