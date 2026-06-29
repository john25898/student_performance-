ALTER TABLE courses
ADD COLUMN IF NOT EXISTS department VARCHAR(100);

-- The payload must be in single quotes
NOTIFY pgrst, 'reload schema';