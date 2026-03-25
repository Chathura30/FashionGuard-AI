"""
Cryptographic utility functions.
"""
import os
import hashlib
import zlib
from typing import Union


def generate_key(length: int = 32) -> str:
    """
    Generate a random cryptographic key.

    Args:
        length: Key length in bytes (default 32 for AES-256)

    Returns:
        Hex-encoded key string
    """
    return os.urandom(length).hex()


def compute_hash(data: Union[bytes, str], algorithm: str = "sha256") -> str:
    """
    Compute cryptographic hash of data.

    Args:
        data: Input data (bytes or string)
        algorithm: Hash algorithm ('sha256', 'sha512', 'md5')

    Returns:
        Hex-encoded hash string
    """
    if isinstance(data, str):
        data = data.encode('utf-8')

    if algorithm == "sha256":
        return hashlib.sha256(data).hexdigest()
    elif algorithm == "sha512":
        return hashlib.sha512(data).hexdigest()
    elif algorithm == "md5":
        return hashlib.md5(data).hexdigest()
    else:
        raise ValueError(f"Unsupported algorithm: {algorithm}")


def compute_crc32(data: Union[bytes, str]) -> int:
    """
    Compute CRC32 checksum.

    Args:
        data: Input data

    Returns:
        CRC32 value as unsigned 32-bit integer
    """
    if isinstance(data, str):
        data = data.encode('utf-8')

    return zlib.crc32(data) & 0xFFFFFFFF


def validate_hex_key(key: str, expected_length: int = 64) -> bool:
    """
    Validate a hex-encoded key.

    Args:
        key: Hex string to validate
        expected_length: Expected length in hex characters

    Returns:
        True if valid, False otherwise
    """
    if len(key) != expected_length:
        return False

    try:
        int(key, 16)
        return True
    except ValueError:
        return False


def hex_to_bytes(hex_string: str) -> bytes:
    """Convert hex string to bytes."""
    return bytes.fromhex(hex_string)


def bytes_to_hex(data: bytes) -> str:
    """Convert bytes to hex string."""
    return data.hex()
