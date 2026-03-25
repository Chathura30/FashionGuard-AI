"""
Pydantic response models for API endpoints.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class QualityMetricsResponse(BaseModel):
    """Image quality metrics after watermarking."""
    psnr: float = Field(..., description="Peak Signal-to-Noise Ratio (dB)")
    ssim: float = Field(..., description="Structural Similarity Index")
    mse: float = Field(..., description="Mean Squared Error")
    max_diff: int = Field(..., description="Maximum pixel difference")
    watermark_invisible: bool = Field(..., description="Whether watermark meets invisibility threshold")
    quality_grade: str = Field(..., description="Quality grade: excellent, good, acceptable, poor")


class EmbeddingDetails(BaseModel):
    """Details about the embedding process."""
    dct_bits_embedded: int = Field(..., description="Bits embedded via DCT")
    lsb_bits_embedded: int = Field(..., description="Bits embedded via LSB")
    total_payload_bits: int = Field(..., description="Total payload bits")
    blocks_modified: Optional[int] = Field(None, description="Number of DCT blocks modified")


class EmbedResponse(BaseModel):
    """Response model for successful embedding."""
    success: bool = Field(..., description="Whether embedding succeeded")
    watermark_id: str = Field(..., description="Unique watermark identifier")
    image_base64: Optional[str] = Field(None, description="Base64-encoded watermarked image")
    quality: QualityMetricsResponse = Field(..., description="Quality metrics")
    embedding_details: EmbeddingDetails = Field(..., description="Embedding statistics")
    algorithm_version: str = Field(..., description="Watermark algorithm version")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")
    warnings: List[str] = Field(default_factory=list, description="Any warnings during embedding")


class PayloadResponse(BaseModel):
    """Extracted watermark payload."""
    version: int = Field(..., description="Watermark algorithm version")
    designer_id: str = Field(..., description="Designer's unique identifier")
    design_id: str = Field(..., description="Design's unique identifier")
    timestamp: int = Field(..., description="Embedding timestamp (Unix)")
    file_hash: str = Field(..., description="Original file hash prefix")
    crc: int = Field(..., description="Payload CRC32 checksum")


class ExtractResponse(BaseModel):
    """Response model for watermark extraction."""
    success: bool = Field(..., description="Whether extraction succeeded")
    watermark_found: bool = Field(..., description="Whether a watermark was detected")
    confidence: float = Field(..., description="Extraction confidence (0-1)")
    payload: Optional[PayloadResponse] = Field(None, description="Extracted payload if found")
    dct_confidence: float = Field(..., description="DCT layer extraction confidence")
    lsb_confidence: float = Field(..., description="LSB layer extraction confidence")
    errors_corrected: int = Field(..., description="Number of byte errors corrected by RS")
    warnings: List[str] = Field(default_factory=list, description="Any warnings during extraction")


class VerifyMatch(BaseModel):
    """Single verification match result."""
    design_id: str = Field(..., description="Matched design ID")
    designer_id: str = Field(..., description="Matched designer ID")
    confidence: float = Field(..., description="Match confidence")
    timestamp_match: bool = Field(..., description="Whether timestamp matches")
    integrity_valid: bool = Field(..., description="Whether CRC is valid")


class VerifyResponse(BaseModel):
    """Response for verification."""
    success: bool = Field(..., description="Whether verification succeeded")
    verified: bool = Field(..., description="Whether ownership was verified")
    matches_found: int = Field(..., description="Number of matching records")
    best_match: Optional[VerifyMatch] = Field(None, description="Best matching record")
    all_matches: List[VerifyMatch] = Field(default_factory=list, description="All matches")
    extracted_payload: Optional[PayloadResponse] = Field(None, description="Extracted payload")
    warnings: List[str] = Field(default_factory=list, description="Any warnings")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = Field(..., description="Service status: healthy, degraded, unhealthy")
    version: str = Field(..., description="Service version")
    algorithm_version: str = Field(..., description="Watermark algorithm version")
    uptime_seconds: float = Field(..., description="Service uptime in seconds")
    checks: Dict[str, bool] = Field(..., description="Individual health checks")


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
