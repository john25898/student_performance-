from pathlib import Path
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import json

import os
from dotenv import load_dotenv
from fastapi import FastAPI

# Load environment variables from .env file at project root
load_dotenv()
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import pandas as pd
try:
    from pycaret.classification import load_model, predict_model
    _PYCARET_AVAILABLE = True
except Exception:
    load_model = None
    predict_model = None
    _PYCARET_AVAILABLE = False
import uvicorn
from groq import Groq
try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = None
try:
    import africastalking
except ImportError:
    africastalking = None

# --- Initialize Database (Supabase) — SAFE: won't crash if missing .env or package ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")
db: Client | None = None
if create_client is not None:
    try:
        db = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception:
        db = None
else:
    print("⚠️  supabase package not installed. Will use demo mode.")

# --- Initialize Africa's Talking (SMS Gateway) — SAFE ---
AT_USERNAME = os.getenv("AT_USERNAME", "sandbox")
AT_API_KEY = os.getenv("AT_API_KEY", "")
sms = None
if AT_API_KEY and africastalking is not None:
    try:
        africastalking.initialize(AT_USERNAME, AT_API_KEY)
        sms = africastalking.SMS
    except Exception:
        sms = None

# --- Initialize Groq (Generative AI) — SAFE ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = BASE_DIR / "frontend"

# 1. Load the PyCaret Engine (Predictive AI) if available
risk_model = None
if _PYCARET_AVAILABLE:
    model_path = Path(__file__).resolve().parent / "ml" / "production_risk_pipeline"
    try:
        print("Warming up the AI Engines...")
        risk_model = load_model(str(model_path))
    except Exception as e:
        print(f"PyCaret model load failed: {e}")
        risk_model = None
else:
    print("PyCaret not available; continuing without ML model.")

# 2. Initialize the core API Engine
app = FastAPI(
    title="School of Computing - AI Command Center",
    description="Proactive Intelligence Engine for CoD and Dean",
    version="3.0.0"
)

# --- CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/views", StaticFiles(directory=FRONTEND_DIR / "views"), name="views")
app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")


@app.get("/")
async def serve_frontend():
    return FileResponse(FRONTEND_DIR / "index.html")


# 3. Data Structures
class StudentData(BaseModel):
    Year: int
    GPA: float
    Score: float
    Attendance: float
    Study_Hours: float
    Failures: int
    Credits: int


class LoginCredentials(BaseModel):
    username: str
    password: str


# SMS Data Structure
class SMSRequest(BaseModel):
    reg_no: str
    phone_number: str
    risk_probability: float
    intervention_mode: str = "General Academic Advising"
    intervention_owner: str = "Academic Advisor"
    intervention_eta_days: int = 7
    intervention_steps: list[str] = []


class WorkflowCaseCreate(BaseModel):
    reg_no: str
    action_name: str
    owner: str
    priority: str
    expected_risk_reduction: float = 0.0
    due_days: int = 7


class WorkflowCaseUpdate(BaseModel):
    status: str
    notes: str = ""
    actor_role: str = "System"
    justification: str = ""
    evidence_summary: str = ""
    checklist_completed: int = 0


WORKFLOW_CASES: dict[str, dict] = {}
WORKFLOW_HISTORY: list[dict] = []
WORKFLOW_STORAGE_FILE = Path(__file__).resolve().parent / "workflow_store.json"
EXPLAINABILITY_SNAPSHOTS: dict[str, list[dict]] = {}

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

AUTH_ACCOUNTS = {
    "cod_cs": {
        "password": "admin123",
        "role": "CoD",
        "name": "CoD Computer Science",
        "department_scope": "Department of Computer Science",
    },
    "cod_it": {
        "password": "admin123",
        "role": "CoD",
        "name": "CoD Information Technology",
        "department_scope": "Department of Information Technology",
    },
    "cod_ims": {
        "password": "admin123",
        "role": "CoD",
        "name": "CoD Information and Media Studies",
        "department_scope": "Department of Information and Media Studies",
    },
    "dean_sci": {
        "password": "admin123",
        "role": "Dean",
        "name": "Prof. Dean",
        "department_scope": None,
    },
    "admin_sci": {
        "password": "admin123",
        "role": "Admin",
        "name": "System Administrator",
        "department_scope": None,
    },
}


