"""
Configuration management for the watermark service.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Node.js Backend Integration
    NODEJS_BACKEND_URL: str = "http://localhost:5000"

    # DCT Watermark Settings
    DCT_BLOCK_SIZE: int = 8
    DCT_BASE_STRENGTH: float = 25.0
    DCT_MIN_STRENGTH: float = 10.0
    DCT_MAX_STRENGTH: float = 50.0

    # LSB Watermark Settings
    LSB_BIT_DEPTH: int = 2
    LSB_MIN_TEXTURE_THRESHOLD: float = 0.3

    # Error Correction
    RS_ERROR_SYMBOLS: int = 32  # Reed-Solomon error correction symbols
    REDUNDANCY_FACTOR: int = 3

    # Quality Targets
    TARGET_PSNR: float = 40.0
    TARGET_SSIM: float = 0.98
    MIN_CONFIDENCE_THRESHOLD: float = 0.7

    # Limits
    MAX_IMAGE_SIZE_MB: int = 50
    MAX_IMAGE_DIMENSION: int = 8192

    # AI Optimization
    ENABLE_AI_OPTIMIZATION: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
