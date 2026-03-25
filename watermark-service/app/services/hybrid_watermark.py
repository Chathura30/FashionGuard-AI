"""
Hybrid watermark service combining DCT and LSB techniques.
Provides the main orchestration for watermark embedding and extraction.
"""
import numpy as np
import cv2
import json
import time
import uuid
from typing import Dict, Any, Tuple, Optional, List
from dataclasses import dataclass, asdict

from .dct_engine import DCTEngine
from .lsb_engine import LSBEngine
from .perceptual_analyzer import PerceptualAnalyzer
from .error_correction import ErrorCorrectionService, bits_to_bytes, bytes_to_bits
from .encryption_service import EncryptionService
from .quality_metrics import QualityMetrics, QualityReport


@dataclass
class WatermarkPayload:
    """Watermark payload structure."""
    version: int
    designer_id: str
    design_id: str
    timestamp: int
    file_hash: str
    crc: int = 0


@dataclass
class EmbedResult:
    """Result of watermark embedding."""
    success: bool
    watermark_id: str
    watermarked_image: np.ndarray
    quality: QualityReport
    dct_bits: int
    lsb_bits: int
    total_payload_bits: int
    processing_time_ms: float
    warnings: List[str]


@dataclass
class ExtractResult:
    """Result of watermark extraction."""
    success: bool
    watermark_found: bool
    confidence: float
    payload: Optional[WatermarkPayload]
    dct_confidence: float
    lsb_confidence: float
    errors_corrected: int
    warnings: List[str]


