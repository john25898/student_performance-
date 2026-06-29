ALTER TABLE courses
ADD COLUMN IF NOT EXISTS department VARCHAR(100);

-- Note: Sometimes Supabase caches the schema. This command forces it to refresh so Python sees the new column instantly.
NOTIFY pgrst, reload_schema;