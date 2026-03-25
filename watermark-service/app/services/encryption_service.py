"""
AES-256-GCM encryption service for watermark payloads.
Provides secure encryption compatible with the Node.js backend.
"""
import os
import json
import struct
import hashlib
from typing import Dict, Any, Tuple
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.backends import default_backend


class EncryptionService:
    """
    AES-256-GCM encryption for watermark payloads.

    Compatible with Node.js crypto module encryption.
    Uses HKDF for key derivation when needed.
    """

    def __init__(self):
        """Initialize encryption service."""
        self.iv_length = 12  # 96 bits for GCM
        self.tag_length = 16  # 128 bits auth tag

    def encrypt(
        self,
        data: bytes,
        key: bytes,
        associated_data: bytes = None
    ) -> Tuple[bytes, bytes, bytes]:
        """
        Encrypt data using AES-256-GCM.

        Args:
            data: Plaintext data to encrypt
            key: 32-byte (256-bit) encryption key
            associated_data: Optional additional authenticated data

        Returns:
            Tuple of (ciphertext, iv, auth_tag)
        """
        if len(key) != 32:
            raise ValueError("Key must be 32 bytes (256 bits)")

        # Generate random IV
        iv = os.urandom(self.iv_length)

        # Create cipher
        aesgcm = AESGCM(key)

        # Encrypt (GCM appends auth tag to ciphertext)
        ciphertext_with_tag = aesgcm.encrypt(iv, data, associated_data)

        # Split ciphertext and tag
        ciphertext = ciphertext_with_tag[:-self.tag_length]
        auth_tag = ciphertext_with_tag[-self.tag_length:]

        return ciphertext, iv, auth_tag

    def decrypt(
        self,
        ciphertext: bytes,
        key: bytes,
        iv: bytes,
        auth_tag: bytes,
        associated_data: bytes = None
    ) -> bytes:
        """
        Decrypt data using AES-256-GCM.

        Args:
            ciphertext: Encrypted data
            key: 32-byte encryption key
            iv: Initialization vector (12 bytes)
            auth_tag: Authentication tag (16 bytes)
            associated_data: Optional additional authenticated data

        Returns:
            Decrypted plaintext

        Raises:
            ValueError: If decryption fails (invalid key, tampered data, etc.)
        """
        if len(key) != 32:
            raise ValueError("Key must be 32 bytes (256 bits)")
        if len(iv) != self.iv_length:
            raise ValueError(f"IV must be {self.iv_length} bytes")
        if len(auth_tag) != self.tag_length:
            raise ValueError(f"Auth tag must be {self.tag_length} bytes")

        # Create cipher
        aesgcm = AESGCM(key)

        # Combine ciphertext and tag (as expected by AESGCM)
        ciphertext_with_tag = ciphertext + auth_tag

        try:
            plaintext = aesgcm.decrypt(iv, ciphertext_with_tag, associated_data)
            return plaintext
        except Exception as e:
            raise ValueError(f"Decryption failed: {e}")

    def encrypt_payload(
        self,
        payload: Dict[str, Any],
        key_hex: str
    ) -> bytes:
        """
        Encrypt a watermark payload dictionary.

        Args:
            payload: Dictionary with watermark metadata
            key_hex: Hex-encoded 256-bit key

        Returns:
            Encrypted bytes (format: IV + ciphertext + auth_tag)
        """
        # Convert key from hex
        key = bytes.fromhex(key_hex)

        # Serialize payload to JSON
        payload_json = json.dumps(payload, separators=(',', ':'))
        payload_bytes = payload_json.encode('utf-8')

        # Encrypt
        ciphertext, iv, auth_tag = self.encrypt(payload_bytes, key)

        # Combine: IV + ciphertext + auth_tag
        encrypted = iv + ciphertext + auth_tag

        return encrypted

    def decrypt_payload(
        self,
        encrypted: bytes,
        key_hex: str
    ) -> Dict[str, Any]:
        """
        Decrypt a watermark payload.

        Args:
            encrypted: Encrypted bytes (IV + ciphertext + auth_tag)
            key_hex: Hex-encoded 256-bit key

        Returns:
            Decrypted payload dictionary

        Raises:
            ValueError: If decryption fails
        """
        # Convert key from hex
        key = bytes.fromhex(key_hex)

        # Split components
        iv = encrypted[:self.iv_length]
        auth_tag = encrypted[-self.tag_length:]
        ciphertext = encrypted[self.iv_length:-self.tag_length]

        # Decrypt
        plaintext = self.decrypt(ciphertext, key, iv, auth_tag)

        # Parse JSON
        payload = json.loads(plaintext.decode('utf-8'))

        return payload

    def derive_key(
        self,
        master_key: bytes,
        salt: bytes,
        info: str
    ) -> bytes:
        """
        Derive a key using HKDF-SHA256.

        Compatible with Node.js crypto.hkdf().

        Args:
            master_key: Master key material
            salt: Random salt
            info: Context info string

        Returns:
            32-byte derived key
        """
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            info=info.encode('utf-8'),
            backend=default_backend()
        )

        return hkdf.derive(master_key)

    @staticmethod
    def generate_key() -> str:
        """
        Generate a random 256-bit key.

        Returns:
            Hex-encoded 32-byte key
        """
        return os.urandom(32).hex()

    @staticmethod
    def compute_crc32(data: bytes) -> int:
        """
        Compute CRC32 checksum.

        Args:
            data: Input bytes

        Returns:
            CRC32 value as unsigned 32-bit integer
        """
        import zlib
        return zlib.crc32(data) & 0xFFFFFFFF

    @staticmethod
    def compute_sha256(data: bytes) -> str:
        """
        Compute SHA-256 hash.

        Args:
            data: Input bytes

        Returns:
            Hex-encoded SHA-256 hash
        """
        return hashlib.sha256(data).hexdigest()
