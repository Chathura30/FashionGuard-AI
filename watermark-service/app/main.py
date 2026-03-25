"""
FashionGuard Watermark Service
AI-powered invisible watermarking microservice using FastAPI.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import uvicorn

from .routers import embed_router, extract_router, verify_router, health_router
from .config import settings

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""
    # Startup
    logger.info("Starting FashionGuard Watermark Service")
    logger.info(f"AI Optimization: {'Enabled' if settings.ENABLE_AI_OPTIMIZATION else 'Disabled'}")
    logger.info(f"DCT Strength: {settings.DCT_BASE_STRENGTH}")
    logger.info(f"LSB Depth: {settings.LSB_BIT_DEPTH}")

    # Warm up OpenCV and NumPy
    import cv2
    import numpy as np
    test_img = np.zeros((64, 64, 3), dtype=np.uint8)
    _ = cv2.dct(test_img[:8, :8, 0].astype(np.float64))
    logger.info("OpenCV and NumPy initialized")

    yield

    # Shutdown
    logger.info("Shutting down FashionGuard Watermark Service")


# Create FastAPI application
app = FastAPI(
    title="FashionGuard Watermark Service",
    description="""
AI-powered invisible watermarking microservice for fashion design protection.

## Features
- **Hybrid DCT + LSB Watermarking**: Combines frequency domain and spatial domain techniques
- **AI Perceptual Optimization**: Intelligent watermark placement based on image content
- **Reed-Solomon Error Correction**: Robust payload recovery even with image modifications
- **AES-256-GCM Encryption**: Secure payload encryption

## Endpoints
- **POST /embed**: Embed watermark into image
- **POST /embed/raw**: Embed and return raw image bytes
- **POST /extract**: Extract watermark from image
- **POST /verify**: Verify ownership against records
- **GET /health**: Service health check
    """,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.NODEJS_BACKEND_URL, "http://localhost:5000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors with detailed messages."""
    errors = []
    for error in exc.errors():
        field = " -> ".join(str(loc) for loc in error["loc"])
        errors.append(f"{field}: {error['msg']}")

    return JSONResponse(
        status_code=422,
        content={
            "error": "Validation Error",
            "message": "Invalid request parameters",
            "details": errors
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected errors."""
    logger.exception(f"Unexpected error: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": str(exc)
        }
    )


# Include routers
app.include_router(health_router, prefix="/health", tags=["Health"])
app.include_router(embed_router, prefix="/embed", tags=["Embedding"])
app.include_router(extract_router, prefix="/extract", tags=["Extraction"])
app.include_router(verify_router, prefix="/verify", tags=["Verification"])


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with service information."""
    return {
        "service": "FashionGuard Watermark Service",
        "version": "1.0.0",
        "algorithm": "Hybrid DCT + LSB v2.0",
        "docs": "/docs",
        "health": "/health"
    }


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
