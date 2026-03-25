"""
Image utility functions for loading, saving, and converting images.
"""
import cv2
import numpy as np
from typing import Optional, Tuple
from io import BytesIO
from PIL import Image


def load_image(data: bytes) -> np.ndarray:
    """
    Load image from bytes.

    Args:
        data: Image file bytes

    Returns:
        NumPy array in BGR format (OpenCV standard)

    Raises:
        ValueError: If image cannot be decoded
    """
    nparr = np.frombuffer(data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise ValueError("Failed to decode image")

    return image


def save_image(
    image: np.ndarray,
    format: str = "png",
    quality: int = 95
) -> bytes:
    """
    Save image to bytes.

    Args:
        image: NumPy array in BGR format
        format: Output format ('png', 'jpeg', 'webp')
        quality: JPEG/WebP quality (0-100)

    Returns:
        Encoded image bytes
    """
    format = format.lower()

    if format == "png":
        params = [cv2.IMWRITE_PNG_COMPRESSION, 9]
        ext = ".png"
    elif format in ("jpg", "jpeg"):
        params = [cv2.IMWRITE_JPEG_QUALITY, quality]
        ext = ".jpg"
    elif format == "webp":
        params = [cv2.IMWRITE_WEBP_QUALITY, quality]
        ext = ".webp"
    else:
        raise ValueError(f"Unsupported format: {format}")

    success, buffer = cv2.imencode(ext, image, params)

    if not success:
        raise ValueError("Failed to encode image")

    return buffer.tobytes()


def image_to_bytes(image: np.ndarray, format: str = "png") -> bytes:
    """Alias for save_image."""
    return save_image(image, format)


def bytes_to_image(data: bytes) -> np.ndarray:
    """Alias for load_image."""
    return load_image(data)


def resize_image(
    image: np.ndarray,
    max_dimension: int,
    maintain_aspect: bool = True
) -> Tuple[np.ndarray, float]:
    """
    Resize image if larger than max_dimension.

    Args:
        image: Input image
        max_dimension: Maximum width or height
        maintain_aspect: Whether to maintain aspect ratio

    Returns:
        Tuple of (resized image, scale factor)
    """
    height, width = image.shape[:2]
    max_current = max(height, width)

    if max_current <= max_dimension:
        return image, 1.0

    scale = max_dimension / max_current

    if maintain_aspect:
        new_width = int(width * scale)
        new_height = int(height * scale)
    else:
        new_width = new_height = max_dimension

    resized = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)

    return resized, scale


def get_image_info(image: np.ndarray) -> dict:
    """
    Get image information.

    Args:
        image: Input image

    Returns:
        Dictionary with image properties
    """
    height, width = image.shape[:2]
    channels = image.shape[2] if len(image.shape) > 2 else 1

    return {
        "width": width,
        "height": height,
        "channels": channels,
        "dtype": str(image.dtype),
        "size_bytes": image.nbytes
    }


def convert_color_space(
    image: np.ndarray,
    from_space: str,
    to_space: str
) -> np.ndarray:
    """
    Convert image between color spaces.

    Args:
        image: Input image
        from_space: Source color space ('bgr', 'rgb', 'gray', 'ycrcb')
        to_space: Target color space

    Returns:
        Converted image
    """
    conversions = {
        ('bgr', 'rgb'): cv2.COLOR_BGR2RGB,
        ('rgb', 'bgr'): cv2.COLOR_RGB2BGR,
        ('bgr', 'gray'): cv2.COLOR_BGR2GRAY,
        ('rgb', 'gray'): cv2.COLOR_RGB2GRAY,
        ('bgr', 'ycrcb'): cv2.COLOR_BGR2YCrCb,
        ('ycrcb', 'bgr'): cv2.COLOR_YCrCb2BGR,
        ('rgb', 'ycrcb'): cv2.COLOR_RGB2YCrCb,
        ('ycrcb', 'rgb'): cv2.COLOR_YCrCb2RGB,
    }

    key = (from_space.lower(), to_space.lower())

    if key not in conversions:
        raise ValueError(f"Unsupported conversion: {from_space} -> {to_space}")

    return cv2.cvtColor(image, conversions[key])