class HybridWatermarkService:
    """
    Hybrid watermark service combining DCT and LSB techniques.

    Architecture:
    1. DCT layer (primary): Robust against compression/resizing
    2. LSB layer (secondary): High capacity in textured regions
    3. Reed-Solomon ECC: Error correction across both layers
    4. AI perceptual analysis: Adaptive embedding strength
    """

    def __init__(
        self,
        dct_strength: float = 25.0,
        lsb_depth: int = 2,
        redundancy: int = 3,
        rs_symbols: int = 32,
        enable_ai: bool = True
    ):
        """
        Initialize hybrid watermark service.

        Args:
            dct_strength: Base DCT embedding strength
            lsb_depth: LSB bit depth per pixel
            redundancy: Redundancy factor for majority voting
            rs_symbols: Reed-Solomon error correction symbols
            enable_ai: Enable AI perceptual optimization
        """
        self.dct_engine = DCTEngine(
            block_size=8,
            base_strength=dct_strength,
            redundancy=redundancy
        )
        self.lsb_engine = LSBEngine(
            bit_depth=lsb_depth,
            min_texture_threshold=0.3,
            redundancy=redundancy
        )
        self.perceptual_analyzer = PerceptualAnalyzer(block_size=8)
        self.error_correction = ErrorCorrectionService(nsym=rs_symbols)
        self.encryption = EncryptionService()
        self.quality_metrics = QualityMetrics()
        self.enable_ai = enable_ai
        self.version = 2  # Algorithm version

    def embed(
        self,
        image: np.ndarray,
        designer_id: str,
        design_id: str,
        file_hash: str,
        encryption_key: str,
        timestamp: Optional[int] = None
    ) -> EmbedResult:
        """
        Embed watermark into image.

        Args:
            image: Input image (BGR format)
            designer_id: Designer's unique ID
            design_id: Design's unique ID
            file_hash: SHA-256 hash of original file
            encryption_key: Hex-encoded AES-256 key
            timestamp: Unix timestamp (defaults to current time)

        Returns:
            EmbedResult with watermarked image and metadata
        """
        start_time = time.time()
        warnings = []

        # Generate watermark ID
        watermark_id = f"wm_{uuid.uuid4().hex[:16]}"

        # Create payload
        if timestamp is None:
            timestamp = int(time.time())

        payload = WatermarkPayload(
            version=self.version,
            designer_id=designer_id[-12:],  # Last 12 chars
            design_id=design_id[-12:],
            timestamp=timestamp,
            file_hash=file_hash[:16]  # First 16 chars
        )

        # Serialize and calculate CRC
        payload_dict = asdict(payload)
        del payload_dict['crc']
        payload_json = json.dumps(payload_dict, separators=(',', ':'))
        payload.crc = self.encryption.compute_crc32(payload_json.encode())
        payload_dict['crc'] = payload.crc

        # Encrypt payload
        encrypted_payload = self.encryption.encrypt_payload(
            payload_dict,
            encryption_key
        )

        # Apply Reed-Solomon error correction
        encoded_payload = self.error_correction.encode(encrypted_payload)

        # Convert to bits
        payload_bits = bytes_to_bits(encoded_payload)
        total_payload_bits = len(payload_bits)

        # Run perceptual analysis if enabled
        if self.enable_ai:
            sensitivity_map = self.perceptual_analyzer.analyze(image)
            dct_strength_map = sensitivity_map.dct_strength_map
            lsb_mask = sensitivity_map.lsb_mask
        else:
            dct_strength_map = None
            lsb_mask = None

        # Calculate capacity split
        dct_capacity = self.dct_engine.get_capacity(image.shape[:2])
        lsb_capacity = self.lsb_engine.get_capacity(image.shape[:2])

        # Split bits between DCT and LSB
        # Use DCT for primary (more robust), LSB for overflow
        dct_bits_count = min(len(payload_bits), dct_capacity)
        lsb_bits_count = max(0, len(payload_bits) - dct_bits_count)

        dct_bits = payload_bits[:dct_bits_count]
        lsb_bits = payload_bits[dct_bits_count:] if lsb_bits_count > 0 else []

        # Embed DCT layer
        watermarked, dct_result = self.dct_engine.embed(
            image.copy(),
            dct_bits,
            dct_strength_map
        )

        if not dct_result.success:
            warnings.append(f"DCT embedding incomplete: {dct_result.bits_processed}/{len(dct_bits)} bits")

        # Embed LSB layer (if needed)
        lsb_result = None
        if lsb_bits:
            watermarked, lsb_result = self.lsb_engine.embed(
                watermarked,
                lsb_bits,
                lsb_mask
            )
            if not lsb_result.success:
                warnings.append(f"LSB embedding incomplete: {lsb_result.bits_processed}/{len(lsb_bits)} bits")

        # Calculate quality metrics
        quality = self.quality_metrics.calculate(image, watermarked)

        if not quality.watermark_invisible:
            warnings.append(f"Quality below threshold: PSNR={quality.psnr:.1f}dB, SSIM={quality.ssim:.3f}")

        processing_time = (time.time() - start_time) * 1000

        return EmbedResult(
            success=dct_result.success and (lsb_result is None or lsb_result.success),
            watermark_id=watermark_id,
            watermarked_image=watermarked,
            quality=quality,
            dct_bits=dct_result.bits_processed,
            lsb_bits=lsb_result.bits_processed if lsb_result else 0,
            total_payload_bits=total_payload_bits,
            processing_time_ms=processing_time,
            warnings=warnings
        )

    def extract(
        self,
        image: np.ndarray,
        encryption_key: str,
        expected_bits: Optional[int] = None
    ) -> ExtractResult:
        """
        Extract watermark from image.

        Args:
            image: Watermarked image (BGR format)
            encryption_key: Hex-encoded AES-256 key for decryption
            expected_bits: Expected number of payload bits (for estimation)

        Returns:
            ExtractResult with extracted payload and confidence
        """
        warnings = []

        # Run perceptual analysis for extraction hints
        if self.enable_ai:
            sensitivity_map = self.perceptual_analyzer.analyze(image)
            dct_strength_map = sensitivity_map.dct_strength_map
            lsb_mask = sensitivity_map.lsb_mask
        else:
            dct_strength_map = None
            lsb_mask = None

        # Estimate payload size if not provided
        if expected_bits is None:
            # Typical payload: ~100 bytes encrypted + ~50 bytes RS overhead = ~150 bytes = ~1200 bits
            expected_bits = 1200

        # Calculate split (same as embedding)
        dct_capacity = self.dct_engine.get_capacity(image.shape[:2])
        dct_bits_count = min(expected_bits, dct_capacity)
        lsb_bits_count = max(0, expected_bits - dct_bits_count)

        # Extract DCT layer
        dct_bits, dct_confidence = self.dct_engine.extract(
            image,
            dct_bits_count // 3,  # Account for redundancy built into engine
            dct_strength_map
        )

        # Extract LSB layer if needed
        lsb_bits = []
        lsb_confidence = 0.0
        if lsb_bits_count > 0:
            lsb_bits, lsb_confidence = self.lsb_engine.extract(
                image,
                lsb_bits_count // 3,  # Account for redundancy
                lsb_mask
            )

        # Combine bits
        all_bits = dct_bits + lsb_bits

        # Convert bits to bytes
        try:
            encoded_bytes = bits_to_bytes(all_bits)

            # Apply Reed-Solomon decoding
            decoded_bytes, errors_corrected = self.error_correction.decode(encoded_bytes)

            if errors_corrected > 0:
                warnings.append(f"Corrected {errors_corrected} byte errors")

            # Decrypt payload
            payload_dict = self.encryption.decrypt_payload(decoded_bytes, encryption_key)

            # Validate CRC
            stored_crc = payload_dict.get('crc', 0)
            check_dict = {k: v for k, v in payload_dict.items() if k != 'crc'}
            check_json = json.dumps(check_dict, separators=(',', ':'))
            computed_crc = self.encryption.compute_crc32(check_json.encode())

            if stored_crc != computed_crc:
                warnings.append("CRC mismatch - payload may be corrupted")

            # Create payload object
            payload = WatermarkPayload(
                version=payload_dict.get('version', 1),
                designer_id=payload_dict.get('designer_id', ''),
                design_id=payload_dict.get('design_id', ''),
                timestamp=payload_dict.get('timestamp', 0),
                file_hash=payload_dict.get('file_hash', ''),
                crc=stored_crc
            )

            # Calculate overall confidence
            overall_confidence = (dct_confidence * 0.7 + lsb_confidence * 0.3) if lsb_bits else dct_confidence

            return ExtractResult(
                success=True,
                watermark_found=True,
                confidence=overall_confidence,
                payload=payload,
                dct_confidence=dct_confidence,
                lsb_confidence=lsb_confidence,
                errors_corrected=errors_corrected,
                warnings=warnings
            )

        except Exception as e:
            warnings.append(f"Extraction failed: {str(e)}")
            return ExtractResult(
                success=False,
                watermark_found=False,
                confidence=0.0,
                payload=None,
                dct_confidence=dct_confidence,
                lsb_confidence=lsb_confidence,
                errors_corrected=0,
                warnings=warnings
            )

    def verify(
        self,
        image: np.ndarray,
        encryption_key: str,
        expected_designer_id: Optional[str] = None,
        expected_design_id: Optional[str] = None
    ) -> Tuple[bool, float, Dict[str, Any]]:
        """
        Verify watermark and optionally check ownership.

        Args:
            image: Image to verify
            encryption_key: Decryption key
            expected_designer_id: Expected designer ID (optional)
            expected_design_id: Expected design ID (optional)

        Returns:
            Tuple of (verified, confidence, details)
        """
        result = self.extract(image, encryption_key)

        if not result.watermark_found:
            return False, 0.0, {"error": "No watermark found", "warnings": result.warnings}

        details = {
            "payload": asdict(result.payload) if result.payload else None,
            "confidence": result.confidence,
            "dct_confidence": result.dct_confidence,
            "lsb_confidence": result.lsb_confidence,
            "errors_corrected": result.errors_corrected,
            "warnings": result.warnings
        }

        # Check ownership if expected values provided
        if expected_designer_id and result.payload:
            designer_match = result.payload.designer_id == expected_designer_id[-12:]
            details["designer_match"] = designer_match
            if not designer_match:
                return False, result.confidence, details

        if expected_design_id and result.payload:
            design_match = result.payload.design_id == expected_design_id[-12:]
            details["design_match"] = design_match
            if not design_match:
                return False, result.confidence, details

        return True, result.confidence, details
