"""
Health check endpoint.
"""
import time
import cv2
import numpy as np
from fastapi import APIRouter

from ..models.responses import HealthResponse
from ..config import settings

router = APIRouter()

# Track service start time
_start_time = time.time()


@router.get("/", response_model=HealthResponse)
async def health_check():
    """
    Service health check.

    Checks:
    - OpenCV availability
    - NumPy operations
    - Configuration loaded
    """
    checks = {}

    # Check OpenCV
    try:
        test_img = np.zeros((64, 64, 3), dtype=np.uint8)
        _ = cv2.cvtColor(test_img, cv2.COLOR_BGR2GRAY)
        checks["opencv"] = True
    except Exception:
        checks["opencv"] = False

    # Check NumPy
    try:
        _ = np.fft.fft2(np.zeros((8, 8)))
        checks["numpy"] = True
    except Exception:
        checks["numpy"] = False

    # Check configuration
    try:
        _ = settings.DCT_BASE_STRENGTH
        checks["config"] = True
    except Exception:
        checks["config"] = False

    # Check cryptography
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        key = b'0' * 32
        _ = AESGCM(key)
        checks["cryptography"] = True
    except Exception:
        checks["cryptography"] = False

    # Check Reed-Solomon
    try:
        from reedsolo import RSCodec
        rs = RSCodec(10)
        _ = rs.encode(b"test")
        checks["reed_solomon"] = True
    except Exception:
        checks["reed_solomon"] = False

    # Determine overall status
    all_healthy = all(checks.values())
    some_healthy = any(checks.values())

    if all_healthy:
        status = "healthy"
    elif some_healthy:
        status = "degraded"
    else:
        status = "unhealthy"

    uptime = time.time() - _start_time

    return HealthResponse(
        status=status,
        version="1.0.0",
        algorithm_version="2.0-hybrid",
        uptime_seconds=uptime,
        checks=checks
    )


@router.get("/ready")
async def readiness_check():
    """
    Kubernetes readiness probe.

    Returns 200 if service is ready to accept requests.
    """
    return {"ready": True}


@router.get("/live")
async def liveness_check():
    """
    Kubernetes liveness probe.

    Returns 200 if service is alive.
    """
    return {"alive": True}