def normalize_department(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    for dept in DEPARTMENT_PROGRAM_MAP.keys():
        if cleaned.lower() == dept.lower():
            return dept
    return cleaned


# ──────────────────────────────────────────────
# DEMO / OFFLINE MODE — Synthetic data generator
# When Supabase is not available, we generate
# realistic mock data so the UI works out of the box.
# ──────────────────────────────────────────────
import random as _random

_MOCK_FIRST_NAMES = ["Amani","Brian","Caroline","Davis","Edna","Faith","George","Hellen","Ian","Joan","Kevin","Linda","Martin","Naomi","Otieno","Purity","Ruth","Samuel","Tracy","Victor","Wanjiku","Yvonne","Zablon"]
_MOCK_LAST_NAMES = ["Mwangi","Achieng","Kariuki","Mutiso","Wambui","Kiptoo","Njoroge","Muthoni","Chebet","Otieno","Omondi","Maina","Wekesa"]
_MOCK_PROGRAM_PREFIX = {
    "Bachelor of Science Computer Science":"CS201","Bachelor of Science Computer Technology":"CT201","Bachelor of Science Data Science":"DS201","Bachelor of Science in Computer Security & Forensics":"CSF201","Bachelor of Science in Information Technology":"IT201","Bachelor of Science In Information Science":"IS201","Bachelor of Business Information Technology":"BBIT201","Bachelor of Communication and Journalism":"CJ201"}
_MOCK_COURSES = {
    "Department of Computer Science": [("CCS-3201","Data Mining and Warehousing"),("CCS-3202","Advanced Algorithms"),("CCS-3203","Cloud Native Systems"),("CCS-3204","Applied Cyber Forensics")],
    "Department of Information Technology": [("CIT-3201","Enterprise Networking"),("CIT-3202","Systems Administration"),("CIT-3203","Business Information Systems"),("CIT-3204","Service Management and IT Governance")],
    "Department of Information and Media Studies": [("CIM-3201","Digital Media Production"),("CIM-3202","Broadcast Journalism"),("CIM-3203","Media Research Methods"),("CIM-3204","Communication Ethics and Policy")]}

_MOCK_DATA_CACHE: dict[str, list[dict]] = {}

def _generate_mock_data():
    """Generate ~30 students per department with grades & courses, cached in memory."""
    if _MOCK_DATA_CACHE:
        return

    dept_list = list(DEPARTMENT_PROGRAM_MAP.keys())
    courses_out: list[dict] = []
    cid = 1
    for dept, entries in _MOCK_COURSES.items():
        for code, name in entries:
            courses_out.append({"id":cid,"course_code":code,"course_name":name,"department":dept,"credits":3})
            cid += 1
    _MOCK_DATA_CACHE["courses"] = courses_out

    course_map: dict[str, list[int]] = {d:[] for d in dept_list}
    for c in courses_out:
        course_map.setdefault(c["department"],[]).append(c["id"])

    students_out: list[dict] = []
    grades_out: list[dict] = []
    sid = 1
    gid = 1
    for dept, programs in DEPARTMENT_PROGRAM_MAP.items():
        for idx in range(1, 31):
            program = _random.choice(programs)
            prefix = _MOCK_PROGRAM_PREFIX[program]
            reg_no = f"{prefix}/{130000 + idx}/24"
            first = _random.choice(_MOCK_FIRST_NAMES)
            last = _random.choice(_MOCK_LAST_NAMES)
            students_out.append({"id":sid,"student_number":reg_no,"first_name":first,"last_name":last,"year_of_study":_random.choice([2,3,4]),"program":program,"department":dept})
            # 2-4 grades per student
            dept_courses = course_map.get(dept, [])
            if not dept_courses:
                continue
            for course_id in _random.sample(dept_courses, min(_random.randint(2,4), len(dept_courses))):
                att = round(_random.uniform(40.0, 100.0), 1)
                if att < 65.0:
                    cat = round(_random.uniform(10.0, 19.0), 1)
                    shours = round(_random.uniform(1.0, 3.5), 1)
                    passed = False
                else:
                    cat = round(_random.uniform(20.0, 29.0), 1)
                    shours = round(_random.uniform(4.0, 12.0), 1)
                    passed = True
                exam = round(cat * 2.2, 1)
                total = round(cat + exam, 1)
                grade = "A" if total >= 70 else "B" if total >= 60 else "C" if total >= 50 else "F"
                semester = f"Y{_random.choice([2,3])}S{_random.choice([1,2])}"
                grades_out.append({"id":gid,"student_id":sid,"course_id":course_id,"semester":semester,"score":total,"grade":grade,"attendance_percent":att,"cat_score":cat,"exam_score":exam,"study_hours_per_week":shours,"is_passed":passed})
                gid += 1
            sid += 1
    _MOCK_DATA_CACHE["students"] = students_out
    _MOCK_DATA_CACHE["grades"] = grades_out

_USE_MOCK_DATA = False

def _check_and_seed_mock_data():
    global _USE_MOCK_DATA
    if _USE_MOCK_DATA:
        _generate_mock_data()
        return
    # Test if DB is reachable by trying a small fetch
    if db is None:
        print("⚠️  No database configured. Switching to demo mode with synthetic data.")
        _USE_MOCK_DATA = True
        _generate_mock_data()
        return
    try:
        test = db.table("students").select("id").limit(1).execute().data
        if not test:
            print("⚠️  Database is empty. Switching to demo mode with synthetic data.")
            _USE_MOCK_DATA = True
            _generate_mock_data()
        else:
            print(f"✅ Database connected — {len(test)} records found.")
    except Exception as e:
        print(f"⚠️  Database unreachable ({e}). Switching to demo mode with synthetic data.")
        _USE_MOCK_DATA = True
        _generate_mock_data()


def department_filter_passes(student_dept: str | None, scope_department: str | None) -> bool:
    if not scope_department:
        return True
    return (student_dept or "Unassigned").lower() == scope_department.lower()


def fetch_all_table_rows(table_name: str, columns: str, page_size: int = 1000) -> list[dict]:
    # Use mock data if in demo mode
    if _USE_MOCK_DATA:
        _generate_mock_data()
        data = _MOCK_DATA_CACHE.get(table_name, [])
        if columns == "*" or columns.strip() == "*":
            return list(data)
        wanted = [c.strip() for c in columns.split(",")]
        return [{k: r[k] for k in wanted if k in r} for r in data]

    rows: list[dict] = []
    start = 0
    while True:
        try:
            chunk = (
                db.table(table_name)
                .select(columns)
                .range(start, start + page_size - 1)
                .execute()
                .data
                or []
            )
        except Exception:
            return rows if rows else _fallback_mock(table_name, columns)
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        start += page_size
    if not rows:
        return _fallback_mock(table_name, columns)
    return rows


def _fallback_mock(table_name: str, columns: str) -> list[dict]:
    _generate_mock_data()
    data = _MOCK_DATA_CACHE.get(table_name, [])
    if columns == "*" or columns.strip() == "*":
        return list(data)
    wanted = [c.strip() for c in columns.split(",")]
    return [{k: r[k] for k in wanted if k in r} for r in data]


def _mock_db_query(table_name: str, columns: str = "*", eq_column: str | None = None, eq_value: str | None = None) -> dict:
    """Mock replacement for db.table().select().eq().execute() pattern."""
    data = _fallback_mock(table_name, columns) if _USE_MOCK_DATA else []
    result = data
    if eq_column and eq_value is not None and result:
        result = [r for r in result if str(r.get(eq_column, "")) == str(eq_value)]
    class MockResponse:
        def __init__(self, d):
            self.data = d
    return MockResponse(result)


def _student_by_reg(reg_no: str) -> dict | None:
    """Lookup student by reg_no — checks DB first, falls back to mock."""
    if _USE_MOCK_DATA:
        _generate_mock_data()
        for s in _MOCK_DATA_CACHE.get("students", []):
            if s["student_number"] == reg_no:
                return dict(s)
        return None
    try:
        res = db.table("students").select("*").eq("student_number", reg_no).limit(1).execute()
        return res.data[0] if res.data else None
    except Exception:
        return None


def _grades_for_student(student_id: int) -> list[dict]:
    """Get grades for a student — checks DB first, falls back to mock."""
    if _USE_MOCK_DATA:
        _generate_mock_data()
        return [dict(g) for g in _MOCK_DATA_CACHE.get("grades", []) if g["student_id"] == student_id]
    try:
        res = db.table("grades").select("*").eq("student_id", student_id).execute()
        return res.data or []
    except Exception:
        return []


def resolve_lecturer_name(course_code: str | None, course_name: str | None) -> str:
    code = (course_code or "").upper()
    if code.startswith("CCS-"):
        return "Dr. Kamau"
    if code.startswith("CIT-"):
        return "Prof. Naliaka"
    if code.startswith("CIM-"):
        return "Dr. Wanjiru"
    if "Algorithm" in (course_name or ""):
        return "Prof. Mutai"
    if "Journal" in (course_name or ""):
        return "Dr. Achieng"
    return "Assigned Lecturer"


def correlation_ratio(numerator: list[float], denominator: list[float]) -> float:
    if not numerator or not denominator or len(numerator) != len(denominator):
        return 0.0
    den = sum(v * v for v in denominator) ** 0.5
    num = sum(v * v for v in numerator) ** 0.5
    if den == 0 or num == 0:
        return 0.0
    dot = sum(a * b for a, b in zip(numerator, denominator))
    return round(dot / (num * den), 3)


def ensure_workflow_case_department() -> None:
    changed = False
    for case in WORKFLOW_CASES.values():
        if not case.get("department"):
            case["department"] = get_student_department_by_reg(case.get("reg_no", ""))
            changed = True
    if changed:
        save_workflow_store()


def semester_sort_key(semester: str) -> tuple[int, int, str]:
    text = str(semester or "")
    try:
        clean = text.upper().replace(" ", "")
        if clean.startswith("Y") and "S" in clean:
            year = int(clean[1:clean.index("S")])
            sem = int(clean[clean.index("S") + 1:])
            return (year, sem, clean)
    except Exception:
        pass
    return (999, 999, text)


def predict_next_from_series(values: list[float], min_value: float = 0.0, max_value: float = 100.0) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return round(values[0], 1)
    deltas = [values[idx] - values[idx - 1] for idx in range(1, len(values))]
    avg_delta = sum(deltas) / len(deltas)
    projected = values[-1] + avg_delta
    return round(max(min_value, min(max_value, projected)), 1)


def get_student_department_by_reg(reg_no: str) -> str:
    student = _student_by_reg(reg_no)
    if student:
        return normalize_department(student.get("department")) or "Unassigned"
    return "Unassigned"


def case_matches_scope(case: dict, scope_department: str | None) -> bool:
    if not scope_department:
        return True
    case_dept = normalize_department(case.get("department"))
    if not case_dept:
        case_dept = get_student_department_by_reg(case.get("reg_no", ""))
    return department_filter_passes(case_dept, scope_department)


def suspicion_score(records: list[dict]) -> tuple[bool, dict]:
    if not records:
        return False, {
            "score_span": 0.0,
            "high_mark": 0.0,
            "low_mark": 0.0,
            "avg_attendance": 0.0,
            "fail_count": 0,
        }

    scores = [float(r.get("score", 0.0)) for r in records]
    high_mark = max(scores)
    low_mark = min(scores)
    score_span = high_mark - low_mark
    avg_attendance = sum(float(r.get("attendance_percent", 0.0)) for r in records) / len(records)
    fail_count = sum(1 for r in records if not r.get("is_passed", False))
    pass_count = sum(1 for r in records if r.get("is_passed", False))
    suspicious = (
        high_mark >= 90.0
        and low_mark <= 42.0
        and score_span >= 60.0
        and fail_count >= 6
        and pass_count >= 2
        and avg_attendance <= 74.0
    )
    return suspicious, {
        "score_span": round(score_span, 1),
        "high_mark": round(high_mark, 1),
        "low_mark": round(low_mark, 1),
        "avg_attendance": round(avg_attendance, 1),
        "fail_count": fail_count,
    }


def save_workflow_store() -> None:
    payload = {
        "cases": WORKFLOW_CASES,
        "history": WORKFLOW_HISTORY,
        "explainability_snapshots": EXPLAINABILITY_SNAPSHOTS
    }
    WORKFLOW_STORAGE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_workflow_store() -> None:
    if not WORKFLOW_STORAGE_FILE.exists():
        return
    try:
        data = json.loads(WORKFLOW_STORAGE_FILE.read_text(encoding="utf-8"))
        WORKFLOW_CASES.update(data.get("cases", {}))
        WORKFLOW_HISTORY.extend(data.get("history", []))
        EXPLAINABILITY_SNAPSHOTS.update(data.get("explainability_snapshots", {}))
    except Exception:
        # Keep app alive even if local persistence file is malformed.
        return


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


load_workflow_store()


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def derive_case_status_buckets(cases: list[dict]) -> dict[str, list[dict]]:
    grouped = {"new": [], "in_progress": [], "resolved": []}
    for case in cases:
        grouped.setdefault(case["status"], []).append(case)
    return grouped


def build_student_metrics(student: dict, records: list[dict]) -> StudentData:
    total_attendance = sum(r['attendance_percent'] for r in records)
    avg_attendance = round(total_attendance / len(records), 1)
    total_cat = sum(r['cat_score'] for r in records)
    avg_cat = round(total_cat / len(records), 1)
    total_study = sum(r['study_hours_per_week'] for r in records)
    avg_study = round(total_study / len(records), 1)
    failures = sum(1 for r in records if not r['is_passed'])
    avg_score = round(sum(r['score'] for r in records) / len(records), 1)
    estimated_gpa = round((avg_score / 100) * 4.0, 2)

    return StudentData(
        Year=student['year_of_study'],
        GPA=estimated_gpa,
        # Keep Score aligned to /100 representation used across UI and forecasting.
        Score=avg_score,
        Attendance=avg_attendance,
        Study_Hours=avg_study,
        Failures=failures,
        Credits=15
    )


def build_student_ai_context(student: dict, metrics: StudentData) -> str:
    name = f"{student.get('first_name', '').strip()} {student.get('last_name', '').strip()}".strip() or "Unknown Student"
    reg_no = student.get("student_number", "UNKNOWN")
    department = student.get("department") or "Unassigned"
    program = student.get("program") or "Unknown"
    return (
        f"Student Context:\n"
        f"- Name: {name}\n"
        f"- Reg No: {reg_no}\n"
        f"- Department: {department}\n"
        f"- Program: {program}\n"
        f"- Metrics: GPA {metrics.GPA}, Attendance {metrics.Attendance}%, Score {metrics.Score}/100, Failures {metrics.Failures}, Study Hours {metrics.Study_Hours}/week"
    )


@app.get("/wow/semester-unit-lecturer-correlation")
async def get_semester_unit_lecturer_correlation(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    students = fetch_all_table_rows("students", "id, department, program")
    courses = fetch_all_table_rows("courses", "id, course_code, course_name, department")
    grades = fetch_all_table_rows(
        "grades",
        "student_id, course_id, semester, attendance_percent, score, is_passed",
    )
    if not students or not courses or not grades:
        return {"summary": "Insufficient data for correlation board.", "rows": []}

    student_map = {
        s["id"]: s
        for s in students
        if department_filter_passes(s.get("department"), scoped_dept)
    }
    course_map = {c["id"]: c for c in courses}

    grouped: dict[tuple[str, str, str], dict] = {}
    for g in grades:
        student = student_map.get(g.get("student_id"))
        course = course_map.get(g.get("course_id"))
        if not student or not course:
            continue
        key = (
            student.get("department") or "Unassigned",
            str(g.get("semester") or "N/A"),
            course.get("course_code") or "UNKNOWN",
        )
        grouped.setdefault(
            key,
            {
                "department": student.get("department") or "Unassigned",
                "semester": str(g.get("semester") or "N/A"),
                "course_code": course.get("course_code") or "UNKNOWN",
                "course_name": course.get("course_name") or "Unknown Unit",
                "lecturer": resolve_lecturer_name(course.get("course_code"), course.get("course_name")),
                "attendance": [],
                "scores": [],
                "passes": 0,
                "count": 0,
            },
        )
        bucket = grouped[key]
        bucket["attendance"].append(float(g.get("attendance_percent") or 0.0))
        bucket["scores"].append(float(g.get("score") or 0.0))
        if g.get("is_passed"):
            bucket["passes"] += 1
        bucket["count"] += 1

    rows = []
    for row in grouped.values():
        avg_attendance = round(sum(row["attendance"]) / max(1, row["count"]), 1)
        avg_score = round(sum(row["scores"]) / max(1, row["count"]), 1)
        pass_rate = round((row["passes"] / max(1, row["count"])) * 100, 1)
        risk_proxy = round(max(0.0, min(100.0, 100 - ((avg_attendance * 0.45) + (avg_score * 0.55)))), 1)
        corr = correlation_ratio(row["attendance"], row["scores"])
        rows.append(
            {
                "department": row["department"],
                "semester": row["semester"],
                "course_code": row["course_code"],
                "course_name": row["course_name"],
                "lecturer": row["lecturer"],
                "avg_attendance": avg_attendance,
                "avg_score": avg_score,
                "pass_rate": pass_rate,
                "risk_proxy": risk_proxy,
                "attendance_score_corr": corr,
                "sample_size": row["count"],
            }
        )

    rows = sorted(rows, key=lambda r: (r["risk_proxy"], -r["attendance_score_corr"]), reverse=True)
    return {
        "summary": f"Correlation board ready: {len(rows)} semester-unit slices across departments.",
        "rows": rows[:60],
    }


@app.get("/wow/semester-analysis")
async def get_semester_analysis(scope_department: str | None = None, history: int = 5):
    scoped_dept = normalize_department(scope_department)
    history = max(3, min(8, int(history or 5)))

    students = fetch_all_table_rows("students", "id, department")
    grades = fetch_all_table_rows(
        "grades",
        "student_id, semester, attendance_percent, score, is_passed",
    )
    if not students or not grades:
        return {"summary": "Insufficient data for semester analysis.", "semesters": [], "series": [], "next_prediction": {}}

    student_map = {
        s["id"]: s for s in students if department_filter_passes(s.get("department"), scoped_dept)
    }
    dept_sem: dict[tuple[str, str], dict] = {}
    for g in grades:
        student = student_map.get(g.get("student_id"))
        if not student:
            continue
        dept = student.get("department") or "Unassigned"
        semester = str(g.get("semester") or "N/A")
        key = (dept, semester)
        dept_sem.setdefault(key, {"attendance": 0.0, "score": 0.0, "passes": 0, "count": 0})
        bucket = dept_sem[key]
        bucket["attendance"] += float(g.get("attendance_percent") or 0.0)
        bucket["score"] += float(g.get("score") or 0.0)
        if g.get("is_passed"):
            bucket["passes"] += 1
        bucket["count"] += 1

    all_semesters = sorted({sem for (_, sem) in dept_sem.keys()}, key=semester_sort_key)
    recent_semesters = all_semesters[-history:]
    while len(recent_semesters) < history:
        recent_semesters.insert(0, f"H-{history - len(recent_semesters)}")
    if not recent_semesters:
        return {"summary": "No semester rows found.", "semesters": [], "series": [], "next_prediction": {}}

    departments = sorted(
        {
            dept
            for (dept, _) in dept_sem.keys()
            if scoped_dept or (dept and dept.lower() != "unassigned")
        }
    )
    series = []
    for dept in departments:
        rows = []
        for semester in recent_semesters:
            agg = dept_sem.get((dept, semester))
            if not agg or agg["count"] == 0:
                rows.append({
                    "semester": semester,
                    "avg_attendance": 0.0,
                    "avg_score": 0.0,
                    "pass_rate": 0.0,
                    "risk_proxy": 100.0,
                    "sample_size": 0,
                })
                continue
            avg_att = round(agg["attendance"] / agg["count"], 1)
            avg_score = round(agg["score"] / agg["count"], 1)
            pass_rate = round((agg["passes"] / agg["count"]) * 100, 1)
            risk_proxy = round(max(0.0, min(100.0, 100 - ((avg_att * 0.45) + (avg_score * 0.55)))), 1)
            rows.append({
                "semester": semester,
                "avg_attendance": avg_att,
                "avg_score": avg_score,
                "pass_rate": pass_rate,
                "risk_proxy": risk_proxy,
                "sample_size": agg["count"],
            })
        series.append({"department": dept, "rows": rows})

    if scoped_dept:
        scoped_series = [s for s in series if normalize_department(s["department"]) == scoped_dept]
        focus = scoped_series[0] if scoped_series else {"department": scoped_dept, "rows": []}
        pass_values = [r["pass_rate"] for r in focus["rows"] if r["sample_size"] > 0]
        risk_values = [r["risk_proxy"] for r in focus["rows"] if r["sample_size"] > 0]
        next_prediction = {
            "department": focus.get("department", scoped_dept),
            "next_semester_label": "NEXT",
            "predicted_pass_rate": predict_next_from_series(pass_values, 0.0, 100.0),
            "predicted_risk_proxy": predict_next_from_series(risk_values, 0.0, 100.0),
        }
        return {
            "summary": f"Semester analysis ready for {focus.get('department', scoped_dept)} across {len(recent_semesters)} semesters.",
            "semesters": recent_semesters,
            "series": [focus],
            "next_prediction": next_prediction,
            "mode": "cod",
        }

    dept_predictions = []
    for row in series:
        pass_values = [r["pass_rate"] for r in row["rows"] if r["sample_size"] > 0]
        risk_values = [r["risk_proxy"] for r in row["rows"] if r["sample_size"] > 0]
        dept_predictions.append(
            {
                "department": row["department"],
                "predicted_pass_rate": predict_next_from_series(pass_values, 0.0, 100.0),
                "predicted_risk_proxy": predict_next_from_series(risk_values, 0.0, 100.0),
            }
        )

    dean_pass = [p["predicted_pass_rate"] for p in dept_predictions]
    dean_risk = [p["predicted_risk_proxy"] for p in dept_predictions]
    return {
        "summary": f"Semester analysis ready for Dean view across {len(series)} departments and {len(recent_semesters)} semesters.",
        "semesters": recent_semesters,
        "series": series,
        "next_prediction": {
            "next_semester_label": "NEXT",
            "predicted_pass_rate": round(sum(dean_pass) / max(1, len(dean_pass)), 1),
            "predicted_risk_proxy": round(sum(dean_risk) / max(1, len(dean_risk)), 1),
            "department_predictions": dept_predictions,
        },
        "mode": "dean",
    }


@app.get("/wow/dean-policy-gate")
async def get_dean_policy_gate(scope_department: str | None = None):
    model_health = await get_model_health(scope_department)
    equity = await get_equity_lens(scope_department)
    stability = float(model_health.get("prediction_stability", 0.0))
    watch_count = sum(1 for r in equity.get("rows", []) if r.get("fairness_flag") == "watch")
    approved = stability >= 72.0 and watch_count <= 3
    reasons = []
    if stability < 72.0:
        reasons.append("Prediction stability below approval threshold (72%).")
    if watch_count > 3:
        reasons.append("Fairness watch count above acceptable guardrail (3).")
    if not reasons:
        reasons.append("All policy gate checks passed.")
    return {
        "approved": approved,
        "stability": stability,
        "fairness_watch_count": watch_count,
        "reasons": reasons,
    }


@app.get("/wow/dean-budget-impact-planner")
async def get_dean_budget_impact_planner(scope_department: str | None = None):
    roi = await get_intervention_roi(scope_department)
    rows = roi.get("rows", [])
    if not rows:
        return {"summary": "No intervention rows yet.", "rows": []}
    priced = []
    for row in rows[:15]:
        effort_hours = max(1, int(row.get("effort_hours", 6)))
        cost = effort_hours * 14
        pass_lift = float(row.get("expected_pass_rate_lift", 0.0))
        priced.append(
            {
                **row,
                "estimated_cost_usd": round(cost, 2),
                "pass_lift_per_100_usd": round((pass_lift / cost) * 100, 2) if cost else 0.0,
                "pass_lift_per_advisor_hour": round(pass_lift / effort_hours, 2),
            }
        )
    priced = sorted(priced, key=lambda r: r["pass_lift_per_100_usd"], reverse=True)
    return {
        "summary": "Budget planner ranks interventions by pass-rate lift per dollar and advisor-hour.",
        "rows": priced[:10],
    }


@app.get("/wow/dean-performance-contracts")
async def get_dean_performance_contracts(scope_department: str | None = None):
    analytics = await get_dean_analytics(scope_department)
    if "error" in analytics:
        return {"summary": analytics["error"], "rows": []}
    radar = await get_escalation_radar(scope_department)
    urgent = len([r for r in radar.get("alerts", []) if r.get("severity") in {"high", "critical"}])
    rows = []
    for dept, stats in analytics.items():
        pass_rate = float(stats.get("pass_rate", 0.0))
        risk_cut_target = 12.0
        pass_target = 70.0
        sla_target = 90.0
        sla_health = max(50.0, min(98.0, 96.0 - urgent * 2.5))
        status = "on-track"
        if pass_rate < pass_target or sla_health < sla_target:
            status = "escalate"
        rows.append(
            {
                "department": dept,
                "target_pass_rate": pass_target,
                "actual_pass_rate": pass_rate,
                "target_risk_reduction": risk_cut_target,
                "target_sla": sla_target,
                "actual_sla": round(sla_health, 1),
                "status": status,
            }
        )
    return {
        "summary": "Department contracts monitor pass-rate, risk-cut, and SLA goals monthly.",
        "rows": rows,
    }


@app.get("/wow/early-warning-cohort-alerts")
async def get_early_warning_cohort_alerts(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    students = fetch_all_table_rows("students", "id, department, program")
    grades = fetch_all_table_rows("grades", "student_id, semester, attendance_percent, score, is_passed")
    student_map = {
        s["id"]: s
        for s in students
        if department_filter_passes(s.get("department"), scoped_dept)
    }
    buckets: dict[tuple[str, str, str], dict] = {}
    for g in grades:
        student = student_map.get(g.get("student_id"))
        if not student:
            continue
        key = (
            student.get("department") or "Unassigned",
            student.get("program") or "Unknown",
            str(g.get("semester") or "N/A"),
        )
        buckets.setdefault(key, {"risk_sum": 0.0, "count": 0, "fails": 0})
        risk_proxy = max(0.0, min(100.0, 100 - ((float(g.get("attendance_percent") or 0) * 0.45) + (float(g.get("score") or 0) * 0.55))))
        buckets[key]["risk_sum"] += risk_proxy
        buckets[key]["count"] += 1
        if not g.get("is_passed"):
            buckets[key]["fails"] += 1

    alerts = []
    for (dept, program, semester), agg in buckets.items():
        avg_risk = round(agg["risk_sum"] / max(1, agg["count"]), 1)
        fail_rate = round((agg["fails"] / max(1, agg["count"])) * 100, 1)
        if avg_risk >= 52 or fail_rate >= 38:
            alerts.append(
                {
                    "department": dept,
                    "program": program,
                    "semester": semester,
                    "avg_risk": avg_risk,
                    "fail_rate": fail_rate,
                    "severity": "critical" if avg_risk >= 62 or fail_rate >= 48 else "warning",
                }
            )
    alerts = sorted(alerts, key=lambda r: (r["severity"], r["avg_risk"], r["fail_rate"]), reverse=True)
    return {
        "summary": f"Early-warning engine detected {len(alerts)} cohort slices needing immediate attention.",
        "alerts": alerts[:20],
    }


@app.get("/wow/board-export-pack")
async def get_board_export_pack(scope_department: str | None = None):
    gate = await get_dean_policy_gate(scope_department)
    budget = await get_dean_budget_impact_planner(scope_department)
    contracts = await get_dean_performance_contracts(scope_department)
    early = await get_early_warning_cohort_alerts(scope_department)
    return {
        "title": "Dean Board Export Pack",
        "generated_at": now_iso(),
        "assumptions": [
            "Risk proxy uses attendance and score blend.",
            "Budget model assumes USD 14 per advisor hour.",
            "Policy gate requires stability >= 72 and fairness watch <= 3.",
        ],
        "confidence": {
            "policy_gate": gate,
            "contracts_count": len(contracts.get("rows", [])),
        },
        "financial_impact": budget.get("rows", [])[:5],
        "cohort_alerts": early.get("alerts", [])[:8],
    }


@app.get("/wow/student-timeline-casebook/{reg_no:path}")
async def get_student_timeline_casebook(reg_no: str, scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    audit = await audit_student_from_db(reg_no, scoped_dept)
    if "error" in audit:
        return audit
    twin = await get_student_digital_twin(reg_no, scoped_dept)
    cases = [
        c for c in WORKFLOW_CASES.values()
        if c.get("reg_no") == reg_no and case_matches_scope(c, scoped_dept)
    ]
    cases = sorted(cases, key=lambda c: c.get("updated_at", c.get("created_at", "")), reverse=True)
    events = [
        e for e in WORKFLOW_HISTORY
        if e.get("reg_no") == reg_no
    ]
    events = sorted(events, key=lambda e: e.get("timestamp", ""), reverse=True)
    next_deadline = min(
        [c.get("due_at") for c in cases if c.get("status") != "resolved"],
        default=None,
    )
    return {
        "student": audit.get("student_profile", {}),
        "current_risk": twin.get("risk", {}),
        "cases": cases[:8],
        "events": events[:12],
        "next_deadline": next_deadline,
    }


@app.get("/wow/advisor-workload-balancer")
async def get_advisor_workload_balancer(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    ensure_workflow_case_department()
    active = [
        c for c in WORKFLOW_CASES.values()
        if c.get("status") != "resolved" and case_matches_scope(c, scoped_dept)
    ]
    owner_load: dict[str, int] = {}
    for case in active:
        owner = case.get("owner") or "Unassigned"
        owner_load[owner] = owner_load.get(owner, 0) + 1

    ranked = sorted(owner_load.items(), key=lambda x: x[1])
    recommendations = []
    if ranked:
        least_owner, _ = ranked[0]
        for case in sorted(active, key=lambda c: c.get("priority", ""), reverse=True)[:8]:
            recommendations.append(
                {
                    "case_id": case.get("id"),
                    "reg_no": case.get("reg_no"),
                    "current_owner": case.get("owner"),
                    "recommended_owner": least_owner,
                    "priority": case.get("priority", "medium"),
                }
            )

    return {
        "summary": f"Workload balancer evaluated {len(active)} active cases.",
        "owner_load": [{"owner": k, "active_cases": v} for k, v in sorted(owner_load.items(), key=lambda x: x[1], reverse=True)],
        "recommendations": recommendations,
    }


@app.get("/wow/intervention-playbook-scoring")
async def get_intervention_playbook_scoring(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    relevant_cases = [
        c for c in WORKFLOW_CASES.values()
        if case_matches_scope(c, scoped_dept)
    ]
    if not relevant_cases:
        return {"summary": "No interventions available for scoring.", "rows": []}

    grouped: dict[str, dict] = {}
    for case in relevant_cases:
        name = case.get("action_name") or "Unknown Intervention"
        grouped.setdefault(name, {"count": 0, "resolved": 0, "risk_drop": 0.0})
        grouped[name]["count"] += 1
        if case.get("status") == "resolved":
            grouped[name]["resolved"] += 1
        grouped[name]["risk_drop"] += float(case.get("expected_risk_reduction", 0.0))

    rows = []
    for name, agg in grouped.items():
        count = max(1, agg["count"])
        success = round((agg["resolved"] / count) * 100, 1)
        avg_drop = round(agg["risk_drop"] / count, 1)
        rows.append(
            {
                "intervention": name,
                "usage_count": agg["count"],
                "success_rate": success,
                "avg_risk_drop": avg_drop,
                "score": round((success * 0.65) + (avg_drop * 1.8), 1),
            }
        )
    rows = sorted(rows, key=lambda r: r["score"], reverse=True)
    return {
        "summary": "Playbook scoring ranks interventions by observed closure success and projected impact.",
        "rows": rows[:10],
    }


@app.get("/wow/guardian-communication/{reg_no:path}")
async def get_guardian_communication(reg_no: str, scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    audit = await audit_student_from_db(reg_no, scoped_dept)
    if "error" in audit:
        return audit
    profile = audit.get("student_profile", {})
    analysis = audit.get("ai_analysis", {})
    return {
        "reg_no": profile.get("reg_no"),
        "consent_required": True,
        "template": (
            f"Dear Guardian, this is an academic support notice for {profile.get('name')} "
            f"({profile.get('reg_no')}). Current status: {analysis.get('status')} at "
            f"{analysis.get('risk_probability')}% risk. Please support attendance and study-plan compliance over the next 14 days."
        ),
        "audit_trail_hint": "Store guardian consent reference before sending.",
    }


def build_explainability_factors(student: StudentData) -> list[dict]:
    factors = [
        {
            "name": "Attendance Drag",
            "value": student.Attendance,
            "weight": round(max(0.0, (75.0 - student.Attendance) / 75.0), 3),
            "direction": "risk_up" if student.Attendance < 75.0 else "risk_down",
            "insight": "Low attendance strongly reduces outcome reliability."
        },
        {
            "name": "GPA Cushion",
            "value": student.GPA,
            "weight": round(max(0.0, (2.8 - student.GPA) / 2.8), 3),
            "direction": "risk_up" if student.GPA < 2.8 else "risk_down",
            "insight": "Lower GPA narrows recovery capacity before final exams."
        },
        {
            "name": "Failure Load",
            "value": student.Failures,
            "weight": round(min(1.0, student.Failures * 0.35), 3),
            "direction": "risk_up" if student.Failures > 0 else "neutral",
            "insight": "Past failed units increase repeat-risk and confidence penalties."
        },
        {
            "name": "Study Momentum",
            "value": student.Study_Hours,
            "weight": round(max(0.0, (6.0 - student.Study_Hours) / 6.0), 3),
            "direction": "risk_up" if student.Study_Hours < 6.0 else "risk_down",
            "insight": "Insufficient weekly study hours correlate with weaker exam outcomes."
        }
    ]
    return sorted(factors, key=lambda item: item["weight"], reverse=True)


def recommend_interventions(student: StudentData, risk_probability: float) -> list[dict]:
    interventions = []

    if student.Attendance < 70.0:
        interventions.append({
            "name": "Attendance Recovery Contract",
            "priority": "critical",
            "expected_risk_reduction": 12,
            "owner": "Academic Advisor",
            "timeline_days": 7
        })
    if student.Failures >= 1:
        interventions.append({
            "name": "Targeted Remedial Clinic",
            "priority": "high",
            "expected_risk_reduction": 9,
            "owner": "Course Lecturer",
            "timeline_days": 10
        })
    if student.Study_Hours < 5.0:
        interventions.append({
            "name": "Guided Study Plan (+6 hrs/week)",
            "priority": "high",
            "expected_risk_reduction": 7,
            "owner": "Peer Mentor",
            "timeline_days": 14
        })
    if student.GPA < 2.5:
        interventions.append({
            "name": "Academic Probation Coaching",
            "priority": "medium",
            "expected_risk_reduction": 6,
            "owner": "CoD Office",
            "timeline_days": 14
        })

    if not interventions:
        interventions.append({
            "name": "Maintain Performance Check-In",
            "priority": "low",
            "expected_risk_reduction": 2,
            "owner": "Class Advisor",
            "timeline_days": 21
        })

    if risk_probability >= 80:
        escalation_level = "Level 3: Immediate CoD and guardian escalation"
    elif risk_probability >= 60:
        escalation_level = "Level 2: Advisor intervention within 48 hours"
    else:
        escalation_level = "Level 1: Routine advisor follow-up"

    return [{"escalation": escalation_level}] + interventions


def enrich_intervention_roi(action: dict, student: StudentData) -> dict:
    effort_hours = max(2, int(action.get("timeline_days", 7) * 1.5))
    expected_delta = float(action.get("expected_risk_reduction", 0.0))
    confidence = round(max(0.52, min(0.93, 0.55 + (expected_delta / 30.0))), 2)
    pass_lift = round(expected_delta * 0.65, 1)
    roi_score = round((expected_delta * confidence) / max(1.0, effort_hours / 6.0), 2)

    # Sensitivity simulates how strongly the recommendation depends on the current profile.
    profile_pressure = round(
        max(0.1, min(1.0, ((75 - student.Attendance) * 0.012) + (student.Failures * 0.18))), 2
    )

    enriched = dict(action)
    enriched.update(
        {
            "expected_pass_rate_lift": pass_lift,
            "effort_hours": effort_hours,
            "confidence": confidence,
            "roi_score": roi_score,
            "sensitivity": profile_pressure,
        }
    )
    return enriched


def explainability_delta(reg_no: str, latest: list[dict]) -> list[dict]:
    previous = EXPLAINABILITY_SNAPSHOTS.get(reg_no, [])
    prev_map = {item["name"]: item for item in previous}
    changes = []

    for factor in latest[:3]:
        prev_weight = float(prev_map.get(factor["name"], {}).get("weight", factor["weight"]))
        delta = round(float(factor["weight"]) - prev_weight, 3)
        if delta > 0:
            direction = "up"
            trend = "Risk pressure increased"
        elif delta < 0:
            direction = "down"
            trend = "Risk pressure reduced"
        else:
            direction = "flat"
            trend = "No material change"

        changes.append(
            {
                "name": factor["name"],
                "previous_weight": prev_weight,
                "current_weight": factor["weight"],
                "delta": delta,
                "direction": direction,
                "insight": trend,
            }
        )

    EXPLAINABILITY_SNAPSHOTS[reg_no] = latest
    save_workflow_store()
    return changes


def countdown_hours(due_at_iso: str) -> int:
    due_at = parse_iso(due_at_iso)
    return int((due_at - datetime.now(timezone.utc)).total_seconds() / 3600)


def impact_confidence_window(total_cases: int, resolved_cases: int) -> dict:
    if total_cases == 0:
        return {"confidence": 0.0, "window": "No intervention history yet"}
    completion = resolved_cases / total_cases
    confidence = round(max(0.4, min(0.97, 0.55 + completion * 0.35)), 2)
    if total_cases < 5:
        window = "Confidence window: narrow sample (collect more cycles)"
    elif total_cases < 15:
        window = "Confidence window: moderate sample"
    else:
        window = "Confidence window: robust sample"
    return {"confidence": confidence, "window": window}


def risk_band(risk_probability: float) -> str:
    if risk_probability >= 75:
        return "Critical"
    if risk_probability >= 50:
        return "High"
    if risk_probability >= 30:
        return "Moderate"
    return "Low"


def target_band_threshold(target_band: str) -> float:
    band = target_band.lower()
    if band == "low":
        return 29.0
    if band == "moderate":
        return 49.0
    if band == "high":
        return 74.0
    return 49.0


def clamp_percent(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 1)


def intervention_risk_proxy(
    attendance: float,
    score: float,
    gpa: float,
    failures: int,
    study_hours: float,
) -> float:
    # Stronger operational proxy so intervention changes are visible in demos and planning tools.
    risk = (
        (100.0 - attendance) * 0.55
        + (100.0 - score) * 0.22
        + max(0.0, 2.8 - gpa) * 17.0
        + failures * 8.5
        + max(0.0, 6.0 - study_hours) * 1.8
    )
    return round(max(0.0, min(100.0, risk)), 2)


# --- 0. SECURE AUTHENTICATION GATEWAY ---
@app.post("/auth/login")
async def login_system(creds: LoginCredentials):
    account = AUTH_ACCOUNTS.get(creds.username)
    if not account or creds.password != account["password"]:
        return {"status": "error", "message": "Invalid administrative credentials."}

    dept_scope = normalize_department(account.get("department_scope"))
    return {
        "status": "success",
        "role": account["role"],
        "name": account["name"],
        "token": f"mock-jwt-{creds.username}",
        "department_scope": dept_scope,
        "program_scope": DEPARTMENT_PROGRAM_MAP.get(dept_scope, []) if dept_scope else [],
        "portal_key": creds.username,
    }


# --- AFRICA'S TALKING SMS DISPATCHER ---
@app.post("/notify-student")
async def notify_student(req: SMSRequest):
    steps = req.intervention_steps[:3]
    steps_text = " | ".join([f"{idx + 1}) {step}" for idx, step in enumerate(steps)])
    if not steps_text:
        steps_text = "1) Meet your advisor. 2) Follow assigned study plan. 3) Weekly progress check-in."

    message = (
        f"MUST Early Warning: {req.reg_no} risk is {req.risk_probability}%. "
        f"Intervention Mode: {req.intervention_mode}. "
        f"Owner: {req.intervention_owner}. Expected review in {req.intervention_eta_days} days. "
        f"Student action plan -> {steps_text}"
    )
    try:
        if not sms:
            return {"status": "error", "message": "SMS not configured (AT_API_KEY missing)."}
        response = sms.send(message, [req.phone_number])
        return {"status": "success", "response": response, "message_preview": message}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# --- 1. PROACTIVE DEPARTMENT ALERT (WITH NULL SAFETY NET) ---
@app.get("/department-alert")
async def get_department_alerts(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    students_data = fetch_all_table_rows("students", "*")
    grades_data = fetch_all_table_rows("grades", "*")

    student_dict = {s['id']: s for s in students_data}
    grades_by_student = {}
    for g in grades_data:
        grades_by_student.setdefault(g["student_id"], []).append(g)

    grouped = {}
    for student_id, student_records in grades_by_student.items():
        student = student_dict.get(student_id)
        if not student:
            continue

        if not department_filter_passes(student.get("department"), scoped_dept):
            continue

        avg_attendance = round(
            sum(r["attendance_percent"] for r in student_records) / len(student_records),
            1,
        )
        fail_count = sum(1 for r in student_records if not r["is_passed"])
        if avg_attendance >= 70.0 and fail_count == 0:
            continue

        avg_score = round(sum(r["score"] for r in student_records) / len(student_records), 1)
        avg_cat = round(sum(r["cat_score"] for r in student_records) / len(student_records), 1)
        suspicious, integrity = suspicion_score(student_records)

        dept = student.get('department')
        if not dept or dept == "null":
            dept = "Unassigned / General Registry"

        if dept not in grouped:
            grouped[dept] = []

        grouped[dept].append({
            "reg_no": student['student_number'],
            "gpa": round((avg_score / 100) * 4.0, 2),
            "attendance": avg_attendance,
            "score": avg_cat,
            "failures": fail_count,
            "program": student.get("program") or "Unknown",
            "integrity_flag": "THIEF SUSPECT" if suspicious else "clean",
            "integrity_span": integrity["score_span"],
        })

    for dept in grouped:
        grouped[dept] = sorted(
            grouped[dept],
            key=lambda row: (
                row["integrity_flag"] == "THIEF SUSPECT",
                row["failures"],
                -row["attendance"],
            ),
            reverse=True,
        )[:8]

    return {
        "total_alerts": sum(len(v) for v in grouped.values()),
        "grouped_alerts": grouped
    }


# --- 2. THE REGISTRY SEARCH ENDPOINT ---
@app.get("/database-audit/{reg_no:path}")
async def audit_student_from_db(reg_no: str, scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    student = _student_by_reg(reg_no)
    if not student:
        return {"error": f"Student {reg_no} not found in the SCI Registry."}

    if not department_filter_passes(student.get("department"), scoped_dept):
        return {"error": f"Student {reg_no} is outside your department scope."}

    records = _grades_for_student(student['id'])
    if not records:
        return {"error": f"No academic records found for {reg_no}."}

    compiled_data = build_student_metrics(student, records)

    ai_report = await predict_student_risk(compiled_data)
    context_block = build_student_ai_context(student, compiled_data)
    ai_report["ai_advisor_summary"] = (
        f"{context_block}\n\n"
        f"{ai_report.get('ai_advisor_summary', '').strip()}"
    ).strip()

    return {
        "student_profile": {
            "name": f"{student['first_name']} {student['last_name']}",
            "reg_no": student['student_number'],
            "program": student['program'],
            "department": student.get('department') or "Unassigned"
        },
        "metrics": compiled_data.model_dump(),
        "ai_analysis": ai_report
    }


# --- 3. EXISTING: AI PREDICTION ENDPOINT (WITH OUTCOME FORECASTER) ---
@app.post("/predict-risk")
async def predict_student_risk(student: StudentData):
    input_df = pd.DataFrame([student.model_dump()])
    # Try to use the ML model when available, otherwise fall back to a proxy heuristic.
    if _PYCARET_AVAILABLE and risk_model is not None and predict_model is not None:
        try:
            predictions = predict_model(risk_model, data=input_df)
            model_confidence_pct = float(predictions.iloc[0].get('prediction_score', 0.0)) * 100.0
        except Exception as e:
            print(f"Prediction failed: {e}")
            model_confidence_pct = 0.0
    else:
        model_confidence_pct = 0.0

    proxy_risk_pct = intervention_risk_proxy(
        attendance=float(student.Attendance),
        score=float(student.Score),
        gpa=float(student.GPA),
        failures=int(student.Failures),
        study_hours=float(student.Study_Hours),
    )

    # Blend model confidence with intervention-sensitive proxy so changes are visible and realistic.
    blended_risk_pct = round((model_confidence_pct * 0.35) + (proxy_risk_pct * 0.65), 2)
    status = "At Risk" if blended_risk_pct >= 50.0 else "Safe"

    # --- FORECASTING ENGINE ---
    cat_out_of_30 = round((student.Score / 100) * 30, 1)

    attendance_factor = student.Attendance / 100.0
    gpa_factor = min(student.GPA / 4.0, 1.0)
    failure_penalty = student.Failures * 3

    predicted_exam_score = round((70 * ((attendance_factor * 0.6) + (gpa_factor * 0.4))) - failure_penalty, 1)
    predicted_exam_score = max(0.0, min(70.0, predicted_exam_score))

    total_forecast_score = round(cat_out_of_30 + predicted_exam_score)

    if total_forecast_score >= 70:
        forecasted_grade = "A"
    elif total_forecast_score >= 60:
        forecasted_grade = "B"
    elif total_forecast_score >= 50:
        forecasted_grade = "C"
    elif total_forecast_score >= 40:
        forecasted_grade = "D"
    else:
        forecasted_grade = "FAIL"

    reasons = []
    if student.Attendance < 75.0:
        reasons.append(f"🔴 Critical: Attendance is dangerously low ({student.Attendance}%).")
    if student.Failures > 0:
        reasons.append(f"🔴 Warning: History of {student.Failures} failed course(s) detected.")
    if student.GPA < 2.5:
        reasons.append(f"🟠 Warning: GPA of {student.GPA} is below the recommended safety threshold.")
    if student.Study_Hours < 5.0:
        reasons.append(f"🟡 Note: Low self-study engagement ({student.Study_Hours} hours/week).")

    prompt = f"""
    You are an expert AI Data Scientist presenting a high-priority risk report to the Chairperson of Department (CoD).

    Student Metrics: Academic Score {student.Score}/100, Attendance {student.Attendance}%, GPA {student.GPA}, Failures {student.Failures}, Study Hours {student.Study_Hours}/week.
    Forecasted Final Grade: {forecasted_grade} (Projected Total: {total_forecast_score}/100)
    AI Prediction: {status} ({blended_risk_pct}% risk probability).

    Structure your response into 3 short, punchy paragraphs:
    1. Executive Summary: State the student's current status and highlight their forecasted final grade of '{forecasted_grade}'. Do not invent metrics.
    2. Explainable AI Insights: Briefly explain why low attendance or past failures heavily impact the final predicted exam outcome.
    3. Suggested Intervention: Suggest a realistic university intervention and explicitly mention using the 'What-If Policy Simulator'.
    Keep every number exactly as provided in the prompt.
    """

    try:
        if not groq_client:
            raise RuntimeError("Groq client not initialized")
        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant",
            temperature=0.3,
            max_tokens=600
        )
        ai_advice = chat_completion.choices[0].message.content.strip()
    except Exception as e:
        ai_advice = f"Groq API Error: {str(e)}"

    return {
        "status": status,
        "risk_probability": blended_risk_pct,
        "explanation": reasons[:3],
        "ai_advisor_summary": ai_advice,
        "forecast": {
            "cat_score": cat_out_of_30,
            "exam_prediction": predicted_exam_score,
            "total_score": total_forecast_score,
            "grade": forecasted_grade
        }
    }


# --- 4. POLICY SIMULATOR ---
@app.post("/simulate-policy")
async def simulate_policy_change(student: StudentData, added_study_hours: float = 0.0):
    input_data = student.model_dump()

    orig_risk_pct = intervention_risk_proxy(
        attendance=float(input_data['Attendance']),
        score=float(input_data['Score']),
        gpa=float(input_data['GPA']),
        failures=int(input_data['Failures']),
        study_hours=float(input_data['Study_Hours']),
    )

    input_data['Study_Hours'] += added_study_hours
    input_data['Attendance'] = min(100.0, input_data['Attendance'] + (added_study_hours * 3.1))
    input_data['GPA'] = min(4.0, input_data['GPA'] + (added_study_hours * 0.08))
    input_data['Score'] = min(100.0, input_data['Score'] + (added_study_hours * 1.2))
    input_data['Failures'] = max(0, int(input_data['Failures']) - int(added_study_hours // 5))

    sim_risk_pct = intervention_risk_proxy(
        attendance=float(input_data['Attendance']),
        score=float(input_data['Score']),
        gpa=float(input_data['GPA']),
        failures=int(input_data['Failures']),
        study_hours=float(input_data['Study_Hours']),
    )

    reduction = orig_risk_pct - sim_risk_pct

    return {
        "original_risk_percent": round(orig_risk_pct, 2),
        "simulated_risk_percent": round(sim_risk_pct, 2),
        "policy_impact": f"Risk reduced by {round(reduction, 2)}%" if reduction > 0 else "No significant change.",
        "simulated_metrics": {
            "Attendance": round(float(input_data['Attendance']), 1),
            "GPA": round(float(input_data['GPA']), 2),
            "Score": round(float(input_data['Score']), 1),
            "Failures": int(input_data['Failures']),
            "Study_Hours": round(float(input_data['Study_Hours']), 1),
        },
    }


# --- 5. EXECUTIVE SUMMARY ---
@app.get("/executive-summary")
async def get_morning_briefing(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    students_data = fetch_all_table_rows("students", "id, department")
    scoped_students = [
        s for s in students_data if department_filter_passes(s.get("department"), scoped_dept)
    ]
    student_ids = {s["id"] for s in scoped_students}
    grades_data = fetch_all_table_rows("grades", "attendance_percent, score, is_passed, student_id")
    grades_data = [g for g in grades_data if g.get("student_id") in student_ids]

    total_students = len(scoped_students)

    if total_students == 0 or not grades_data:
        return {"title": "Daily Executive Briefing", "content": "Awaiting Database Initialization.", "metrics": {}}

    at_risk_count = sum(1 for g in grades_data if not g['is_passed'] or g['attendance_percent'] < 65.0)
    unique_at_risk_estimate = int(at_risk_count / 3)
    safe_rate = round(((total_students - unique_at_risk_estimate) / total_students) * 100, 1)
    avg_attendance = round(sum(g['attendance_percent'] for g in grades_data) / len(grades_data), 1)
    avg_score = round(sum(g['score'] for g in grades_data) / len(grades_data), 1)
    avg_gpa = round((avg_score / 100) * 4.0, 2)

    briefing = (
        f"The School of Computing is currently tracking {total_students} registered students across {len(grades_data)} active course units. "
        f"The overall SCI departmental safe rate is {safe_rate}%. "
        f"Currently, {unique_at_risk_estimate} students are flagged by the Early Warning System. "
        f"Average GPA is {avg_gpa}, with attendance averaging {avg_attendance}%."
    )

    return {
        "title": "Daily Executive Briefing",
        "content": briefing,
        "metrics": {"total_students": total_students, "safe_rate": safe_rate, "at_risk_count": unique_at_risk_estimate}
    }


# --- 6. DEAN'S STRATEGIC ANALYTICS ---
@app.get("/dean-analytics")
async def get_dean_analytics(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    students = fetch_all_table_rows("students", "id, department")
    grades = fetch_all_table_rows("grades", "student_id, attendance_percent, score, is_passed")

    if not students or not grades:
        return {"error": "Insufficient data for analytics."}

    scoped_students = [
        s for s in students if department_filter_passes(s.get("department"), scoped_dept)
    ]
    if not scoped_students:
        return {"error": "No scoped students found for analytics."}

    scoped_student_ids = {s["id"] for s in scoped_students}
    student_dept_map = {s['id']: s.get('department', 'Unknown') for s in scoped_students}
    dept_stats = {}

    for grade in grades:
        if grade["student_id"] not in scoped_student_ids:
            continue
        dept = student_dept_map.get(grade['student_id'])
        if not dept:
            continue

        if dept not in dept_stats:
            dept_stats[dept] = {
                "total_records": 0,
                "total_attendance": 0.0,
                "total_score": 0.0,
                "passed_records": 0
            }

        dept_stats[dept]["total_records"] += 1
        dept_stats[dept]["total_attendance"] += grade['attendance_percent']
        dept_stats[dept]["total_score"] += grade['score']
        if grade['is_passed']:
            dept_stats[dept]["passed_records"] += 1

    analytics_result = {}
    for dept, stats in dept_stats.items():
        total = stats["total_records"]
        if total > 0:
            analytics_result[dept] = {
                "avg_attendance": round(stats["total_attendance"] / total, 1),
                "avg_score": round(stats["total_score"] / total, 1),
                "pass_rate": round((stats["passed_records"] / total) * 100, 1)
            }

    return analytics_result


@app.get("/wow/student-digital-twin/{reg_no:path}")
async def get_student_digital_twin(reg_no: str, scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    student = _student_by_reg(reg_no)
    if not student:
        return {"error": f"Student {reg_no} not found."}

    if not department_filter_passes(student.get("department"), scoped_dept):
        return {"error": f"Student {reg_no} is outside your department scope."}

    grades = _grades_for_student(student['id'])
    if not grades:
        return {"error": f"No grade history found for {reg_no}."}

    metrics = build_student_metrics(student, grades)
    ai_analysis = await predict_student_risk(metrics)
    factors = build_explainability_factors(metrics)
    interventions = recommend_interventions(metrics, ai_analysis["risk_probability"])
    ranked_actions = [
        enrich_intervention_roi(action, metrics)
        for action in interventions
        if "name" in action
    ]
    ranked_actions = sorted(ranked_actions, key=lambda row: row["roi_score"], reverse=True)
    explainability_changes = explainability_delta(reg_no, factors)

    semester_points = []
    grouped = {}
    for row in grades:
        semester = row.get("semester", "N/A")
        grouped.setdefault(semester, []).append(row)

    for semester, rows in grouped.items():
        avg_att = round(sum(r["attendance_percent"] for r in rows) / len(rows), 1)
        avg_score = round(sum(r["score"] for r in rows) / len(rows), 1)
        sem_risk = round(max(0.0, min(100.0, 100 - ((avg_att * 0.45) + (avg_score * 0.55)))), 1)
        semester_points.append({
            "semester": semester,
            "attendance": avg_att,
            "score": avg_score,
            "risk_proxy": sem_risk
        })

    semester_points = sorted(semester_points, key=lambda x: x["semester"])

    return {
        "student": {
            "name": f"{student['first_name']} {student['last_name']}",
            "reg_no": student['student_number'],
            "department": student.get("department") or "Unassigned",
            "program": student.get("program") or "Unknown"
        },
        "risk": {
            "probability": ai_analysis["risk_probability"],
            "status": ai_analysis["status"],
            "band": risk_band(ai_analysis["risk_probability"])
        },
        "metrics": metrics.model_dump(),
        "top_factors": factors[:4],
        "top_reasons_v2": [
            {
                "reason": item["name"],
                "arrow": "up" if item["direction"] == "risk_up" else "down",
                "sensitivity": round(max(0.1, min(1.0, float(item["weight"]) + 0.08)), 2),
                "insight": item["insight"],
            }
            for item in factors[:3]
        ],
        "changes_since_last_review": explainability_changes,
        "recommended_actions": [{"escalation": interventions[0]["escalation"]}] + ranked_actions,
        "trajectory": semester_points
    }


@app.get("/wow/case-brief/{reg_no:path}")
async def get_case_brief(reg_no: str, scope_department: str | None = None):
    twin = await get_student_digital_twin(reg_no, scope_department)
    if "error" in twin:
        return twin

    actions = [a for a in twin["recommended_actions"] if "name" in a]
    action_lines = "\n".join(
        [f"- {a['name']} | Priority: {a['priority']} | Owner: {a['owner']} | ETA: {a['timeline_days']} days" for a in actions]
    )

    top_factors = "\n".join(
        [f"- {f['name']}: {f['insight']} (weight {f['weight']})" for f in twin["top_factors"]]
    )

    brief_text = (
        f"CASE BRIEF - {twin['student']['name']} ({twin['student']['reg_no']})\n"
        f"Department: {twin['student']['department']} | Program: {twin['student']['program']}\n"
        f"Current Risk: {twin['risk']['status']} ({twin['risk']['probability']}%) - {twin['risk']['band']}\n\n"
        f"Top Explainability Factors\n{top_factors}\n\n"
        f"Recommended Intervention Plan\n{action_lines}\n"
    )

    return {
        "student": twin["student"],
        "risk": twin["risk"],
        "brief_text": brief_text,
        "top_factors": twin["top_factors"],
        "recommended_actions": twin["recommended_actions"]
    }


@app.get("/wow/explainability-v2/{reg_no:path}")
async def get_explainability_v2(reg_no: str, scope_department: str | None = None):
    twin = await get_student_digital_twin(reg_no, scope_department)
    if "error" in twin:
        return twin

    reasons = twin.get("top_reasons_v2", [])
    changes = twin.get("changes_since_last_review", [])
    return {
        "student": twin["student"],
        "risk": twin["risk"],
        "top_reasons": reasons,
        "changes_since_last_review": changes,
        "trust_note": "Explainability panel compares current model drivers against previous review to avoid repeated decisions."
    }


@app.get("/wow/cohort-shock-detector")
async def get_cohort_shock_detector(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    students = fetch_all_table_rows("students", "id, department")
    grades = fetch_all_table_rows("grades", "student_id, attendance_percent, score, is_passed")

    if not students or not grades:
        return {"alerts": [], "summary": "Insufficient data for shock detection."}

    scoped_students = [
        s for s in students if department_filter_passes(s.get("department"), scoped_dept)
    ]
    scoped_ids = {s["id"] for s in scoped_students}
    student_dept = {s["id"]: s.get("department") or "Unassigned" for s in scoped_students}
    stats = {}
    for g in grades:
        if g["student_id"] not in scoped_ids:
            continue
        dept = student_dept.get(g["student_id"], "Unassigned")
        stats.setdefault(dept, {"count": 0, "att_sum": 0.0, "score_sum": 0.0, "failures": 0})
        stats[dept]["count"] += 1
        stats[dept]["att_sum"] += g["attendance_percent"]
        stats[dept]["score_sum"] += g["score"]
        if not g["is_passed"]:
            stats[dept]["failures"] += 1

    alerts = []
    for dept, s in stats.items():
        avg_att = round(s["att_sum"] / s["count"], 1)
        avg_score = round(s["score_sum"] / s["count"], 1)
        fail_rate = round((s["failures"] / s["count"]) * 100, 1)
        shock_index = round((max(0, 75 - avg_att) * 0.45) + (max(0, 60 - avg_score) * 0.35) + (fail_rate * 0.2), 1)
        status = "Normal"
        if shock_index >= 22:
            status = "Critical Shock"
        elif shock_index >= 12:
            status = "Early Shock"

        alerts.append({
            "department": dept,
            "avg_attendance": avg_att,
            "avg_score": avg_score,
            "fail_rate": fail_rate,
            "shock_index": shock_index,
            "status": status
        })

    alerts = sorted(alerts, key=lambda row: row["shock_index"], reverse=True)
    critical = sum(1 for row in alerts if row["status"] == "Critical Shock")

    return {
        "summary": f"Shock scan complete. {critical} departments are in critical shock state.",
        "alerts": alerts
    }


@app.get("/wow/risk-heatmap")
async def get_risk_heatmap(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    students = fetch_all_table_rows("students", "id, student_number, department")
    grades = fetch_all_table_rows("grades", "student_id, semester, attendance_percent, score, is_passed")

    if not students or not grades:
        return {"cells": [], "legend": {"low": "0-29", "moderate": "30-49", "high": "50-74", "critical": "75-100"}}

    scoped_students = [
        s for s in students if department_filter_passes(s.get("department"), scoped_dept)
    ]
    scoped_ids = {s["id"] for s in scoped_students}
    reg_map = {s["id"]: s["student_number"] for s in scoped_students}
    buckets = {}
    for g in grades:
        if g["student_id"] not in scoped_ids:
            continue
        reg = reg_map.get(g["student_id"], "UNKNOWN")
        semester = g.get("semester") or "N/A"
        key = (reg, semester)
        buckets.setdefault(key, []).append(g)

    cells = []
    for (reg, semester), rows in buckets.items():
        avg_att = sum(r["attendance_percent"] for r in rows) / len(rows)
        avg_score = sum(r["score"] for r in rows) / len(rows)
        fail_ratio = sum(1 for r in rows if not r["is_passed"]) / len(rows)
        risk = round(max(0.0, min(100.0, (100 - avg_att) * 0.45 + (100 - avg_score) * 0.4 + (fail_ratio * 100 * 0.15))), 1)

        if risk >= 75:
            band = "critical"
        elif risk >= 50:
            band = "high"
        elif risk >= 30:
            band = "moderate"
        else:
            band = "low"

        cells.append({"reg_no": reg, "semester": semester, "risk": risk, "band": band})

    cells = sorted(cells, key=lambda x: x["risk"], reverse=True)
    return {
        "cells": cells[:40],
        "legend": {"low": "0-29", "moderate": "30-49", "high": "50-74", "critical": "75-100"}
    }


@app.get("/wow/counterfactual-target/{reg_no:path}")
async def get_counterfactual_target(
    reg_no: str,
    target_band: str = "Moderate",
    scope_department: str | None = None,
):
    scoped_dept = normalize_department(scope_department)
    student = _student_by_reg(reg_no)
    if not student:
        return {"error": f"Student {reg_no} not found."}

    if not department_filter_passes(student.get("department"), scoped_dept):
        return {"error": f"Student {reg_no} is outside your department scope."}

    grades = _grades_for_student(student['id'])
    if not grades:
        return {"error": f"No grade history found for {reg_no}."}

    metrics = build_student_metrics(student, grades)
    current = await predict_student_risk(metrics)
    threshold = target_band_threshold(target_band)
    current_risk = float(current["risk_probability"])

    if current_risk <= threshold:
        return {
            "student": student["student_number"],
            "target_band": target_band,
            "current_risk": current_risk,
            "target_threshold": threshold,
            "already_achieved": True,
            "plan": [
                {
                    "step": "Maintain intervention cadence",
                    "impact": "Risk is already within target band.",
                    "owner": "Advisor",
                    "timeline_days": 14
                }
            ]
        }

    study_plan = None
    for hours in range(1, 16):
        sim = await simulate_policy_change(metrics, added_study_hours=float(hours))
        simulated = float(sim["simulated_risk_percent"])
        if simulated <= threshold:
            study_plan = {
                "added_study_hours": hours,
                "simulated_risk": simulated,
                "policy_impact": sim["policy_impact"]
            }
            break

    risk_gap = max(0.0, current_risk - threshold)
    attendance_lift = round(min(25.0, risk_gap / 1.8), 1)
    gpa_lift = round(min(1.2, risk_gap / 36.0), 2)

    projected_attendance = clamp_percent(metrics.Attendance + attendance_lift)
    projected_gpa = round(min(4.0, metrics.GPA + gpa_lift), 2)

    plan = [
        {
            "step": "Raise attendance compliance",
            "target": f"{projected_attendance}% attendance",
            "delta": f"+{attendance_lift}%",
            "owner": "Course Advisor",
            "timeline_days": 10
        },
        {
            "step": "Improve GPA trajectory",
            "target": f"GPA {projected_gpa}",
            "delta": f"+{gpa_lift}",
            "owner": "Academic Support Unit",
            "timeline_days": 21
        }
    ]

    if study_plan:
        plan.insert(
            0,
            {
                "step": "Guided study boost",
                "target": f"+{study_plan['added_study_hours']} study hours/week",
                "delta": f"Estimated risk {study_plan['simulated_risk']}%",
                "owner": "Mentorship Desk",
                "timeline_days": 7
            }
        )

    return {
        "student": student["student_number"],
        "target_band": target_band,
        "current_risk": current_risk,
        "target_threshold": threshold,
        "already_achieved": False,
        "recommended_plan": plan,
        "simulated_study_plan": study_plan,
        "narrative": f"Counterfactual planner estimates a {round(risk_gap,1)} point risk reduction is needed to reach {target_band} band."
    }


@app.post("/wow/advisor-queue")
async def create_workflow_case(req: WorkflowCaseCreate):
    case_id = str(uuid4())
    created_at = now_iso()
    due_at = (datetime.now(timezone.utc) + timedelta(days=req.due_days)).isoformat()
    case_department = get_student_department_by_reg(req.reg_no)

    WORKFLOW_CASES[case_id] = {
        "id": case_id,
        "reg_no": req.reg_no,
        "department": case_department,
        "action_name": req.action_name,
        "owner": req.owner,
        "priority": req.priority,
        "status": "new",
        "expected_risk_reduction": req.expected_risk_reduction,
        "expected_pass_lift": round(req.expected_risk_reduction * 0.65, 1),
        "created_at": created_at,
        "due_at": due_at,
        "updated_at": created_at,
        "notes": "",
        "justification": "",
        "timeline_days": req.due_days
    }

    WORKFLOW_HISTORY.append({
        "event_id": str(uuid4()),
        "case_id": case_id,
        "reg_no": req.reg_no,
        "timestamp": created_at,
        "role": "System",
        "action": "created_case",
        "old_state": "none",
        "new_state": "new",
        "notes": "Case created from intervention recommendation",
        "justification": "Initial intervention assignment"
    })
    save_workflow_store()

    return {"status": "success", "case": WORKFLOW_CASES[case_id]}


@app.get("/wow/advisor-queue")
async def get_workflow_queue(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    cases = [c for c in WORKFLOW_CASES.values() if case_matches_scope(c, scoped_dept)]
    cases = sorted(cases, key=lambda c: c["created_at"], reverse=True)
    grouped = derive_case_status_buckets(cases)
    high_risk = [c for c in cases if c["status"] != "resolved" and c["priority"] in {"high", "critical"}]
    likely_breach = [c for c in high_risk if countdown_hours(c["due_at"]) <= 48]
    return {
        "summary": {
            "total": len(cases),
            "new": len(grouped.get("new", [])),
            "in_progress": len(grouped.get("in_progress", [])),
            "resolved": len(grouped.get("resolved", [])),
            "likely_sla_breach_48h": len(likely_breach),
            "governance_events": len(WORKFLOW_HISTORY)
        },
        "grouped": grouped
    }


@app.put("/wow/advisor-queue/{case_id}")
async def update_workflow_case(case_id: str, req: WorkflowCaseUpdate):
    case = WORKFLOW_CASES.get(case_id)
    if not case:
        return {"error": "Case not found."}

    allowed = {"new", "in_progress", "resolved"}
    if req.status not in allowed:
        return {"error": "Invalid status."}
    if req.status == "resolved" and not req.justification.strip():
        return {"error": "Decision justification required before resolving a case."}
    if req.status == "resolved":
        evidence_text = (req.evidence_summary or req.notes or "").strip()
        if req.checklist_completed < 2 or len(evidence_text) < 24:
            return {
                "error": "Closure quality check failed: provide evidence summary and complete at least 2 checklist items."
            }

    previous_status = case["status"]
    case["status"] = req.status
    case["notes"] = req.notes or case["notes"]
    case["justification"] = req.justification or case.get("justification", "")
    case["evidence_summary"] = req.evidence_summary or case.get("evidence_summary", "")
    case["checklist_completed"] = max(case.get("checklist_completed", 0), req.checklist_completed)
    case["updated_at"] = now_iso()

    WORKFLOW_HISTORY.append({
        "event_id": str(uuid4()),
        "case_id": case_id,
        "reg_no": case["reg_no"],
        "timestamp": case["updated_at"],
        "role": req.actor_role,
        "action": "status_change",
        "old_state": previous_status,
        "new_state": req.status,
        "notes": req.notes,
        "justification": req.justification,
        "evidence_summary": req.evidence_summary,
        "checklist_completed": req.checklist_completed,
    })

    if req.status == "resolved" and previous_status != "resolved":
        WORKFLOW_HISTORY.append({
            "event_id": str(uuid4()),
            "case_id": case_id,
            "reg_no": case["reg_no"],
            "expected_risk_reduction": case["expected_risk_reduction"],
            "resolved_at": case["updated_at"],
            "role": req.actor_role,
            "action": "resolved_case",
            "old_state": previous_status,
            "new_state": "resolved",
            "notes": req.notes,
            "justification": req.justification,
            "timestamp": case["updated_at"],
        })

    save_workflow_store()

    return {"status": "success", "case": case}


@app.get("/wow/escalation-radar")
async def get_escalation_radar(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    cases = [c for c in WORKFLOW_CASES.values() if case_matches_scope(c, scoped_dept)]
    now = datetime.now(timezone.utc)
    radar = []

    for case in cases:
        if case["status"] == "resolved":
            continue
        due_at = parse_iso(case["due_at"])
        overdue_hours = int((now - due_at).total_seconds() / 3600)
        remaining_hours = countdown_hours(case["due_at"])
        if overdue_hours > 72:
            level = "Level 3"
            severity = "critical"
        elif overdue_hours > 24:
            level = "Level 2"
            severity = "high"
        elif overdue_hours > 0:
            level = "Level 1"
            severity = "warning"
        else:
            level = "On Track"
            severity = "normal"

        radar.append({
            "case_id": case["id"],
            "reg_no": case["reg_no"],
            "owner": case["owner"],
            "action": case["action_name"],
            "due_at": case["due_at"],
            "status": case["status"],
            "escalation": level,
            "severity": severity,
            "overdue_hours": max(0, overdue_hours),
            "countdown_hours": remaining_hours,
            "likely_breach_48h": case["priority"] in {"high", "critical"} and remaining_hours <= 48,
        })

    radar = sorted(radar, key=lambda r: (r["overdue_hours"], r["severity"]), reverse=True)
    breach_soon = sum(1 for r in radar if r["likely_breach_48h"])
    return {
        "summary": f"Escalation radar active. {sum(1 for r in radar if r['severity'] in {'high', 'critical'})} cases need urgent intervention.",
        "alerts": radar[:12],
        "sla_watch": {
            "likely_breach_48h": breach_soon,
            "message": f"{breach_soon} high-priority cases are likely to miss SLA within 48h."
        }
    }


@app.get("/wow/impact-panel")
async def get_impact_panel(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    scoped_cases = [c for c in WORKFLOW_CASES.values() if case_matches_scope(c, scoped_dept)]
    scoped_case_ids = {c["id"] for c in scoped_cases}

    total_cases = len(scoped_cases)
    resolved_cases = len([c for c in scoped_cases if c["status"] == "resolved"])
    in_progress_cases = len([c for c in scoped_cases if c["status"] == "in_progress"])
    completion_rate = round((resolved_cases / total_cases) * 100, 1) if total_cases else 0.0

    expected_total = round(sum(c["expected_risk_reduction"] for c in scoped_cases), 1)
    realized_total = round(
        sum(
            float(h.get("expected_risk_reduction", 0.0))
            for h in WORKFLOW_HISTORY
            if h.get("case_id") in scoped_case_ids
        ),
        1,
    )
    risk_delta_efficiency = round((realized_total / expected_total) * 100, 1) if expected_total else 0.0
    confidence_block = impact_confidence_window(total_cases, resolved_cases)

    trend_window = [
        {"label": "Week -3", "baseline": 71, "current": 69},
        {"label": "Week -2", "baseline": 70, "current": 63},
        {"label": "Week -1", "baseline": 69, "current": 58},
        {"label": "Current", "baseline": 68, "current": max(35, 68 - int(realized_total * 0.6))},
    ]

    return {
        "kpis": {
            "cases_total": total_cases,
            "cases_in_progress": in_progress_cases,
            "cases_resolved": resolved_cases,
            "completion_rate": completion_rate,
            "expected_risk_delta": expected_total,
            "realized_risk_delta": realized_total,
            "execution_efficiency": risk_delta_efficiency
        },
        "before_after": {
            "baseline_risk_proxy": 68,
            "current_risk_proxy": max(35, 68 - int(realized_total * 0.6)),
            "narrative": "Operational interventions are reducing projected departmental risk exposure as more cases close.",
            "confidence": confidence_block["confidence"],
            "confidence_window": confidence_block["window"],
            "trend_window": trend_window,
        },
    }


@app.get("/wow/impact-trend")
async def get_impact_trend(scope_department: str | None = None):
    panel = await get_impact_panel(scope_department)
    before_after = panel.get("before_after", {})
    return {
        "trend_window": before_after.get("trend_window", []),
        "confidence": before_after.get("confidence", 0.0),
        "confidence_window": before_after.get("confidence_window", "Unknown"),
    }


@app.get("/wow/war-room")
async def get_war_room_feed(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    cases = [c for c in WORKFLOW_CASES.values() if case_matches_scope(c, scoped_dept)]
    unresolved = [c for c in cases if c["status"] != "resolved"]
    unresolved = sorted(unresolved, key=lambda c: (c["priority"], c["due_at"]))

    lane_pressure = {
        "new": len([c for c in cases if c["status"] == "new"]),
        "in_progress": len([c for c in cases if c["status"] == "in_progress"]),
        "resolved": len([c for c in cases if c["status"] == "resolved"])
    }

    return {
        "headline": "War room synchronized. Prioritize critical unresolved interventions first.",
        "lane_pressure": lane_pressure,
        "urgent_cases": unresolved[:8]
    }


@app.get("/wow/governance-trail")
async def get_governance_trail(limit: int = 40, scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    scoped_case_ids = {
        c["id"] for c in WORKFLOW_CASES.values() if case_matches_scope(c, scoped_dept)
    }
    events = sorted(
        [
            e
            for e in WORKFLOW_HISTORY
            if e.get("timestamp") and (not scoped_dept or e.get("case_id") in scoped_case_ids)
        ],
        key=lambda row: row["timestamp"],
        reverse=True,
    )
    return {
        "summary": f"Immutable governance ledger contains {len(events)} events.",
        "events": events[:limit],
    }


@app.get("/wow/intervention-roi")
async def get_intervention_roi(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    actions = [
        c
        for c in WORKFLOW_CASES.values()
        if (c.get("status") != "resolved" or c.get("expected_risk_reduction", 0) > 0)
        and case_matches_scope(c, scoped_dept)
    ]
    if not actions:
        return {"summary": "No interventions available yet.", "rows": []}

    rows = []
    for c in actions:
        effort = max(2, int(c.get("timeline_days", 7) * 1.5))
        delta = float(c.get("expected_risk_reduction", 0.0))
        confidence = round(max(0.52, min(0.93, 0.55 + delta / 30.0)), 2)
        rows.append(
            {
                "case_id": c["id"],
                "reg_no": c["reg_no"],
                "intervention": c["action_name"],
                "expected_pass_rate_lift": round(delta * 0.65, 1),
                "expected_risk_drop": round(delta, 1),
                "time_to_impact_days": c.get("timeline_days", 7),
                "effort_hours": effort,
                "confidence": confidence,
                "roi_score": round((delta * confidence) / max(1.0, effort / 6.0), 2),
                "priority": c.get("priority", "medium"),
                "status": c.get("status", "new"),
            }
        )

    rows = sorted(rows, key=lambda r: r["roi_score"], reverse=True)
    return {
        "summary": "ROI scorecard ranks intervention options by expected benefit vs effort.",
        "rows": rows[:12],
    }


@app.get("/wow/model-health")
async def get_model_health(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    students = fetch_all_table_rows("students", "id, department")
    scoped_ids = {
        s["id"]
        for s in students
        if department_filter_passes(s.get("department"), scoped_dept)
    }
    grades = fetch_all_table_rows("grades", "attendance_percent, cat_score, is_passed, score, student_id")
    grades = [g for g in grades if g.get("student_id") in scoped_ids]
    if not grades:
        return {"error": "Insufficient data for model health monitor."}

    attendance_avg = round(sum(g["attendance_percent"] for g in grades) / len(grades), 1)
    cat_avg = round(sum(g["cat_score"] for g in grades) / len(grades), 1)
    fail_rate = round((sum(1 for g in grades if not g["is_passed"]) / len(grades)) * 100, 1)

    attendance_drift = round(abs(attendance_avg - 74.0) / 74.0 * 100, 1)
    cat_drift = round(abs(cat_avg - 58.0) / 58.0 * 100, 1)
    fail_drift = round(abs(fail_rate - 18.0) / 18.0 * 100, 1)

    drift_index = round((attendance_drift * 0.35) + (cat_drift * 0.4) + (fail_drift * 0.25), 1)
    stability = round(max(0.0, min(100.0, 100 - drift_index)), 1)
    recommendation = "Monitor"
    if drift_index >= 22:
        recommendation = "Retrain model within 7 days"
    elif drift_index >= 12:
        recommendation = "Schedule recalibration review"

    return {
        "drift": {
            "attendance_drift": attendance_drift,
            "cat_drift": cat_drift,
            "failure_rate_drift": fail_drift,
            "drift_index": drift_index,
        },
        "prediction_stability": stability,
        "recommendation": recommendation,
    }


@app.get("/wow/dean-scenario-lab")
async def get_dean_scenario_lab(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    scenarios = [
        {"name": "Baseline", "intensity": 35, "semester_delta": [0, 0, 0, 0]},
        {"name": "Moderate", "intensity": 60, "semester_delta": [3, 5, 7, 8]},
        {"name": "Aggressive", "intensity": 85, "semester_delta": [5, 8, 11, 14]},
    ]
    return {
        "semesters": ["S1", "S2", "S3", "S4"],
        "scenarios": scenarios,
        "board_note": (
            f"{scoped_dept}: aggressive scenario yields strongest pass-rate delta but requires higher advising load."
            if scoped_dept
            else "Aggressive scenario yields strongest pass-rate delta but requires higher advising load."
        )
    }


@app.get("/wow/equity-lens")
async def get_equity_lens(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    students = fetch_all_table_rows("students", "id, department, program, year_of_study")
    grades = fetch_all_table_rows("grades", "student_id, attendance_percent, score, is_passed, semester")
    if not students or not grades:
        return {"summary": "Insufficient data for equity lens.", "rows": []}

    scoped_students = [
        s for s in students if department_filter_passes(s.get("department"), scoped_dept)
    ]
    meta = {s["id"]: s for s in scoped_students}
    groups = {}
    for g in grades:
        m = meta.get(g["student_id"])
        if not m:
            continue
        key = (
            m.get("department") or "Unassigned",
            m.get("program") or "Unknown",
            str(g.get("semester") or "N/A"),
        )
        groups.setdefault(key, {"count": 0, "risk_sum": 0.0, "pass": 0})
        proxy_risk = max(0.0, min(100.0, 100 - ((g["attendance_percent"] * 0.45) + (g["score"] * 0.55))))
        groups[key]["count"] += 1
        groups[key]["risk_sum"] += proxy_risk
        if g["is_passed"]:
            groups[key]["pass"] += 1

    rows = []
    for (dept, program, semester), agg in groups.items():
        avg_risk = round(agg["risk_sum"] / agg["count"], 1)
        pass_rate = round((agg["pass"] / agg["count"]) * 100, 1)
        fairness_flag = "watch" if avg_risk >= 55 and pass_rate <= 55 else "balanced"
        rows.append(
            {
                "department": dept,
                "program": program,
                "semester": semester,
                "avg_risk": avg_risk,
                "pass_rate": pass_rate,
                "fairness_flag": fairness_flag,
            }
        )

    rows = sorted(rows, key=lambda r: (r["fairness_flag"], r["avg_risk"]), reverse=True)
    watch_count = sum(1 for r in rows if r["fairness_flag"] == "watch")
    return {
        "summary": f"Equity lens active. {watch_count} cohort slices may be over-targeted and require fairness review.",
        "rows": rows[:20],
    }


@app.get("/wow/academic-integrity-watch")
async def get_academic_integrity_watch(scope_department: str | None = None, limit: int = 20):
    scoped_dept = normalize_department(scope_department)
    students = fetch_all_table_rows(
        "students",
        "id, student_number, first_name, last_name, department, program",
    )
    grades = fetch_all_table_rows(
        "grades",
        "student_id, score, is_passed, semester, attendance_percent",
    )
    if not students or not grades:
        return {"summary": "Insufficient data for integrity watch.", "rows": []}

    scoped_students = [
        s for s in students if department_filter_passes(s.get("department"), scoped_dept)
    ]
    meta = {s["id"]: s for s in scoped_students}
    grade_map = {}
    for g in grades:
        if g.get("student_id") not in meta:
            continue
        grade_map.setdefault(g["student_id"], []).append(g)

    rows = []
    for sid, records in grade_map.items():
        suspicious, integrity = suspicion_score(records)
        if not suspicious:
            continue
        student = meta[sid]
        rows.append(
            {
                "reg_no": student["student_number"],
                "name": f"{student.get('first_name', '')} {student.get('last_name', '')}".strip(),
                "department": student.get("department") or "Unassigned",
                "program": student.get("program") or "Unknown",
                "flag": "THIEF SUSPECT",
                "score_span": integrity["score_span"],
                "high_mark": integrity["high_mark"],
                "low_mark": integrity["low_mark"],
                "avg_attendance": integrity["avg_attendance"],
                "note": "Unusual mark spread detected: very high in one unit and very low in others.",
            }
        )

    rows = sorted(rows, key=lambda r: r["score_span"], reverse=True)
    return {
        "summary": f"Integrity watch flagged {len(rows)} suspicious performance profiles.",
        "rows": rows[:limit],
    }


@app.get("/wow/executive-brief")
async def get_executive_brief(scope_department: str | None = None):
    impact = await get_impact_panel(scope_department)
    radar = await get_escalation_radar(scope_department)
    roi = await get_intervention_roi(scope_department)
    model_health = await get_model_health(scope_department)

    top_actions = roi.get("rows", [])[:3]
    action_lines = "\n".join(
        [
            f"- {a['intervention']} ({a['reg_no']}): ROI {a['roi_score']}, risk drop {a['expected_risk_drop']}% in {a['time_to_impact_days']}d"
            for a in top_actions
        ]
    ) or "- No active interventions to rank yet"

    memo_text = (
        "DEAN ACTION MEMO\n"
        f"Timestamp: {now_iso()}\n\n"
        "Top Risks\n"
        f"- {radar.get('summary', 'Radar unavailable')}\n\n"
        "Recommended Actions\n"
        f"{action_lines}\n\n"
        "Expected Impact\n"
        f"- Execution efficiency: {impact.get('kpis', {}).get('execution_efficiency', 0)}%\n"
        f"- Current risk proxy: {impact.get('before_after', {}).get('current_risk_proxy', '--')}\n"
        f"- Confidence: {impact.get('before_after', {}).get('confidence', 0)}\n\n"
        "Unresolved Blockers\n"
        f"- SLA watch: {radar.get('sla_watch', {}).get('message', 'Unavailable')}\n"
        f"- Model health recommendation: {model_health.get('recommendation', 'Review unavailable')}\n"
    )

    return {
        "memo_text": memo_text,
        "headline": "One-click executive brief generated.",
        "email_subject": "SCI Intervention Intelligence Brief",
    }


@app.get("/wow/sla-intelligence")
async def get_sla_intelligence(scope_department: str | None = None):
    scoped_dept = normalize_department(scope_department)
    active = [
        c
        for c in WORKFLOW_CASES.values()
        if c.get("status") != "resolved" and case_matches_scope(c, scoped_dept)
    ]
    rows = []
    for case in active:
        hours_left = countdown_hours(case["due_at"])
        rows.append(
            {
                "case_id": case["id"],
                "reg_no": case["reg_no"],
                "priority": case["priority"],
                "hours_left": hours_left,
                "at_risk": case["priority"] in {"high", "critical"} and hours_left <= 48,
            }
        )

    rows = sorted(rows, key=lambda r: r["hours_left"])
    return {
        "summary": f"SLA monitor tracking {len(rows)} active cases.",
        "likely_breach_48h": sum(1 for r in rows if r["at_risk"]),
        "rows": rows[:15],
    }


@app.get("/wow/live-notifications")
async def get_live_notifications(limit: int = 10, scope_department: str | None = None):
    notifications = []

    queue = await get_workflow_queue(scope_department)
    sla = await get_sla_intelligence(scope_department)
    radar = await get_escalation_radar(scope_department)
    model_health = await get_model_health(scope_department)

    if queue.get("summary", {}).get("new", 0) > 0:
        notifications.append(
            {
                "type": "workflow",
                "severity": "info",
                "title": "New intervention cases waiting",
                "message": f"{queue['summary']['new']} cases are in New lane and need owner assignment.",
                "timestamp": now_iso(),
            }
        )

    breach = sla.get("likely_breach_48h", 0)
    if breach > 0:
        notifications.append(
            {
                "type": "sla",
                "severity": "high",
                "title": "SLA breach risk detected",
                "message": f"{breach} high-priority cases may miss SLA in the next 48 hours.",
                "timestamp": now_iso(),
            }
        )

    urgent = sum(1 for r in radar.get("alerts", []) if r.get("severity") in {"high", "critical"})
    if urgent > 0:
        notifications.append(
            {
                "type": "escalation",
                "severity": "critical",
                "title": "Urgent escalation queue",
                "message": f"{urgent} cases are flagged high or critical by escalation radar.",
                "timestamp": now_iso(),
            }
        )

    drift_index = model_health.get("drift", {}).get("drift_index", 0)
    if drift_index >= 12:
        notifications.append(
            {
                "type": "model",
                "severity": "warning",
                "title": "Model drift requires review",
                "message": f"Drift index is {drift_index}; recommendation: {model_health.get('recommendation', 'Review')}",
                "timestamp": now_iso(),
            }
        )

    recent_events = sorted(
        [e for e in WORKFLOW_HISTORY if e.get("timestamp")],
        key=lambda row: row["timestamp"],
        reverse=True,
    )[:2]
    for ev in recent_events:
        notifications.append(
            {
                "type": "governance",
                "severity": "info",
                "title": "Governance event captured",
                "message": f"{ev.get('role', 'System')} moved {ev.get('reg_no', 'case')} from {ev.get('old_state', 'n/a')} to {ev.get('new_state', 'n/a')}.",
                "timestamp": ev.get("timestamp", now_iso()),
            }
        )

    if not notifications:
        notifications.append(
            {
                "type": "system",
                "severity": "info",
                "title": "System stable",
                "message": "No urgent alerts. Monitoring continues in real time.",
                "timestamp": now_iso(),
            }
        )

    return {
        "count": len(notifications),
        "items": notifications[:limit],
    }

# Seed mock data if database is unavailable
_check_and_seed_mock_data()

if __name__ == "__main__":
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)