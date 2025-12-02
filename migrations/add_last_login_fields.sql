-- Migration: Add last login tracking fields to users table
-- Run this migration to add last_login_at, last_login_ip, and last_login_device columns

-- Add last login columns if they don't exist
DO $$ 
BEGIN
    -- Add last_login_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_login_at'
    ) THEN
        ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
    END IF;

    -- Add last_login_ip column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_login_ip'
    ) THEN
        ALTER TABLE users ADD COLUMN last_login_ip VARCHAR(45);
    END IF;

    -- Add last_login_device column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_login_device'
    ) THEN
        ALTER TABLE users ADD COLUMN last_login_device JSONB;
    END IF;
END $$;

-- Remove the trigger for user_sessions if it exists (it causes errors)
DROP TRIGGER IF EXISTS update_user_sessions_updated_at ON user_sessions;

