"""
DCT-based watermark embedding engine.
Implements Discrete Cosine Transform watermarking in the frequency domain.
"""
import numpy as np
import cv2
from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class DCTResult:
    """Result of DCT embedding or extraction."""
    success: bool
    bits_processed: int
    confidence: float
    blocks_modified: int


class DCTEngine:
    """
    DCT-based watermark embedding in frequency domain.
    Optimized for robustness against JPEG compression and resizing.
    """

    def __init__(
        self,
        block_size: int = 8,
        base_strength: float = 25.0,
        redundancy: int = 3
    ):
        """
        Initialize DCT engine.

        Args:
            block_size: Size of DCT blocks (default 8x8)
            base_strength: Base embedding strength (delta for QIM)
            redundancy: Number of times each bit is embedded
        """
        self.block_size = block_size
        self.base_strength = base_strength
        self.redundancy = redundancy

        # Mid-frequency coefficient pairs for QIM embedding
        # These positions survive JPEG compression well
        self.embedding_pairs = [
            ((1, 2), (2, 1)),
            ((2, 2), (1, 3)),
            ((3, 1), (1, 4)),
            ((2, 3), (3, 2)),
            ((4, 1), (1, 5)),
            ((3, 3), (2, 4)),
            ((4, 2), (2, 5)),
            ((3, 4), (4, 3)),
        ]

    def embed(
        self,
        image: np.ndarray,
        bits: List[int],
        strength_map: Optional[np.ndarray] = None
    ) -> Tuple[np.ndarray, DCTResult]:
        """
        Embed bits into image using DCT domain watermarking.

        Args:
            image: Input image (BGR format from OpenCV)
            bits: Bit array to embed
            strength_map: Optional per-block strength multipliers (0.5-1.5)

        Returns:
            Tuple of (watermarked image, DCTResult)
        """
        # Convert to YCrCb color space
        ycrcb = cv2.cvtColor(image, cv2.COLOR_BGR2YCrCb)
        y_channel = ycrcb[:, :, 0].astype(np.float64)

        height, width = y_channel.shape
        blocks_h = height // self.block_size
        blocks_w = width // self.block_size

        # Prepare bits with redundancy
        redundant_bits = []
        for bit in bits:
            redundant_bits.extend([bit] * self.redundancy)

        bit_index = 0
        blocks_modified = 0
        total_bits = len(redundant_bits)

        # Process each 8x8 block
        for i in range(blocks_h):
            for j in range(blocks_w):
                if bit_index >= total_bits:
                    break

                # Extract block
                y = i * self.block_size
                x = j * self.block_size
                block = y_channel[y:y + self.block_size, x:x + self.block_size]

                # Apply 2D DCT
                dct_block = cv2.dct(block)

                # Get adaptive strength
                strength = self.base_strength
                if strength_map is not None:
                    block_i = min(i, strength_map.shape[0] - 1)
                    block_j = min(j, strength_map.shape[1] - 1)
                    strength *= strength_map[block_i, block_j]

                # Embed bits using available coefficient pairs
                for pair_idx, ((r1, c1), (r2, c2)) in enumerate(self.embedding_pairs):
                    if bit_index >= total_bits:
                        break

                    bit = redundant_bits[bit_index]
                    dct_block = self._embed_bit_qim(dct_block, bit, r1, c1, r2, c2, strength)
                    bit_index += 1

                # Apply inverse DCT
                y_channel[y:y + self.block_size, x:x + self.block_size] = cv2.idct(dct_block)
                blocks_modified += 1

            if bit_index >= total_bits:
                break

        # Clip values to valid range
        y_channel = np.clip(y_channel, 0, 255).astype(np.uint8)
        ycrcb[:, :, 0] = y_channel

        # Convert back to BGR
        watermarked = cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)

        result = DCTResult(
            success=bit_index >= total_bits,
            bits_processed=bit_index,
            confidence=1.0 if bit_index >= total_bits else bit_index / total_bits,
            blocks_modified=blocks_modified
        )

        return watermarked, result

    def extract(
        self,
        image: np.ndarray,
        num_bits: int,
        strength_map: Optional[np.ndarray] = None
    ) -> Tuple[List[int], float]:
        """
        Extract bits from watermarked image.

        Args:
            image: Watermarked image (BGR format)
            num_bits: Number of original bits to extract (before redundancy)
            strength_map: Optional per-block strength multipliers (for localization)

        Returns:
            Tuple of (extracted bits, confidence score)
        """
        # Convert to YCrCb color space
        ycrcb = cv2.cvtColor(image, cv2.COLOR_BGR2YCrCb)
        y_channel = ycrcb[:, :, 0].astype(np.float64)

        height, width = y_channel.shape
        blocks_h = height // self.block_size
        blocks_w = width // self.block_size

        total_redundant_bits = num_bits * self.redundancy
        extracted_bits = []
        confidences = []

        bit_index = 0

        # Process each 8x8 block
        for i in range(blocks_h):
            for j in range(blocks_w):
                if bit_index >= total_redundant_bits:
                    break

                # Extract block
                y = i * self.block_size
                x = j * self.block_size
                block = y_channel[y:y + self.block_size, x:x + self.block_size]

                # Apply 2D DCT
                dct_block = cv2.dct(block)

                # Get adaptive strength
                strength = self.base_strength
                if strength_map is not None:
                    block_i = min(i, strength_map.shape[0] - 1)
                    block_j = min(j, strength_map.shape[1] - 1)
                    strength *= strength_map[block_i, block_j]

                # Extract bits from coefficient pairs
                for pair_idx, ((r1, c1), (r2, c2)) in enumerate(self.embedding_pairs):
                    if bit_index >= total_redundant_bits:
                        break

                    bit, conf = self._extract_bit_qim(dct_block, r1, c1, r2, c2, strength)
                    extracted_bits.append(bit)
                    confidences.append(conf)
                    bit_index += 1

            if bit_index >= total_redundant_bits:
                break

        # Apply majority voting for redundancy
        final_bits = []
        final_confidences = []

        for i in range(num_bits):
            start_idx = i * self.redundancy
            end_idx = min(start_idx + self.redundancy, len(extracted_bits))

            if end_idx <= start_idx:
                break

            bit_group = extracted_bits[start_idx:end_idx]
            conf_group = confidences[start_idx:end_idx]

            # Weighted majority voting
            ones = sum(1 for b in bit_group if b == 1)
            zeros = len(bit_group) - ones

            final_bit = 1 if ones > zeros else 0
            final_confidence = max(ones, zeros) / len(bit_group)

            final_bits.append(final_bit)
            final_confidences.append(final_confidence)

        # Overall confidence
        overall_confidence = np.mean(final_confidences) if final_confidences else 0.0

        return final_bits, overall_confidence

    def _embed_bit_qim(
        self,
        dct_block: np.ndarray,
        bit: int,
        r1: int, c1: int,
        r2: int, c2: int,
        delta: float
    ) -> np.ndarray:
        """
        Embed a single bit using Quantization Index Modulation (QIM).

        Modifies the relationship between two DCT coefficients to encode the bit.
        """
        coef1 = dct_block[r1, c1]
        coef2 = dct_block[r2, c2]

        # Calculate the difference
        diff = coef1 - coef2

        # Quantize to encode bit
        if bit == 1:
            # Ensure diff is positive and quantized to odd multiple of delta
            quantized = np.round(diff / delta)
            if quantized % 2 == 0:
                quantized += 1
            target_diff = quantized * delta
        else:
            # Ensure diff is quantized to even multiple of delta
            quantized = np.round(diff / delta)
            if quantized % 2 == 1:
                quantized += 1 if quantized > 0 else -1
            target_diff = quantized * delta

        # Adjust coefficients to achieve target difference
        adjustment = (target_diff - diff) / 2
        dct_block[r1, c1] = coef1 + adjustment
        dct_block[r2, c2] = coef2 - adjustment

        return dct_block

    def _extract_bit_qim(
        self,
        dct_block: np.ndarray,
        r1: int, c1: int,
        r2: int, c2: int,
        delta: float
    ) -> Tuple[int, float]:
        """
        Extract a single bit using QIM.

        Returns the bit and a confidence score.
        """
        coef1 = dct_block[r1, c1]
        coef2 = dct_block[r2, c2]

        diff = coef1 - coef2
        quantized = np.round(diff / delta)

        # Determine bit based on odd/even quantization level
        bit = 1 if quantized % 2 == 1 else 0

        # Calculate confidence based on distance from decision boundary
        remainder = abs(diff - quantized * delta)
        confidence = 1.0 - (remainder / (delta / 2))
        confidence = max(0.0, min(1.0, confidence))

        return bit, confidence

    def get_capacity(self, image_shape: Tuple[int, int]) -> int:
        """
        Calculate the bit capacity for an image of given shape.

        Args:
            image_shape: (height, width) of the image

        Returns:
            Number of bits that can be embedded (before redundancy)
        """
        height, width = image_shape[:2]
        blocks_h = height // self.block_size
        blocks_w = width // self.block_size
        total_blocks = blocks_h * blocks_w

        # Each block can embed len(embedding_pairs) bits
        bits_per_block = len(self.embedding_pairs)
        total_capacity = total_blocks * bits_per_block

        # Account for redundancy
        return total_capacity // self.redundancy
