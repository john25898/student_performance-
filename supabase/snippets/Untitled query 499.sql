-- 1. Upgrade the existing 'students' table safely
ALTER TABLE students
ADD COLUMN IF NOT EXISTS current_year INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS program VARCHAR(100) DEFAULT 'Bachelor of Computer Science';

-- 2. Upgrade the existing 'grades' table to act as our AI Fact Table
ALTER TABLE grades
ADD COLUMN IF NOT EXISTS attendance_percent DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS cat_score DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS exam_score DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS study_hours_per_week DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS is_passed BOOLEAN DEFAULT true;

-- 3. Add High-Speed Indexes for the Dashboard (so searches are instant)
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_course ON grades(course_id);