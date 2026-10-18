
import secrets
import string
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_tutor
from database import students_collection

router = APIRouter(prefix="/students", tags=["Students"])


class StudentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    grade: str = Field(min_length=1, max_length=30)
    subjects: list[str] = Field(min_length=1, max_length=20)


class StudentUpdate(StudentCreate):
    pass


class GradeAssessment(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    grade: float = Field(ge=0, le=100)
    weight: float = Field(gt=0, le=100)


class StudentGrades(BaseModel):
    assessments: list[GradeAssessment] = Field(min_length=1, max_length=8)


def make_student_code():
    alphabet = string.ascii_uppercase + string.digits
    return "STU-" + "".join(
        secrets.choice(alphabet) for _ in range(5)
    )


def serialize_student(student):
    return {
        "id": str(student["_id"]),
        "code": student["code"],
        "name": student["name"],
        "grade": student["grade"],
        "subjects": student["subjects"],
        "final_mark": student.get("final_mark"),
        "grade_assessments": student.get("grade_assessments", []),
        "created_at": student["created_at"].isoformat(),
    }


@router.post("")
async def create_student(
    data: StudentCreate,
    current_tutor: dict = Depends(get_current_tutor),
):
    name = data.name.strip()
    grade = data.grade.strip()
    subjects = [subject.strip() for subject in data.subjects if subject.strip()]

    if not name or not grade or not subjects:
        raise HTTPException(
            status_code=400,
            detail="Name, grade, and at least one subject are required.",
        )

    # Retry if the randomly generated code already exists.
    for _ in range(10):
        code = make_student_code()
        existing = await students_collection.find_one({"code": code})
        if not existing:
            break
    else:
        raise HTTPException(
            status_code=500,
            detail="Could not generate a unique student code.",
        )

    student = {
        "tutor_id": current_tutor["id"],
        "code": code,
        "name": name,
        "grade": grade,
        "subjects": subjects,
        "created_at": datetime.now(timezone.utc),
    }

    result = await students_collection.insert_one(student)
    student["_id"] = result.inserted_id

    return {"student": serialize_student(student)}


@router.get("")
async def list_students(
    current_tutor: dict = Depends(get_current_tutor),
):
    cursor = students_collection.find(
        {"tutor_id": current_tutor["id"]}
    ).sort("created_at", -1)

    students = []
    async for student in cursor:
        students.append(serialize_student(student))

    return {"students": students}


@router.put("/{student_id}")
async def update_student(
    student_id: str,
    data: StudentUpdate,
    current_tutor: dict = Depends(get_current_tutor),
):
    if not ObjectId.is_valid(student_id):
        raise HTTPException(status_code=400, detail="Invalid student ID.")

    name = data.name.strip()
    grade = data.grade.strip()
    subjects = [subject.strip() for subject in data.subjects if subject.strip()]

    if not name or not grade or not subjects:
        raise HTTPException(
            status_code=400,
            detail="Name, grade, and at least one subject are required.",
        )

    result = await students_collection.update_one(
        {
            "_id": ObjectId(student_id),
            "tutor_id": current_tutor["id"],
        },
        {
            "$set": {
                "name": name,
                "grade": grade,
                "subjects": subjects,
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Student not found.")

    student = await students_collection.find_one(
        {
            "_id": ObjectId(student_id),
            "tutor_id": current_tutor["id"],
        }
    )

    return {"student": serialize_student(student)}


@router.put("/{student_id}/grades")
async def save_student_grades(
    student_id: str,
    data: StudentGrades,
    current_tutor: dict = Depends(get_current_tutor),
):
    if not ObjectId.is_valid(student_id):
        raise HTTPException(status_code=400, detail="Invalid student ID.")

    assessments = [
        {
            "name": assessment.name.strip(),
            "grade": assessment.grade,
            "weight": assessment.weight,
        }
        for assessment in data.assessments
    ]

    if any(not assessment["name"] for assessment in assessments):
        raise HTTPException(
            status_code=400,
            detail="Each assessment needs a name.",
        )

    total_weight = sum(assessment["weight"] for assessment in assessments)
    final_mark = round(
        sum(
            assessment["grade"] * assessment["weight"]
            for assessment in assessments
        ) / total_weight,
        2,
    )

    result = await students_collection.update_one(
        {
            "_id": ObjectId(student_id),
            "tutor_id": current_tutor["id"],
        },
        {
            "$set": {
                "grade_assessments": assessments,
                "final_mark": final_mark,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Student not found.")

    student = await students_collection.find_one(
        {
            "_id": ObjectId(student_id),
            "tutor_id": current_tutor["id"],
        }
    )

    return {"student": serialize_student(student)}


@router.delete("/{student_id}")
async def delete_student(
    student_id: str,
    current_tutor: dict = Depends(get_current_tutor),
):
    if not ObjectId.is_valid(student_id):
        raise HTTPException(status_code=400, detail="Invalid student ID.")

    result = await students_collection.delete_one(
        {
            "_id": ObjectId(student_id),
            "tutor_id": current_tutor["id"],
        }
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Student not found.")

    return {"message": "Student deleted successfully."}
