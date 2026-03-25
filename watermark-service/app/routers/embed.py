"""
Embed endpoint for watermark embedding.
"""
import base64
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from typing import Optional

from ..models.responses import EmbedResponse, QualityMetricsResponse, EmbeddingDetails
from ..services.hybrid_watermark import HybridWatermarkService
from ..config import settings

router = APIRouter()

# Initialize watermark service
watermark_service = HybridWatermarkService(
    dct_strength=settings.DCT_BASE_STRENGTH,
    lsb_depth=settings.LSB_BIT_DEPTH,
    redundancy=settings.REDUNDANCY_FACTOR,
    rs_symbols=settings.RS_ERROR_SYMBOLS,
    enable_ai=settings.ENABLE_AI_OPTIMIZATION
)


def validate_image(contents: bytes) -> np.ndarray:
    """Validate and decode image from bytes."""
    # Check size
    max_size = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
    if len(contents) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Maximum size: {settings.MAX_IMAGE_SIZE_MB}MB"
        )

    # Decode image
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(
            status_code=400,
            detail="Invalid image format. Supported: PNG, JPEG"
        )

    # Check dimensions
    height, width = image.shape[:2]
    if height > settings.MAX_IMAGE_DIMENSION or width > settings.MAX_IMAGE_DIMENSION:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Maximum dimension: {settings.MAX_IMAGE_DIMENSION}px"
        )

    if height < 64 or width < 64:
        raise HTTPException(
            status_code=400,
            detail="Image too small. Minimum dimension: 64px"
        )

    return image


@router.post("/", response_model=EmbedResponse)
async def embed_watermark(
    image: UploadFile = File(..., description="Image file to watermark (PNG/JPEG)"),
    designer_id: str = Form(..., description="Designer's unique identifier"),
    design_id: str = Form(..., description="Design's unique identifier"),
    file_hash: str = Form(..., description="SHA-256 hash of original file"),
    encryption_key: str = Form(..., description="Hex-encoded AES-256 key (64 chars)"),
    timestamp: Optional[int] = Form(None, description="Unix timestamp (optional)")
):
    """
    Embed invisible watermark into image.

    Process:
    1. Validate image format and size
    2. Run AI perceptual analysis
    3. Prepare and encrypt payload
    4. Apply DCT embedding (primary layer)
    5. Apply LSB embedding (secondary layer)
    6. Verify quality and return watermarked image
    """
    # Validate inputs
    if len(encryption_key) != 64:
        raise HTTPException(status_code=400, detail="encryption_key must be 64 hex characters")

    if len(file_hash) < 16:
        raise HTTPException(status_code=400, detail="file_hash must be at least 16 characters")

    # Read and validate image
    contents = await image.read()
    img = validate_image(contents)

    # Embed watermark
    try:
        result = watermark_service.embed(
            image=img,
            designer_id=designer_id,
            design_id=design_id,
            file_hash=file_hash,
            encryption_key=encryption_key,
            timestamp=timestamp
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")

    # Encode watermarked image to PNG
    _, buffer = cv2.imencode('.png', result.watermarked_image)
    image_base64 = base64.b64encode(buffer).decode('utf-8')

    return EmbedResponse(
        success=result.success,
        watermark_id=result.watermark_id,
        image_base64=image_base64,
        quality=QualityMetricsResponse(
            psnr=result.quality.psnr,
            ssim=result.quality.ssim,
            mse=result.quality.mse,
            max_diff=result.quality.max_diff,
            watermark_invisible=result.quality.watermark_invisible,
            quality_grade=result.quality.quality_grade
        ),
        embedding_details=EmbeddingDetails(
            dct_bits_embedded=result.dct_bits,
            lsb_bits_embedded=result.lsb_bits,
            total_payload_bits=result.total_payload_bits,
            blocks_modified=None
        ),
        algorithm_version="2.0-hybrid",
        processing_time_ms=result.processing_time_ms,
        warnings=result.warnings
    )


@router.post("/raw", responses={200: {"content": {"image/png": {}}}})
async def embed_watermark_raw(
    image: UploadFile = File(..., description="Image file to watermark"),
    designer_id: str = Form(...),
    design_id: str = Form(...),
    file_hash: str = Form(...),
    encryption_key: str = Form(...),
    timestamp: Optional[int] = Form(None)
):
    """
    Embed watermark and return raw image bytes.

    Optimized for direct streaming to Node.js backend.
    Returns PNG image with metadata in response headers.
    """
    # Validate inputs
    if len(encryption_key) != 64:
        raise HTTPException(status_code=400, detail="encryption_key must be 64 hex characters")

    # Read and validate image
    contents = await image.read()
    img = validate_image(contents)

    # Embed watermark
    try:
        result = watermark_service.embed(
            image=img,
            designer_id=designer_id,
            design_id=design_id,
            file_hash=file_hash,
            encryption_key=encryption_key,
            timestamp=timestamp
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")

    # Encode to PNG
    _, buffer = cv2.imencode('.png', result.watermarked_image)

    # Return with metadata headers
    import json
    quality_json = json.dumps({
        "psnr": result.quality.psnr,
        "ssim": result.quality.ssim,
        "invisible": result.quality.watermark_invisible
    })

    return Response(
        content=buffer.tobytes(),
        media_type="image/png",
        headers={
            "X-Watermark-ID": result.watermark_id,
            "X-Quality-Metrics": quality_json,
            "X-Processing-Time-Ms": str(result.processing_time_ms),
            "X-Success": str(result.success).lower()
        }
    )
