CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_number TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    year_of_study INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);