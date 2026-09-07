-- Adds per-user, time-bound access grants for files in the Digital Files
-- library (backend/private_uploads/digital). These files live only on disk
-- (no product/course row), so access is keyed by filename directly.
-- Mirrors course_access (date range, soft revoke) crossed with
-- product_extra_info_access (UNIQUE + ON CONFLICT upsert).

CREATE TABLE IF NOT EXISTS digital_file_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    access_start TIMESTAMP NOT NULL,
    access_end TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    source VARCHAR(30) NOT NULL DEFAULT 'admin_grant' CHECK (source IN ('admin_grant')),
    granted_by UUID REFERENCES users(id),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (access_end > access_start),
    UNIQUE(user_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_digital_file_access_user ON digital_file_access(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_digital_file_access_filename ON digital_file_access(filename);
CREATE INDEX IF NOT EXISTS idx_digital_file_access_active ON digital_file_access(user_id, filename, is_active, access_end);

DROP TRIGGER IF EXISTS update_digital_file_access_updated_at ON digital_file_access;
CREATE TRIGGER update_digital_file_access_updated_at BEFORE UPDATE ON digital_file_access
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
