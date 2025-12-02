# Admin User Setup Guide

There are multiple ways to create an admin user for the e-learning platform:

## Method 1: Interactive Script (Recommended) ✨

Use the interactive script to create or update an admin user:

```bash
npm run create-admin
```

This will prompt you for:
- Email address
- Password (minimum 6 characters)
- First Name (optional, defaults to "Admin")
- Last Name (optional, defaults to "User")

**Features:**
- Creates a new admin user if the email doesn't exist
- Updates password if user already exists
- Promotes existing user to admin if they're not already an admin

## Method 2: Environment Variables + Migration

Set admin credentials in your `.env` file:

```env
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your-secure-password
```

Then run the migration script:

```bash
npm run db:migrate
```

This will automatically create the admin user during database migration.

## Method 3: Direct Database SQL

Connect to your PostgreSQL database and run:

```sql
-- Make sure to hash your password first using bcrypt (12 rounds)
-- You can use: node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password', 12).then(h => console.log(h))"

INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
VALUES (
    'admin@yourdomain.com',
    '$2a$12$YOUR_HASHED_PASSWORD_HERE',
    'Admin',
    'User',
    'admin',
    true
);
```

Or update an existing user to admin:

```sql
UPDATE users 
SET role = 'admin' 
WHERE email = 'user@example.com';
```

## Method 4: Via Admin API (if already have an admin)

If you already have an admin user, you can update any user's role via the Admin API:

```bash
curl -X PUT http://localhost:5001/api/admin/users/{userId} \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "admin"
  }'
```

## Quick Start

The easiest way is Method 1:

```bash
cd backend
npm run create-admin
```

Follow the prompts and you're done! 🎉

## Troubleshooting

- **"Cannot connect to database"**: Make sure your `.env` file has the correct `DATABASE_URL`
- **"User already exists"**: The script will offer to update the password or promote the user to admin
- **"Password too short"**: Use a password with at least 6 characters

