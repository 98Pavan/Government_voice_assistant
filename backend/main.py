
import os
import shutil
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="GovAssist API",
    description="Government scheme information assistant",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Demo records only. Replace with verified official scheme data.
SCHEMES = [
    {
        "id": "scheme-1",
        "name": "PM-KISAN",
        "category": "Agriculture",
        "description": (
            "Income-support scheme for eligible farmer families. "
            "Check current eligibility and payment details on the "
            "official government portal."
        ),
        "eligibility": "Depends on current official eligibility rules.",
        "official_url": "https://pmkisan.gov.in/",
    },
    {
        "id": "scheme-2",
        "name": "Ayushman Bharat PM-JAY",
        "category": "Healthcare",
        "description": (
            "Government health coverage programme for eligible "
            "beneficiaries. Confirm coverage using official sources."
        ),
        "eligibility": "Depends on beneficiary eligibility criteria.",
        "official_url": "https://pmjay.gov.in/",
    },
    {
        "id": "scheme-3",
        "name": "National Scholarship Portal",
        "category": "Education",
        "description": (
            "Portal for discovering and applying for participating "
            "government scholarship schemes."
        ),
        "eligibility": "Varies by scholarship and scheme.",
        "official_url": "https://scholarships.gov.in/",
    },
    {
        "id": "scheme-4",
        "name": "Pradhan Mantri Awas Yojana",
        "category": "Housing",
        "description": (
            "Housing assistance programmes. Check the relevant "
            "rural or urban programme and current eligibility."
        ),
        "eligibility": "Depends on programme and current rules.",
        "official_url": "https://pmay-urban.gov.in/",
    },
]


class AskRequest(BaseModel):
    question: str
    language: Optional[str] = "English"


def get_agent():
    """
    Optional Lyzr integration.
    The API still runs if Lyzr is not configured.
    """
    api_key = os.getenv("LYZR_API_KEY")

    if not api_key:
        return None

    try:
        from lyzr import Studio

        studio = Studio()
        return studio.create_agent(
            name="GovAssist",
            provider="gpt-4o",
            role="Government Scheme Information Assistant",
            goal=(
                "Help users understand government schemes using "
                "verified information and official links."
            ),
            instructions="""
            Answer clearly and cautiously.
            Do not invent eligibility criteria, benefits, deadlines,
            amounts, or application status.
            If information is missing or may have changed, say so.
            Direct users to the relevant official government website.
            Do not claim that a user is eligible without sufficient
            verified information.
            """,
        )
    except Exception as exc:
        print(f"Lyzr initialization failed: {exc}")
        return None


agent = get_agent()


@app.get("/")
def home():
    return {
        "message": "GovAssist API is running",
        "docs": "/docs",
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "agent_initialized": agent is not None,
    }


@app.get("/api/categories")
def get_categories():
    categories = sorted({scheme["category"] for scheme in SCHEMES})
    return {"categories": categories}


@app.get("/api/schemes")
def get_schemes(category: Optional[str] = None):
    if category:
        filtered = [
            scheme for scheme in SCHEMES
            if scheme["category"].lower() == category.lower()
        ]
    else:
        filtered = SCHEMES

    return {"schemes": filtered}


@app.get("/api/schemes/{scheme_id}")
def get_scheme(scheme_id: str):
    for scheme in SCHEMES:
        if scheme["id"] == scheme_id:
            return scheme

    raise HTTPException(status_code=404, detail="Scheme not found")



@app.post("/api/ask")
def ask_question(request: AskRequest):
    question = request.question.strip()
    language = (request.language or "English").strip()

    supported_languages = {
        "English": "English",
        "Telugu": "Telugu",
        "Hindi": "Hindi",
    }

    language = supported_languages.get(language, "English")

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Please enter a question.",
        )

    if agent is not None:
        try:
            prompt = f"""
            Answer the user's government scheme question in {language}.
            The user's question is:
            {question}

            Be clear and easy to understand.
            Do not invent eligibility criteria, benefit amounts,
            deadlines, or application status.
            Include official website links when relevant.
            If current details are uncertain, tell the user
            to verify them on the official government website.
            """
            result = agent.run(prompt)
            answer = getattr(result, "response", result)

            return {
                "answer": str(answer),
                "source": "AI assistant",
                "language": language,
            }
        except Exception as exc:
            print(f"Agent request failed: {exc}")

    # Fallback when Lyzr is not configured or unavailable.
    if language == "Telugu":
        answer = (
            "ప్రస్తుతం AI సేవ అందుబాటులో లేదు. వ్యవసాయం, ఆరోగ్యం, "
            "విద్య లేదా గృహ పథకం పేరు చెప్పండి. అర్హతలు, తాజా వివరాల "
            "కోసం అధికారిక ప్రభుత్వ వెబ్‌సైట్‌ను పరిశీలించండి."
        )
    elif language == "Hindi":
        answer = (
            "अभी AI सेवा उपलब्ध नहीं है। कृपया कृषि, स्वास्थ्य, "
            "शिक्षा या आवास योजना का नाम बताएं। पात्रता और नवीनतम "
            "जानकारी के लिए आधिकारिक सरकारी वेबसाइट देखें।"
        )
    else:
        answer = (
            "The AI service is not available right now. Ask about "
            "an agriculture, healthcare, education, or housing scheme. "
            "Please verify current eligibility on the official website."
        )

    return {
        "answer": answer,
        "source": "Fallback response",
        "language": language,
    }



@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file.",
        )

    safe_name = Path(file.filename).name
    destination = UPLOAD_DIR / safe_name

    try:
        with destination.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not save the PDF: {exc}",
        )
    finally:
        await file.close()

    return {
        "message": "PDF uploaded successfully.",
        "filename": safe_name,
        "note": (
            "The PDF is saved on the server. Its text has not yet "
            "been extracted or added to a searchable knowledge base."
        ),
    }
