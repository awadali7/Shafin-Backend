# API Documentation - Swagger/OpenAPI

This project includes Swagger/OpenAPI 3.0 documentation for all API endpoints.

## Viewing the Documentation

### Option 1: Swagger UI (Recommended)

1. **Install Swagger UI** (if not already installed):
```bash
npm install swagger-ui-express --save-dev
```

2. **Add Swagger route to your app** (add to `src/app.js`):
```javascript
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./swagger.yaml');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
```

3. **Install YAML parser**:
```bash
npm install yamljs --save-dev
```

4. **View documentation**:
   - Open browser: `http://localhost:3000/api-docs`
   - Interactive API documentation with "Try it out" feature

### Option 2: Online Swagger Editor

1. Go to https://editor.swagger.io/
2. Copy the contents of `swagger.yaml`
3. Paste into the editor
4. View and test the API documentation

### Option 3: Postman/Insomnia

Import the `swagger.yaml` file into:
- **Postman**: File → Import → Upload File
- **Insomnia**: Create → Import/Export → Import Data → OpenAPI 3.0

## API Endpoints Overview

### Authentication (`/api/auth`)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Users (`/api/users`)
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/courses` - Get user's enrolled courses
- `GET /api/users/courses/:courseId/progress` - Get course progress

### Courses (`/api/courses`)
- `GET /api/courses` - Get all courses (public)
- `GET /api/courses/:slug` - Get course by slug
- `POST /api/courses` - Create course (Admin)
- `PUT /api/courses/:id` - Update course (Admin)
- `DELETE /api/courses/:id` - Delete course (Admin)

### Videos (`/api/courses/:courseId/videos`)
- `GET /api/courses/:courseId/videos` - Get course videos
- `GET /api/courses/:courseId/videos/:videoId` - Get video details
- `POST /api/courses/:courseId/videos` - Create video (Admin)
- `PUT /api/courses/:courseId/videos/:videoId` - Update video (Admin)
- `DELETE /api/courses/:courseId/videos/:videoId` - Delete video (Admin)

### Course Requests (`/api/course-requests`)
- `POST /api/course-requests` - Create course access request
- `GET /api/course-requests` - Get user's requests
- `GET /api/course-requests/:id` - Get request details
- `GET /api/course-requests/admin/all` - Get all requests (Admin)
- `PUT /api/course-requests/:id/approve` - Approve request (Admin)
- `PUT /api/course-requests/:id/reject` - Reject request (Admin)

### Progress (`/api/progress`)
- `POST /api/progress/videos/:videoId/watch` - Mark video as watched
- `POST /api/progress/videos/:videoId/unlock-next` - Unlock next video
- `GET /api/progress/courses/:courseId` - Get course progress

### Admin (`/api/admin`)
- `GET /api/admin/dashboard` - Get dashboard statistics
- `GET /api/admin/users` - Get all users
- `GET /api/admin/requests` - Get all requests

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Example Requests

### Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123",
    "first_name": "John",
    "last_name": "Doe"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123"
  }'
```

### Get Courses (Public)
```bash
curl http://localhost:3000/api/courses
```

### Create Course Request (Authenticated)
```bash
curl -X POST http://localhost:3000/api/course-requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "course_id": "course-uuid-here",
    "request_message": "I would like access to this course"
  }'
```

## Response Format

All API responses follow this format:

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message here"
}
```

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate entry)
- `500` - Internal Server Error


