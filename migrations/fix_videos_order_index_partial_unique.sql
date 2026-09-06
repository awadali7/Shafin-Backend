-- videos_course_id_order_index_key was a plain UNIQUE(course_id, order_index)
-- constraint, so it also applied to soft-deleted rows (is_active = false).
-- Deleting a video therefore never freed its order_index: creating a new video,
-- or moving an existing one, into that now-"empty-looking" slot falsely failed
-- with "Video with this order index already exists for this course", even
-- though the admin UI (which only lists is_active = true videos) showed the
-- slot as free.
--
-- Replace it with a partial unique index that only enforces uniqueness among
-- active videos, matching what the admin UI and API actually treat as occupied.

ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_course_id_order_index_key;

CREATE UNIQUE INDEX IF NOT EXISTS videos_course_id_order_index_active_key
    ON videos (course_id, order_index)
    WHERE is_active = true;
