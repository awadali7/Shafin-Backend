# Backend User Type Updates

## Overview
Updated backend API endpoints to return `user_type` and other new user fields in authentication and profile responses.

## Changes Made

### Files Modified

#### 1. `src/controllers/authController.js`

**Register Endpoint** (`POST /api/auth/register`):
- Updated SELECT query to include `user_type` in RETURNING clause
- Added `user_type` to response user object

```javascript
// Before
RETURNING id, email, first_name, last_name, role, created_at

// After
RETURNING id, email, first_name, last_name, role, created_at, user_type
```

**Login Endpoint** (`POST /api/auth/login`):
- Updated SELECT query to include `user_type`
- Added `user_type` to response user object

```javascript
// Before
SELECT id, email, password_hash, first_name, last_name, role, is_active FROM users WHERE email = $1

// After
SELECT id, email, password_hash, first_name, last_name, role, is_active, user_type FROM users WHERE email = $1
```

#### 2. `src/controllers/userController.js`

**Get Profile Endpoint** (`GET /api/users/profile`):
- Updated SELECT query to include all new user fields
- Returns complete user profile with:
  - `user_type` - Student or Business Owner
  - `terms_accepted_at` - When user accepted terms
  - `last_login_at` - Last login timestamp
  - `last_login_ip` - Last login IP address
  - `last_login_device` - Device information (browser, OS, etc.)

```javascript
// Before
SELECT id, email, first_name, last_name, role, email_verified, created_at
FROM users WHERE id = $1

// After
SELECT id, email, first_name, last_name, role, email_verified, created_at, 
       user_type, terms_accepted_at, last_login_at, last_login_ip, last_login_device
FROM users WHERE id = $1
```

## API Response Changes

### Register/Login Response
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "user",
      "user_type": "student"  // ← NEW
    },
    "token": "jwt_token",
    "refreshToken": "refresh_token",
    "deviceInfo": {...}
  }
}
```

### Profile Response
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "role": "user",
    "email_verified": false,
    "created_at": "2026-01-01T00:00:00.000Z",
    "user_type": "student",                        // ← NEW
    "terms_accepted_at": "2026-01-02T00:00:00.000Z", // ← NEW
    "last_login_at": "2026-02-02T19:00:00.000Z",   // ← NEW
    "last_login_ip": "192.168.1.1",                // ← NEW
    "last_login_device": {                          // ← NEW
      "browser": "Chrome",
      "os": "Windows",
      "deviceType": "Desktop"
    }
  }
}
```

## Field Values

### user_type
- `null` - User hasn't chosen a type yet
- `"student"` - User is a student (for course purchases)
- `"business_owner"` - User is a business owner (for product purchases)

### terms_accepted_at
- `null` - User hasn't accepted terms
- Timestamp when user accepted terms and conditions

### last_login_device
JSONB object with:
- `browser` - Browser name (e.g., "Chrome", "Firefox")
- `os` - Operating system (e.g., "Windows", "MacOS", "Linux")
- `deviceType` - Device type (e.g., "Desktop", "Mobile", "Tablet")

## Impact

### Frontend Integration
The frontend `AuthContext` automatically receives these new fields and makes them available throughout the app via:
```typescript
const { user } = useAuth();
// user.user_type
// user.terms_accepted_at
// user.last_login_at
// user.last_login_ip
// user.last_login_device
```

### Backward Compatibility
- All new fields are nullable, so existing users won't break
- Old API clients will simply ignore the new fields
- No breaking changes to existing API contracts

## Use Cases

1. **Profile Page**: Display user type and login information
2. **KYC Forms**: Determine which KYC form to show based on user_type
3. **Sidebar Navigation**: Show appropriate KYC links based on user_type
4. **Security**: Track login history and device information
5. **Analytics**: Understand user segments (students vs business owners)

## Testing

After deploying, verify:
```bash
# Test registration (returns user_type as null initially)
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","first_name":"Test","last_name":"User"}'

# Test login (returns user_type)
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test profile (returns all user fields)
curl http://localhost:5001/api/users/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Database Schema

These fields already exist in the `users` table:
```sql
ALTER TABLE users ADD COLUMN user_type VARCHAR(20);
ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN last_login_ip VARCHAR(45);
ALTER TABLE users ADD COLUMN last_login_device JSONB;
```

## Next Steps

1. Deploy backend changes to server
2. Restart backend: `pm2 restart elearning-backend`
3. Test API endpoints
4. Deploy frontend (already prepared to use these fields)

---

**Status**: ✅ Complete
**Date**: February 2, 2026
**Backward Compatible**: Yes
**Breaking Changes**: None


