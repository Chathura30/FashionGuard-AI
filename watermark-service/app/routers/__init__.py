# Routers package
from .embed import router as embed_router
from .extract import router as extract_router
from .verify import router as verify_router
from .health import router as health_router

__all__ = [
    "embed_router",
    "extract_router",
    "verify_router",
    "health_router",
]
