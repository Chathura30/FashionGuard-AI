"""
Pydantic request models for API endpoints.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from enum import Enum


class ImageFormat(str, Enum):
    """Supported image formats."""
    PNG = "png"
    JPEG = "jpeg"
    JPG = "jpg"


class EmbedRequest(BaseModel):
    """Request model for watermark embedding."""
    designer_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Designer's unique identifier"
    )
    design_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Design's unique identifier"
    )
    file_hash: str = Field(
        ...,
        min_length=16,
        max_length=64,
        description="SHA-256 hash of original file (hex)"
    )
    timestamp: Optional[int] = Field(
        default=None,
        gt=0,
        description="Unix timestamp (defaults to current time)"
    )
    encryption_key: str = Field(
        ...,
        min_length=64,
        max_length=64,
        description="Hex-encoded AES-256 encryption key (64 hex chars)"
    )
    output_format: ImageFormat = Field(
        default=ImageFormat.PNG,
        description="Output image format"
    )

    @field_validator('file_hash')
    @classmethod
    def validate_hex_hash(cls, v: str) -> str:
        """Validate hash is hexadecimal."""
        if not all(c in '0123456789abcdefABCDEF' for c in v):
            raise ValueError('file_hash must be hexadecimal')
        return v.lower()

    @field_validator('encryption_key')
    @classmethod
    def validate_hex_key(cls, v: str) -> str:
        """Validate key is hexadecimal."""
        if not all(c in '0123456789abcdefABCDEF' for c in v):
            raise ValueError('encryption_key must be hexadecimal')
        return v.lower()


class ExtractRequest(BaseModel):
    """Request model for watermark extraction."""
    encryption_key: str = Field(
        ...,
        min_length=64,
        max_length=64,
        description="Hex-encoded AES-256 decryption key"
    )
    expected_bits: Optional[int] = Field(
        default=None,
        gt=0,
        le=10000,
        description="Expected number of payload bits (for optimization)"
    )

    @field_validator('encryption_key')
    @classmethod
    def validate_hex_key(cls, v: str) -> str:
        """Validate key is hexadecimal."""
        if not all(c in '0123456789abcdefABCDEF' for c in v):
            raise ValueError('encryption_key must be hexadecimal')
        return v.lower()


class OwnershipRecord(BaseModel):
    """Ownership record for verification."""
    design_id: str = Field(..., description="Design unique identifier")
    designer_id: str = Field(..., description="Designer unique identifier")
    encryption_key: str = Field(..., description="Encryption key for this design")
    timestamp: Optional[int] = Field(default=None, description="Expected timestamp")

    @field_validator('encryption_key')
    @classmethod
    def validate_hex_key(cls, v: str) -> str:
        """Validate key is hexadecimal."""
        if not all(c in '0123456789abcdefABCDEF' for c in v):
            raise ValueError('encryption_key must be hexadecimal')
        return v.lower()


class VerifyRequest(BaseModel):
    """Request for batch verification against multiple records."""
    records: List[OwnershipRecord] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="List of ownership records to verify against"
    )


class EmbedSettings(BaseModel):
    """Optional embedding settings for fine-tuning."""
    dct_strength: float = Field(
        default=25.0,
        ge=10.0,
        le=50.0,
        description="DCT embedding strength"
    )
    lsb_depth: int = Field(
        default=2,
        ge=1,
        le=4,
        description="LSB bit depth per pixel"
    )
    redundancy: int = Field(
        default=3,
        ge=1,
        le=5,
        description="Redundancy factor for error tolerance"
    )
    enable_ai_optimization: bool = Field(
        default=True,
        description="Enable AI-based perceptual optimization"
    )
    target_psnr: float = Field(
        default=40.0,
        ge=30.0,
        le=60.0,
        description="Target PSNR for quality validation"
    )
