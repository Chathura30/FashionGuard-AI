"""
Extract endpoint for watermark extraction.
"""
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional
from dataclasses import asdict

from ..models.responses import ExtractResponse, PayloadResponse
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
    max_size = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
    if len(contents) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Maximum size: {settings.MAX_IMAGE_SIZE_MB}MB"
        )

    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(
            status_code=400,
            detail="Invalid image format. Supported: PNG, JPEG"
        )

    return image


@router.post("/", response_model=ExtractResponse)
async def extract_watermark(
    image: UploadFile = File(..., description="Image to extract watermark from"),
    encryption_key: str = Form(..., description="Hex-encoded AES-256 decryption key"),
    expected_bits: Optional[int] = Form(None, description="Expected payload bits (optional)")
):
    """
    Extract and decrypt watermark from image.

    Process:
    1. Run perceptual analysis to locate watermark regions
    2. Extract DCT layer bits with majority voting
    3. Extract LSB layer bits
    4. Combine and apply error correction
    5. Decrypt payload
    6. Return payload with confidence score
    """
    # Validate inputs
    if len(encryption_key) != 64:
        raise HTTPException(status_code=400, detail="encryption_key must be 64 hex characters")

    # Read and validate image
    contents = await image.read()
    img = validate_image(contents)

    # Extract watermark
    try:
        result = watermark_service.extract(
            image=img,
            encryption_key=encryption_key,
            expected_bits=expected_bits
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

    # Build response
    payload_response = None
    if result.payload:
        payload_dict = asdict(result.payload)
        payload_response = PayloadResponse(**payload_dict)

    return ExtractResponse(
        success=result.success,
        watermark_found=result.watermark_found,
        confidence=result.confidence,
        payload=payload_response,
        dct_confidence=result.dct_confidence,
        lsb_confidence=result.lsb_confidence,
        errors_corrected=result.errors_corrected,
        warnings=result.warnings
    )
