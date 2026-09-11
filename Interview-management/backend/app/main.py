from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from app.config import settings
from app.routers import admin, audit, availability, candidates, feedback, interviews, panels, reports, requisitions

app = FastAPI(
    title="Interview Management API",
    version="0.1.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Idempotency-Key"],
)

app.include_router(candidates.router)
app.include_router(requisitions.router)
app.include_router(interviews.router)
app.include_router(feedback.router)
app.include_router(availability.router)
app.include_router(panels.router)
app.include_router(reports.router)
app.include_router(admin.router)
app.include_router(audit.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "env": settings.env}


handler = Mangum(app)
