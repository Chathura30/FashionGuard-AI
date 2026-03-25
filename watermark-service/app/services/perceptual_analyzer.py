"""
AI-based perceptual sensitivity analyzer.
Determines optimal watermark placement based on image characteristics.
"""
import numpy as np
import cv2
from typing import Tuple, Optional
from dataclasses import dataclass


@dataclass
class SensitivityMap:
    """Contains perceptual sensitivity analysis results."""
    dct_strength_map: np.ndarray  # Per-block strength multipliers (0.5-1.5)
    lsb_mask: np.ndarray  # Binary mask for LSB-suitable pixels
    texture_map: np.ndarray  # Normalized texture values
    edge_map: np.ndarray  # Edge density map
    overall_capacity: int  # Estimated bit capacity


class PerceptualAnalyzer:
    """
    AI-based perceptual sensitivity analysis for optimal watermark placement.

    Combines multiple techniques:
    1. Edge detection (Canny) - avoid edges for DCT, use for LSB
    2. Texture analysis (local variance) - prefer textured regions
    3. Saliency detection - avoid visually important areas
    4. Block-level classification for adaptive strength
    """

    def __init__(
        self,
        block_size: int = 8,
        edge_threshold_low: int = 50,
        edge_threshold_high: int = 150,
        texture_kernel_size: int = 5
    ):
        """
        Initialize perceptual analyzer.

        Args:
            block_size: Size of DCT blocks for analysis
            edge_threshold_low: Low threshold for Canny edge detection
            edge_threshold_high: High threshold for Canny edge detection
            texture_kernel_size: Kernel size for texture analysis
        """
        self.block_size = block_size
        self.edge_threshold_low = edge_threshold_low
        self.edge_threshold_high = edge_threshold_high
        self.texture_kernel_size = texture_kernel_size

    def analyze(self, image: np.ndarray) -> SensitivityMap:
        """
        Generate comprehensive sensitivity map for image.

        Args:
            image: Input image (BGR format)

        Returns:
            SensitivityMap with all analysis results
        """
        # Convert to grayscale for analysis
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Compute individual maps
        texture_map = self._compute_texture_map(gray)
        edge_map = self._compute_edge_map(gray)
        saliency_map = self._compute_saliency_map(image)

        # Generate DCT strength map (per-block)
        dct_strength_map = self._compute_dct_strength_map(
            texture_map, edge_map, saliency_map, image.shape[:2]
        )

        # Generate LSB mask (per-pixel)
        lsb_mask = self._compute_lsb_mask(texture_map, edge_map)

        # Estimate capacity
        overall_capacity = self._estimate_capacity(dct_strength_map, lsb_mask)

        return SensitivityMap(
            dct_strength_map=dct_strength_map,
            lsb_mask=lsb_mask,
            texture_map=texture_map,
            edge_map=edge_map,
            overall_capacity=overall_capacity
        )

    def _compute_texture_map(self, gray: np.ndarray) -> np.ndarray:
        """
        Compute local texture using variance and entropy.

        High texture regions are better for watermark embedding.
        """
        gray_float = gray.astype(np.float64)

        # Local variance
        kernel_size = self.texture_kernel_size
        mean = cv2.blur(gray_float, (kernel_size, kernel_size))
        sqr_mean = cv2.blur(gray_float ** 2, (kernel_size, kernel_size))
        variance = np.maximum(sqr_mean - mean ** 2, 0)

        # Normalize to 0-1
        max_var = variance.max()
        if max_var > 0:
            texture_map = variance / max_var
        else:
            texture_map = np.zeros_like(variance)

        return texture_map

    def _compute_edge_map(self, gray: np.ndarray) -> np.ndarray:
        """
        Compute edge density using Canny edge detector.

        Edges should be avoided for DCT embedding but can be used for LSB.
        """
        # Apply Canny edge detection
        edges = cv2.Canny(
            gray,
            self.edge_threshold_low,
            self.edge_threshold_high
        )

        # Dilate edges slightly for better coverage
        kernel = np.ones((3, 3), np.uint8)
        edges_dilated = cv2.dilate(edges, kernel, iterations=1)

        # Compute edge density per region
        kernel_size = self.block_size
        edge_density = cv2.blur(
            edges_dilated.astype(np.float64) / 255,
            (kernel_size, kernel_size)
        )

        return edge_density

    def _compute_saliency_map(self, image: np.ndarray) -> np.ndarray:
        """
        Compute visual saliency to identify important regions.

        Uses spectral residual approach for efficiency.
        """
        # Convert to Lab color space
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l_channel = lab[:, :, 0].astype(np.float64)

        # Spectral residual saliency
        # Resize for efficiency
        small_size = (64, 64)
        small = cv2.resize(l_channel, small_size)

        # FFT
        fft = np.fft.fft2(small)
        magnitude = np.abs(fft)
        phase = np.angle(fft)

        # Log spectrum
        log_magnitude = np.log(magnitude + 1e-10)

        # Spectral residual
        avg_log = cv2.blur(log_magnitude, (3, 3))
        residual = log_magnitude - avg_log

        # Reconstruct
        saliency_small = np.abs(np.fft.ifft2(
            np.exp(residual + 1j * phase)
        )) ** 2

        # Resize back
        saliency = cv2.resize(
            saliency_small,
            (image.shape[1], image.shape[0])
        )

        # Normalize
        saliency = cv2.GaussianBlur(saliency, (9, 9), 0)
        max_sal = saliency.max()
        if max_sal > 0:
            saliency = saliency / max_sal
        else:
            saliency = np.zeros_like(saliency)

        return saliency

    def _compute_dct_strength_map(
        self,
        texture_map: np.ndarray,
        edge_map: np.ndarray,
        saliency_map: np.ndarray,
        image_shape: Tuple[int, int]
    ) -> np.ndarray:
        """
        Compute per-block DCT embedding strength multipliers.

        Strategy:
        - Higher strength in high-texture regions (changes less visible)
        - Lower strength near edges (preserve sharpness)
        - Lower strength in salient regions (preserve important features)
        """
        height, width = image_shape
        blocks_h = height // self.block_size
        blocks_w = width // self.block_size

        strength_map = np.ones((blocks_h, blocks_w), dtype=np.float64)

        for i in range(blocks_h):
            for j in range(blocks_w):
                y_start = i * self.block_size
                y_end = min(y_start + self.block_size, height)
                x_start = j * self.block_size
                x_end = min(x_start + self.block_size, width)

                # Get block statistics
                block_texture = texture_map[y_start:y_end, x_start:x_end].mean()
                block_edge = edge_map[y_start:y_end, x_start:x_end].mean()
                block_saliency = saliency_map[y_start:y_end, x_start:x_end].mean()

                # Calculate strength multiplier
                # Base: 1.0, Range: 0.5 to 1.5

                # Texture boost: more texture = higher strength allowed
                texture_factor = 0.5 + block_texture  # 0.5 to 1.5

                # Edge penalty: more edges = lower strength
                edge_factor = 1.0 - (block_edge * 0.4)  # 0.6 to 1.0

                # Saliency penalty: high saliency = lower strength
                saliency_factor = 1.0 - (block_saliency * 0.3)  # 0.7 to 1.0

                # Combined strength
                strength = texture_factor * edge_factor * saliency_factor

                # Clamp to valid range
                strength_map[i, j] = np.clip(strength, 0.5, 1.5)

        return strength_map

    def _compute_lsb_mask(
        self,
        texture_map: np.ndarray,
        edge_map: np.ndarray
    ) -> np.ndarray:
        """
        Compute binary mask for LSB embedding locations.

        LSB embedding works best in:
        - High texture regions (changes invisible)
        - Near edges (noise is expected)
        """
        # High texture is good for LSB
        texture_threshold = 0.3
        texture_suitable = texture_map > texture_threshold

        # Edges are also suitable (but not required)
        edge_threshold = 0.1
        edge_suitable = edge_map > edge_threshold

        # Combine: texture OR edge
        lsb_mask = texture_suitable | edge_suitable

        return lsb_mask

    def _estimate_capacity(
        self,
        dct_strength_map: np.ndarray,
        lsb_mask: np.ndarray
    ) -> int:
        """
        Estimate total embedding capacity.

        Args:
            dct_strength_map: Per-block DCT strength
            lsb_mask: LSB embedding mask

        Returns:
            Estimated capacity in bits
        """
        # DCT capacity: 8 bits per block (with 8 coefficient pairs)
        # Only count blocks with strength > 0.7 as fully usable
        usable_blocks = np.sum(dct_strength_map > 0.7)
        dct_capacity = usable_blocks * 8

        # LSB capacity: 2 bits per pixel
        usable_pixels = np.sum(lsb_mask)
        lsb_capacity = usable_pixels * 2

        # Total (accounting for 3x redundancy)
        total = (dct_capacity + lsb_capacity) // 3

        return int(total)
