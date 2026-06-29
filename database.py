import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Your local Supabase credentials
url: str = os.getenv("SUPABASE_URL", "http://127.0.0.1:54321")
key: str = os.getenv("SUPABASE_ANON_KEY", "")
supabase: Client = create_client(url, key)

try:
    # 1. Insert a new Course
    new_course = {
        "course_code": "BCS-321",
        "course_name": "Distributed Systems",
        "credits": 3
    }
    print("Adding course...")
    course_response = supabase.table("courses").insert(new_course).execute()
    course_id = course_response.data[0]['id']

    # 2. Fetch the Student ID we created earlier (using their registration number)
    print("Fetching student record...")
    student_response = supabase.table("students").select("id").eq("student_number", "BCS-001").execute()
    student_id = student_response.data[0]['id']

    # 3. Link them together in the Grades table
    new_grade = {
        "student_id": student_id,
        "course_id": course_id,
        "score": 88.50,
        "grade": "A",
        "semester": "Y3S2"
    }

    print("Recording grade...")
    grade_response = supabase.table("grades").insert(new_grade).execute()

    print("\n✅ Success! The grade has been officially recorded:")
    print(grade_response.data)

except Exception as e:
    print("\n❌ An error occurred:", e)