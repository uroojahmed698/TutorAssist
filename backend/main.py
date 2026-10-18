
import base64
import httpx
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    Depends,
)
from auth import get_current_tutor
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.responses import StreamingResponse
import json
from report_storage import save_report
from database import reports_collection
from students import router as students_router

app = FastAPI()
app.include_router(students_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ReportRequest(BaseModel):
    teacher: str
    student: str
    grade: str
    subject: str
    topic: str
    strengths: str
    challenges: str
    next_steps: str



async def stream_ollama(
    path: str,
    payload: dict,
    timeout: float,
    failure_detail: str,
    report_metadata: dict | None = None,
):
    client = httpx.AsyncClient(timeout=timeout)

    try:
        request = client.build_request(
            "POST",
            f"http://localhost:11434{path}",
            json=payload,
        )
        response = await client.send(request, stream=True)
        response.raise_for_status()
    except httpx.RequestError:
        await client.aclose()
        raise HTTPException(
            status_code=503,
            detail="Could not connect to Ollama. Make sure it is running.",
        )
    except httpx.HTTPStatusError:
        await response.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail=failure_detail)

    async def response_lines():
        generated_text = ""
        generation_finished = False

        try:
            async for line in response.aiter_lines():
                if not line:
                    continue

                # Collect generated text while preserving the stream.
                try:
                    event = json.loads(line)

                    if path == "/api/generate":
                        generated_text += event.get("response", "")

                    if event.get("done") is True:
                        generation_finished = True

                except json.JSONDecodeError:
                    pass

                yield f"{line}\n"

            # Save only fully completed reports.
            if report_metadata and generation_finished:
                try:
                    await save_report({
                        **report_metadata,
                        "report": generated_text,
                    })
                except Exception:
                    # Avoid logging student information or credentials.
                    yield json.dumps({
                        "error": (
                            "The report was generated, but saving it "
                            "failed. Please try again."
                        )
                    }) + "\n"

        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(
        response_lines(),
        media_type="application/x-ndjson",
    )


@app.get("/")
def home():
    return {"message": "TutorPrep AI backend is running!"}


@app.post("/generate-report")
async def generate_report(
    data: ReportRequest,
    current_tutor: dict = Depends(get_current_tutor),
):
    prompt = f"""
You are a tutor, Write a clear, encouraging progress report for a student's parent.
Start the report with 'Dear Parent/Guardian, of {data.student},' and end with 'Sincerely, {data.teacher}'.
Use ONLY the information provided. Do not invent achievements,
grades, behaviour, or progress. If information is missing, leave
it out. Use a friendly, professional tone and short paragraphs.
Student: {data.student}
Grade: {data.grade}
Subject: {data.subject}
Topic covered: {data.topic}
Strengths observed: {data.strengths}
Areas needing practice: {data.challenges}
Recommended next steps: {data.next_steps}
Teacher: {data.teacher}


"""

    return await stream_ollama(
        "/api/generate",
        {
            "model": "llama3.2:1b",
            "prompt": prompt,
            "stream": True,
            "keep_alive": "30m",
        },
        timeout=180.0,
        failure_detail="Ollama could not generate the report.",
        report_metadata={
            "tutor_id": current_tutor["id"],
            "teacher": data.teacher,
            "student": data.student,
            "grade": data.grade,
            "subject": data.subject,
            "topic": data.topic,
            "strengths": data.strengths,
            "challenges": data.challenges,
            "next_steps": data.next_steps,
        },
    )


@app.post("/analyze-work")
async def analyze_work(
    images: list[UploadFile] = File(...),
    grade: str = Form(...),
    subject: str = Form(...),
    topic: str = Form(""),
    current_tutor: dict = Depends(get_current_tutor),
):
    if len(images) > 5:
        raise HTTPException(
            status_code=400,
            detail="Please upload no more than 5 images at a time.",
        )

    image_data = []

    for image in images:
        if not image.content_type or not image.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="Only image files can be uploaded.",
            )

        content = await image.read()

        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail=f"{image.filename} is larger than 10 MB.",
            )

        image_data.append(base64.b64encode(content).decode("utf-8"))

    if not image_data:
        raise HTTPException(
            status_code=400,
            detail="Please upload at least one image.",
        )

    prompt = f"""
Write a clear report for the tutor based of the images provided.
Use ONLY the information provided in the images. Do not invent achievements,
grades, behaviour, or progress. If information is missing, leave it out.
Include a summary of the student's strengths, areas needing practice, and recommended next steps.
Make it short and clear using a proffesional tone.
"""

    return await stream_ollama(
        "/api/chat",
        {
            "model": "qwen3-vl:2b",
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                    "images": image_data,
                }
            ],
            "stream": True,
            "keep_alive": "30m",
            "options": {
                "num_predict": 160,
                "temperature": 0.2,
            },
        },
        timeout=300.0,
        failure_detail=(
            "Ollama could not analyze the images. "
            "Check that qwen3-vl:2b is installed."
        ),
    )
    
@app.get("/my-reports")
async def get_my_reports(
    current_tutor: dict = Depends(get_current_tutor),
):
    cursor = reports_collection.find(
        {"tutor_id": current_tutor["id"]}
    ).sort("created_at", -1)

    reports = []

    async for report in cursor:
        reports.append({
            "id": str(report["_id"]),
            "student": report.get("student", ""),
            "grade": report.get("grade", ""),
            "subject": report.get("subject", ""),
            "topic": report.get("topic", ""),
            "report": report.get("report", ""),
            "created_at": report.get("created_at"),
        })

    return {"reports": reports}


@app.delete("/my-reports/{report_id}")
async def delete_my_report(
    report_id: str,
    current_tutor: dict = Depends(get_current_tutor),
):
    try:
        object_id = ObjectId(report_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid report ID.")

    result = await reports_collection.delete_one(
        {
            "_id": object_id,
            "tutor_id": current_tutor["id"],
        }
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Report not found.")

    return {"deleted": True}

