import os
import random
from supabase import create_client, Client

# Your local Supabase credentials
url: str = os.getenv("SUPABASE_URL", "http://127.0.0.1:54321")
key: str = os.getenv("SUPABASE_ANON_KEY", "")
supabase: Client = create_client(url, key)


def seed_database():
    print("🚀 Initializing SCI Departmental Database Injection...")

    # 1. THE SCI ARCHITECTURE MAPPING
    sci_structure = {
        "Department of Computer Science": [
            ("B.Sc. in Computer Science", "CS201"),
            ("B.Sc. in Computer Technology", "CT201"),
            ("B.Sc. in Computer Security and Forensics", "CSF201"),
            ("B.Sc. in Data Science", "DS201")
        ],
        "Department of Information Technology": [
            ("B.Sc. in Information Technology", "IT201"),
            ("Bachelor of Business Information Technology", "BBIT201")
        ],
        "Department of Information and Media Studies": [
            ("B.Sc. in Information Science", "IS201"),
            ("Bachelor of Communication and Journalism", "CJ201")
        ]
    }

    # 2. CREATE COURSES (Mapped to SCI)
    courses_data = [
        {"course_code": "CCS-3201", "course_name": "Data Mining and Warehousing",
         "department": "Department of Computer Science", "credits": 3},
        {"course_code": "CIT-3202", "course_name": "Network Administration",
         "department": "Department of Information Technology", "credits": 3},
        {"course_code": "CIM-3205", "course_name": "Digital Media Dynamics",
         "department": "Department of Information and Media Studies", "credits": 3}
    ]

    course_ids = []
    for c in courses_data:
        res = supabase.table("courses").upsert(c, on_conflict="course_code").execute()
        course_ids.append(res.data[0]['id'])
    print(f"✅ Loaded {len(course_ids)} SCI Course Units.")

    # 3. GENERATE STUDENTS (With Authentic MUST Reg Nos)
    student_ids = []
    print("👨‍🎓 Generating 30 authentic student profiles...")

    for i in range(1, 31):
        # Randomly select a department and program
        department_name = random.choice(list(sci_structure.keys()))
        program_data = random.choice(sci_structure[department_name])
        program_name = program_data[0]
        prefix = program_data[1]

        # Generate the CT201/111932/23 format
        unique_id = random.randint(110000, 199999)
        reg_no = f"{prefix}/{unique_id}/23"

        student = {
            "student_number": reg_no,
            "first_name": f"Student_{i}",
            "last_name": "MUST",
            "year_of_study": 3,
            "program": program_name,
            "department": department_name
        }
        res = supabase.table("students").upsert(student, on_conflict="student_number").execute()
        student_ids.append(res.data[0]['id'])

    # 4. CREATE ACADEMIC RECORDS (The Intelligence Feeder)
    print("📊 Injecting AI-ready academic metrics...")
    records_added = 0
    for student_id in student_ids:
        for course_id in course_ids:
            attendance = round(random.uniform(40.0, 100.0), 1)

            # Simulated Correlation Logic
            if attendance < 65.0:
                cat_score = round(random.uniform(10.0, 19.0), 1)  # Out of 30
                study_hours = round(random.uniform(1.0, 3.5), 1)
                is_passed = False
            else:
                cat_score = round(random.uniform(20.0, 29.0), 1)  # Out of 30
                study_hours = round(random.uniform(4.0, 12.0), 1)
                is_passed = True

            exam_score = round(cat_score * 2.2, 1)  # Out of 70
            total_score = cat_score + exam_score

            grade_record = {
                "student_id": student_id,
                "course_id": course_id,
                "semester": "Y3S2",
                "score": total_score,
                "grade": "A" if total_score >= 70 else "B" if total_score >= 60 else "C" if total_score >= 50 else "F",
                "attendance_percent": attendance,
                "cat_score": cat_score,
                "exam_score": exam_score,
                "study_hours_per_week": study_hours,
                "is_passed": is_passed
            }
            supabase.table("grades").insert(grade_record).execute()
            records_added += 1

    print(f"✅ Successfully injected {records_added} academic records.")
    print("🎯 SCI Architecture locked in. Ready for the dashboard!")


if __name__ == "__main__":
    try:
        seed_database()
    except Exception as e:
        print(f"\n❌ Seeder Error: {e}")