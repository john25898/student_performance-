import argparse
import os
import random
from dataclasses import dataclass

from supabase import Client, create_client


SUPABASE_URL = os.getenv("SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

DEPARTMENT_PROGRAM_MAP = {
    "Department of Computer Science": [
        "Bachelor of Science Computer Science",
        "Bachelor of Science Computer Technology",
        "Bachelor of Science Data Science",
        "Bachelor of Science in Computer Security & Forensics",
    ],
    "Department of Information Technology": [
        "Bachelor of Science in Information Technology",
        "Bachelor of Science In Information Science",
        "Bachelor of Business Information Technology",
    ],
    "Department of Information and Media Studies": [
        "Bachelor of Communication and Journalism",
    ],
}

COURSE_CATALOG = {
    "Department of Computer Science": [
        ("CCS-3201", "Data Mining and Warehousing"),
        ("CCS-3202", "Advanced Algorithms"),
        ("CCS-3203", "Cloud Native Systems"),
        ("CCS-3204", "Applied Cyber Forensics"),
    ],
    "Department of Information Technology": [
        ("CIT-3201", "Enterprise Networking"),
        ("CIT-3202", "Systems Administration"),
        ("CIT-3203", "Business Information Systems"),
        ("CIT-3204", "Service Management and IT Governance"),
    ],
    "Department of Information and Media Studies": [
        ("CIM-3201", "Digital Media Production"),
        ("CIM-3202", "Broadcast Journalism"),
        ("CIM-3203", "Media Research Methods"),
        ("CIM-3204", "Communication Ethics and Policy"),
    ],
}

PROGRAM_PREFIX = {
    "Bachelor of Science Computer Science": "CS201",
    "Bachelor of Science Computer Technology": "CT201",
    "Bachelor of Science Data Science": "DS201",
    "Bachelor of Science in Computer Security & Forensics": "CSF201",
    "Bachelor of Science in Information Technology": "IT201",
    "Bachelor of Science In Information Science": "IS201",
    "Bachelor of Business Information Technology": "BBIT201",
    "Bachelor of Communication and Journalism": "CJ201",
}

FIRST_NAMES = [
    "Amani",
    "Brian",
    "Caroline",
    "Davis",
    "Edna",
    "Faith",
    "George",
    "Hellen",
    "Ian",
    "Joan",
    "Kevin",
    "Linda",
    "Martin",
    "Naomi",
    "Otieno",
    "Purity",
    "Quincy",
    "Ruth",
    "Samuel",
    "Tracy",
    "Victor",
    "Wanjiku",
    "Xavier",
    "Yvonne",
    "Zablon",
]

LAST_NAMES = [
    "Mwangi",
    "Achieng",
    "Kariuki",
    "Mutiso",
    "Wambui",
    "Kiptoo",
    "Njoroge",
    "Muthoni",
    "Chebet",
    "Otieno",
    "Naliaka",
    "Omondi",
    "Maina",
    "Wekesa",
]


@dataclass
class SeederStats:
    courses: int = 0
    students: int = 0
    grades: int = 0
    thief_suspects: int = 0
    at_risk_profiles: int = 0


def get_db() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def _chunks(rows: list[str], size: int = 80) -> list[list[str]]:
    return [rows[i:i + size] for i in range(0, len(rows), size)]


def reset_departmental_data(db: Client) -> None:
    departments = list(DEPARTMENT_PROGRAM_MAP.keys())
    known_programs = [p for programs in DEPARTMENT_PROGRAM_MAP.values() for p in programs]
    known_prefixes = tuple(PROGRAM_PREFIX.values())

    existing_students = []
    start = 0
    page_size = 1000
    while True:
        chunk = (
            db.table("students")
            .select("id, department, program, student_number")
            .range(start, start + page_size - 1)
            .execute()
            .data
            or []
        )
        if not chunk:
            break
        existing_students.extend(chunk)
        if len(chunk) < page_size:
            break
        start += page_size
    student_ids = []
    for row in existing_students:
        dept = row.get("department") or ""
        program = row.get("program") or ""
        student_number = row.get("student_number") or ""
        if (
            dept in departments
            or program in known_programs
            or student_number.startswith(known_prefixes)
        ):
            student_ids.append(row["id"])

    for batch in _chunks(student_ids):
        db.table("grades").delete().in_("student_id", batch).execute()
        db.table("students").delete().in_("id", batch).execute()


def upsert_courses(db: Client) -> dict[str, list[str]]:
    dept_course_ids: dict[str, list[str]] = {}

    for dept, rows in COURSE_CATALOG.items():
        dept_course_ids[dept] = []
        for code, name in rows:
            payload = {
                "course_code": code,
                "course_name": name,
                "department": dept,
                "credits": 3,
            }
            res = db.table("courses").upsert(payload, on_conflict="course_code").execute()
            dept_course_ids[dept].append(res.data[0]["id"])

    return dept_course_ids


def build_student_record(program: str, department: str, idx: int) -> dict:
    prefix = PROGRAM_PREFIX[program]
    reg_no = f"{prefix}/{130000 + idx}/24"
    return {
        "student_number": reg_no,
        "first_name": random.choice(FIRST_NAMES),
        "last_name": random.choice(LAST_NAMES),
        "year_of_study": random.choice([2, 3, 4]),
        "program": program,
        "department": department,
    }


def grade_profile_for_program(program: str) -> tuple[float, float, float]:
    if "Computer Security" in program:
        return (74.0, 96.0, 6.5)
    if "Data Science" in program:
        return (76.0, 97.0, 7.0)
    if "Communication" in program:
        return (75.0, 97.0, 6.0)
    return (72.0, 95.0, 6.0)


def insert_grade_records(
    db: Client,
    student_id: str,
    course_ids: list[str],
    program: str,
    semesters: list[str],
    profile_type: str,
) -> int:
    min_att, max_att, study_bias = grade_profile_for_program(program)
    inserted = 0

    for semester in semesters:
        sampled_courses = random.sample(course_ids, k=min(3, len(course_ids)))
        for idx, course_id in enumerate(sampled_courses):
            if profile_type == "thief":
                # Suspicious pattern: one exceptional course result and weak performance elsewhere.
                if idx == 0:
                    attendance = round(random.uniform(88.0, 98.0), 1)
                    study_hours = round(random.uniform(1.0, 2.3), 1)
                    cat_score = round(random.uniform(24.0, 30.0), 1)
                    exam_score = round(random.uniform(50.0, 68.0), 1)
                else:
                    attendance = round(random.uniform(42.0, 63.0), 1)
                    study_hours = round(random.uniform(0.5, 2.0), 1)
                    cat_score = round(random.uniform(6.0, 14.0), 1)
                    exam_score = round(random.uniform(10.0, 27.0), 1)
            elif profile_type == "at_risk":
                attendance = round(random.uniform(50.0, 69.0), 1)
                study_hours = round(random.uniform(1.5, 3.5), 1)
                cat_score = round(random.uniform(10.0, 18.0), 1)
                exam_score = round(random.uniform(18.0, 36.0), 1)
            else:
                attendance = round(random.uniform(min_att, max_att), 1)
                study_hours = round(
                    random.uniform(max(1.0, study_bias - 2.0), study_bias + 4.0),
                    1,
                )

                if attendance < 78:
                    cat_score = round(random.uniform(14.0, 22.0), 1)
                    exam_score = round(random.uniform(28.0, 42.0), 1)
                else:
                    cat_score = round(random.uniform(18.0, 30.0), 1)
                    exam_score = round(random.uniform(38.0, 60.0), 1)

            total_score = round(cat_score + exam_score, 1)
            passed = total_score >= 50.0

            row = {
                "student_id": student_id,
                "course_id": course_id,
                "semester": semester,
                "score": total_score,
                "grade": (
                    "A"
                    if total_score >= 70
                    else "B"
                    if total_score >= 60
                    else "C"
                    if total_score >= 50
                    else "F"
                ),
                "attendance_percent": attendance,
                "cat_score": cat_score,
                "exam_score": exam_score,
                "study_hours_per_week": study_hours,
                "is_passed": passed,
            }
            db.table("grades").upsert(
                row,
                on_conflict="student_id,course_id,semester",
            ).execute()
            inserted += 1

    return inserted


def seed_departmental_scope_data(
    students_per_program: int,
    seed: int,
    thief_per_department: int,
    at_risk_ratio: float,
    reset_existing: bool,
) -> SeederStats:
    random.seed(seed)
    db = get_db()
    stats = SeederStats()

    if reset_existing:
        reset_departmental_data(db)

    dept_course_ids = upsert_courses(db)
    stats.courses = sum(len(v) for v in dept_course_ids.values())

    counter = 0
    semesters = ["Y2S2", "Y3S1", "Y3S2", "Y4S1"]

    for department, programs in DEPARTMENT_PROGRAM_MAP.items():
        dept_total_students = max(1, len(programs) * students_per_program)
        dept_thief_target = max(0, min(thief_per_department, dept_total_students))
        dept_at_risk_target = max(
            4,
            min(
                dept_total_students - dept_thief_target,
                int(dept_total_students * at_risk_ratio),
            ),
        )
        dept_counter = 0

        for program in programs:
            for _ in range(students_per_program):
                counter += 1
                dept_counter += 1
                student = build_student_record(program, department, counter)
                res = db.table("students").upsert(student, on_conflict="student_number").execute()
                student_id = res.data[0]["id"]
                stats.students += 1

                if dept_counter <= dept_thief_target:
                    profile_type = "thief"
                    stats.thief_suspects += 1
                elif dept_counter <= (dept_thief_target + dept_at_risk_target):
                    profile_type = "at_risk"
                    stats.at_risk_profiles += 1
                else:
                    profile_type = "normal"

                stats.grades += insert_grade_records(
                    db,
                    student_id=student_id,
                    course_ids=dept_course_ids[department],
                    program=program,
                    semesters=semesters,
                    profile_type=profile_type,
                )

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed structured MUST departmental data for 3 CoDs + Dean analytics scope."
    )
    parser.add_argument(
        "--students-per-program",
        type=int,
        default=90,
        help="How many students to generate per program.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=2026,
        help="Random seed for deterministic generation.",
    )
    parser.add_argument(
        "--thief-ratio",
        type=int,
        default=1,
        help="Legacy alias for thief suspects per department.",
    )
    parser.add_argument(
        "--thief-per-department",
        type=int,
        default=None,
        help="How many thief-suspect profiles to inject per department.",
    )
    parser.add_argument(
        "--at-risk-ratio",
        type=float,
        default=0.22,
        help="Fraction of students per department to generate as at-risk (non-thief).",
    )
    parser.add_argument(
        "--reset-existing",
        action="store_true",
        help="Delete existing departmental students and grades before seeding.",
    )
    args = parser.parse_args()

    stats = seed_departmental_scope_data(
        students_per_program=args.students_per_program,
        seed=args.seed,
        thief_per_department=max(
            0,
            min(
                4,
                args.thief_per_department
                if args.thief_per_department is not None
                else args.thief_ratio,
            ),
        ),
        at_risk_ratio=max(0.05, min(0.6, args.at_risk_ratio)),
        reset_existing=args.reset_existing,
    )

    print("Departmental scope seeding complete.")
    print(f"Courses synced: {stats.courses}")
    print(f"Students upserted: {stats.students}")
    print(f"Grade rows inserted: {stats.grades}")
    print(f"At-risk profiles generated: {stats.at_risk_profiles}")
    print(f"Suspicious profiles generated: {stats.thief_suspects}")


if __name__ == "__main__":
    main()
