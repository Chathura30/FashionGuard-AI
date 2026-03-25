"""
LSB-based steganography engine.
Implements Least Significant Bit embedding for high-capacity watermarking.
"""
import numpy as np
import cv2
from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class LSBResult:
    """Result of LSB embedding or extraction."""
    success: bool
    bits_processed: int
    pixels_modified: int
    confidence: float


class LSBEngine:
    """
    LSB steganography for high-capacity, low-visibility embedding.
    Applied only to high-texture regions for better imperceptibility.
    """

    def __init__(
        self,
        bit_depth: int = 2,
        min_texture_threshold: float = 0.3,
        redundancy: int = 3
    ):
        """
        Initialize LSB engine.

        Args:
            bit_depth: Number of LSBs to modify per pixel (1-4)
            min_texture_threshold: Minimum texture value for embedding (0.0-1.0)
            redundancy: Number of times each bit is embedded
        """
        self.bit_depth = min(4, max(1, bit_depth))
        self.min_texture_threshold = min_texture_threshold
        self.redundancy = redundancy

    def embed(
        self,
        image: np.ndarray,
        bits: List[int],
        texture_mask: Optional[np.ndarray] = None
    ) -> Tuple[np.ndarray, LSBResult]:
        """
        Embed bits into image using LSB steganography.

        Args:
            image: Input image (BGR format from OpenCV)
            bits: Bit array to embed
            texture_mask: Binary mask where True = suitable for embedding

        Returns:
            Tuple of (watermarked image, LSBResult)
        """
        watermarked = image.copy()
        height, width = image.shape[:2]

        # Generate texture mask if not provided
        if texture_mask is None:
            texture_mask = self._generate_texture_mask(image)

        # Get embedding locations (high-texture pixels)
        embed_locations = np.where(texture_mask)
        num_locations = len(embed_locations[0])

        if num_locations == 0:
            return watermarked, LSBResult(
                success=False,
                bits_processed=0,
                pixels_modified=0,
                confidence=0.0
            )

        # Prepare bits with redundancy
        redundant_bits = []
        for bit in bits:
            redundant_bits.extend([bit] * self.redundancy)

        total_bits = len(redundant_bits)

        # Calculate bits per pixel (using blue channel LSBs)
        bits_per_pixel = self.bit_depth

        # Embed bits
        bit_index = 0
        pixels_modified = 0

        for loc_idx in range(num_locations):
            if bit_index >= total_bits:
                break

            y = embed_locations[0][loc_idx]
            x = embed_locations[1][loc_idx]

            # Embed in blue channel (least perceptually important)
            pixel_value = int(watermarked[y, x, 0])

            # Embed multiple bits in LSBs
            bits_to_embed = []
            for _ in range(bits_per_pixel):
                if bit_index >= total_bits:
                    break
                bits_to_embed.append(redundant_bits[bit_index])
                bit_index += 1

            # Modify LSBs
            mask = (0xFF << len(bits_to_embed)) & 0xFF
            new_value = pixel_value & mask

            for i, bit in enumerate(bits_to_embed):
                new_value |= (bit << i)

            watermarked[y, x, 0] = new_value
            pixels_modified += 1

        result = LSBResult(
            success=bit_index >= total_bits,
            bits_processed=bit_index,
            pixels_modified=pixels_modified,
            confidence=1.0 if bit_index >= total_bits else bit_index / total_bits
        )

        return watermarked, result

    def extract(
        self,
        image: np.ndarray,
        num_bits: int,
        texture_mask: Optional[np.ndarray] = None
    ) -> Tuple[List[int], float]:
        """
        Extract bits from LSB-watermarked image.

        Args:
            image: Watermarked image (BGR format)
            num_bits: Number of original bits to extract (before redundancy)
            texture_mask: Binary mask indicating embedding locations

        Returns:
            Tuple of (extracted bits, confidence score)
        """
        # Generate texture mask if not provided
        if texture_mask is None:
            texture_mask = self._generate_texture_mask(image)

        # Get extraction locations
        embed_locations = np.where(texture_mask)
        num_locations = len(embed_locations[0])

        total_redundant_bits = num_bits * self.redundancy
        extracted_bits = []

        bit_index = 0
        bits_per_pixel = self.bit_depth

        for loc_idx in range(num_locations):
            if bit_index >= total_redundant_bits:
                break

            y = embed_locations[0][loc_idx]
            x = embed_locations[1][loc_idx]

            # Extract from blue channel
            pixel_value = int(image[y, x, 0])

            # Extract LSBs
            for i in range(bits_per_pixel):
                if bit_index >= total_redundant_bits:
                    break
                bit = (pixel_value >> i) & 1
                extracted_bits.append(bit)
                bit_index += 1

        # Apply majority voting for redundancy
        final_bits = []
        final_confidences = []

        for i in range(num_bits):
            start_idx = i * self.redundancy
            end_idx = min(start_idx + self.redundancy, len(extracted_bits))

            if end_idx <= start_idx:
                break

            bit_group = extracted_bits[start_idx:end_idx]

            # Majority voting
            ones = sum(bit_group)
            zeros = len(bit_group) - ones

            final_bit = 1 if ones > zeros else 0
            final_confidence = max(ones, zeros) / len(bit_group)

            final_bits.append(final_bit)
            final_confidences.append(final_confidence)

        overall_confidence = np.mean(final_confidences) if final_confidences else 0.0

        return final_bits, overall_confidence

    def _generate_texture_mask(self, image: np.ndarray) -> np.ndarray:
        """
        Generate a texture mask identifying high-texture regions.

        High-texture regions are better for LSB embedding as changes
        are less perceptible.
        """
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float64)

        # Calculate local variance (texture measure)
        kernel_size = 5
        mean = cv2.blur(gray, (kernel_size, kernel_size))
        sqr_mean = cv2.blur(gray ** 2, (kernel_size, kernel_size))
        variance = sqr_mean - mean ** 2

        # Normalize variance to 0-1
        max_var = variance.max()
        if max_var > 0:
            normalized_var = variance / max_var
        else:
            normalized_var = variance

        # Create binary mask based on threshold
        mask = normalized_var > self.min_texture_threshold

        return mask

    def get_capacity(
        self,
        image_shape: Tuple[int, int],
        texture_ratio: float = 0.3
    ) -> int:
        """
        Estimate the bit capacity for an image.

        Args:
            image_shape: (height, width) of the image
            texture_ratio: Estimated ratio of high-texture pixels

        Returns:
            Estimated number of bits that can be embedded (before redundancy)
        """
        height, width = image_shape[:2]
        total_pixels = height * width

        # Estimate usable pixels
        usable_pixels = int(total_pixels * texture_ratio)

        # Each pixel can hold bit_depth bits
        total_capacity = usable_pixels * self.bit_depth

        # Account for redundancy
        return total_capacity // self.redundancy
