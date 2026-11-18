"""
Main entry point for the Invoice Processing FastAPI Application.
"""
import logging
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.config import settings
from backend.app.db.session import init_db
from backend.app.routers.document_processing import router as document_router
from backend.app.routers.extraction import router as extraction_router
from backend.app.routers.invoices import router as invoices_router, target_router

# Configure root logger
log_level = logging.DEBUG if settings.DEBUG else logging.INFO
logging.basicConfig(
    level=log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("invoice_processor.main")

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Enterprise AI Invoice Processing & Document Intake Engine",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Enable CORS for frontend dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global unified error handler (Senior Backend Developer Standard)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, (HTTPException, StarletteHTTPException)):
        # Let FastAPI/Starlette handle standard HTTP exceptions (400, 404, 422, etc.)
        raise exc
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred during processing.",
                "details": str(exc) if settings.DEBUG else None
            }
        }
    )

# Auto-initialize database tables on module load
init_db()

# Register API Routers
app.include_router(document_router, prefix=settings.API_V1_PREFIX)
app.include_router(extraction_router, prefix=settings.API_V1_PREFIX)
app.include_router(invoices_router, prefix=settings.API_V1_PREFIX)
app.include_router(target_router, prefix=settings.API_V1_PREFIX)

# Optional static dashboard mounting if frontend is built
frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/dashboard", StaticFiles(directory=str(frontend_dist), html=True), name="frontend-dashboard")
    if (frontend_dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="frontend-assets")


@app.get("/", tags=["System"])
async def root():
    """Root info endpoint."""
    return {
        "app": settings.APP_NAME,
        "status": "online",
        "docs": "/docs",
        "endpoints": {
            "health": f"{settings.API_V1_PREFIX}/documents/health",
            "preprocess": f"{settings.API_V1_PREFIX}/documents/preprocess",
            "extract": f"{settings.API_V1_PREFIX}/extract",
            "invoices": f"{settings.API_V1_PREFIX}/invoices",
            "target_company": f"{settings.API_V1_PREFIX}/target-company/invoices",
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
