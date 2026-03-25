"""
Verify endpoint for ownership verification.
"""
import cv2
import json
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List
from dataclasses import asdict

from ..models.requests import OwnershipRecord
from ..models.responses import VerifyResponse, VerifyMatch, PayloadResponse
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


@router.post("/", response_model=VerifyResponse)
async def verify_ownership(
    image: UploadFile = File(..., description="Image to verify"),
    records: str = Form(..., description="JSON-encoded list of OwnershipRecord")
):
    """
    Verify image watermark against ownership records.

    Checks multiple records and returns best match based on:
    - Extraction confidence
    - Timestamp validity
    - Designer ID match
    - Hash integrity
    """
    # Parse records
    try:
        records_data = json.loads(records)
        if not isinstance(records_data, list):
            raise ValueError("records must be a list")
        ownership_records = [OwnershipRecord(**r) for r in records_data]
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in records")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid records format: {str(e)}")

    if len(ownership_records) == 0:
        raise HTTPException(status_code=400, detail="At least one ownership record required")

    if len(ownership_records) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 ownership records per request")

    # Read and validate image
    contents = await image.read()
    img = validate_image(contents)

    # Try each record
    matches: List[VerifyMatch] = []
    extracted_payload = None
    all_warnings = []

    for record in ownership_records:
        try:
            verified, confidence, details = watermark_service.verify(
                image=img,
                encryption_key=record.encryption_key,
                expected_designer_id=record.designer_id,
                expected_design_id=record.design_id
            )

            if details.get("warnings"):
                all_warnings.extend(details["warnings"])

            if verified and confidence >= settings.MIN_CONFIDENCE_THRESHOLD:
                payload_data = details.get("payload")

                # Store extracted payload from first successful extraction
                if extracted_payload is None and payload_data:
                    extracted_payload = PayloadResponse(**payload_data)

                # Check timestamp match if provided
                timestamp_match = True
                if record.timestamp and payload_data:
                    # Allow 1 hour tolerance
                    timestamp_match = abs(payload_data.get("timestamp", 0) - record.timestamp) < 3600

                # CRC validity
                integrity_valid = True
                if "CRC mismatch" in str(details.get("warnings", [])):
                    integrity_valid = False

                matches.append(VerifyMatch(
                    design_id=record.design_id,
                    designer_id=record.designer_id,
                    confidence=confidence,
                    timestamp_match=timestamp_match,
                    integrity_valid=integrity_valid
                ))

        except Exception as e:
            all_warnings.append(f"Record {record.design_id}: {str(e)}")
            continue

    # Sort matches by confidence
    matches.sort(key=lambda x: x.confidence, reverse=True)

    return VerifyResponse(
        success=True,
        verified=len(matches) > 0,
        matches_found=len(matches),
        best_match=matches[0] if matches else None,
        all_matches=matches,
        extracted_payload=extracted_payload,
        warnings=list(set(all_warnings))  # Deduplicate warnings
    )


@router.post("/single", response_model=VerifyResponse)
async def verify_single(
    image: UploadFile = File(..., description="Image to verify"),
    design_id: str = Form(..., description="Expected design ID"),
    designer_id: str = Form(..., description="Expected designer ID"),
    encryption_key: str = Form(..., description="Encryption key"),
    timestamp: int = Form(None, description="Expected timestamp (optional)")
):
    """
    Verify image against a single ownership record.

    Simplified endpoint for single-record verification.
    """
    # Validate key
    if len(encryption_key) != 64:
        raise HTTPException(status_code=400, detail="encryption_key must be 64 hex characters")

    # Read and validate image
    contents = await image.read()
    img = validate_image(contents)

    # Verify
    try:
        verified, confidence, details = watermark_service.verify(
            image=img,
            encryption_key=encryption_key,
            expected_designer_id=designer_id,
            expected_design_id=design_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")

    warnings = details.get("warnings", [])
    payload_data = details.get("payload")

    extracted_payload = None
    if payload_data:
        extracted_payload = PayloadResponse(**payload_data)

    match = None
    if verified and confidence >= settings.MIN_CONFIDENCE_THRESHOLD:
        timestamp_match = True
        if timestamp and payload_data:
            timestamp_match = abs(payload_data.get("timestamp", 0) - timestamp) < 3600

        integrity_valid = "CRC mismatch" not in str(warnings)

        match = VerifyMatch(
            design_id=design_id,
            designer_id=designer_id,
            confidence=confidence,
            timestamp_match=timestamp_match,
            integrity_valid=integrity_valid
        )

    return VerifyResponse(
        success=True,
        verified=match is not None,
        matches_found=1 if match else 0,
        best_match=match,
        all_matches=[match] if match else [],
        extracted_payload=extracted_payload,
        warnings=warnings
    )
