-- 1. Create the Courses table
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_code TEXT UNIQUE NOT NULL,
    course_name TEXT NOT NULL,
    credits INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create the Grades table (The Link Table)
CREATE TABLE grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    score NUMERIC(5, 2) NOT NULL, -- Allows decimals like 85.50
    grade TEXT NOT NULL,
    semester TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevents duplicate grades for the same student/course combo in a single semester
    UNIQUE(student_id, course_id, semester) 
);