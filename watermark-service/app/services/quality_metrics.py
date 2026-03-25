"""
Image quality metrics for watermark evaluation.
Measures visual quality degradation after watermarking.
"""
import numpy as np
import cv2
from typing import Dict
from dataclasses import dataclass
from skimage.metrics import structural_similarity as ssim


@dataclass
class QualityReport:
    """Quality metrics report."""
    psnr: float
    ssim: float
    mse: float
    max_diff: int
    watermark_invisible: bool
    quality_grade: str  # 'excellent', 'good', 'acceptable', 'poor'


class QualityMetrics:
    """
    Image quality metrics for watermark evaluation.

    Calculates:
    - PSNR (Peak Signal-to-Noise Ratio)
    - SSIM (Structural Similarity Index)
    - MSE (Mean Squared Error)
    """

    def __init__(
        self,
        target_psnr: float = 40.0,
        target_ssim: float = 0.98
    ):
        """
        Initialize quality metrics calculator.

        Args:
            target_psnr: Target PSNR threshold for invisibility
            target_ssim: Target SSIM threshold for invisibility
        """
        self.target_psnr = target_psnr
        self.target_ssim = target_ssim

    def calculate(
        self,
        original: np.ndarray,
        watermarked: np.ndarray
    ) -> QualityReport:
        """
        Calculate quality metrics between original and watermarked images.

        Args:
            original: Original image (BGR)
            watermarked: Watermarked image (BGR)

        Returns:
            QualityReport with all metrics
        """
        # Ensure same shape
        if original.shape != watermarked.shape:
            raise ValueError("Images must have the same dimensions")

        # Convert to float for calculations
        orig_float = original.astype(np.float64)
        wm_float = watermarked.astype(np.float64)

        # Calculate MSE
        mse = np.mean((orig_float - wm_float) ** 2)

        # Calculate PSNR
        if mse == 0:
            psnr = float('inf')
        else:
            max_pixel = 255.0
            psnr = 10 * np.log10((max_pixel ** 2) / mse)

        # Calculate SSIM
        # Convert to grayscale for SSIM
        orig_gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
        wm_gray = cv2.cvtColor(watermarked, cv2.COLOR_BGR2GRAY)

        ssim_value = ssim(orig_gray, wm_gray)

        # Calculate max pixel difference
        diff = np.abs(orig_float - wm_float)
        max_diff = int(np.max(diff))

        # Determine invisibility
        invisible = psnr >= self.target_psnr and ssim_value >= self.target_ssim

        # Determine quality grade
        quality_grade = self._determine_grade(psnr, ssim_value)

        return QualityReport(
            psnr=psnr,
            ssim=ssim_value,
            mse=mse,
            max_diff=max_diff,
            watermark_invisible=invisible,
            quality_grade=quality_grade
        )

    def _determine_grade(self, psnr: float, ssim_value: float) -> str:
        """
        Determine quality grade based on metrics.

        Grades:
        - Excellent: PSNR >= 45 and SSIM >= 0.99
        - Good: PSNR >= 40 and SSIM >= 0.98
        - Acceptable: PSNR >= 35 and SSIM >= 0.95
        - Poor: Below acceptable thresholds
        """
        if psnr >= 45 and ssim_value >= 0.99:
            return "excellent"
        elif psnr >= 40 and ssim_value >= 0.98:
            return "good"
        elif psnr >= 35 and ssim_value >= 0.95:
            return "acceptable"
        else:
            return "poor"

    def calculate_per_channel(
        self,
        original: np.ndarray,
        watermarked: np.ndarray
    ) -> Dict[str, QualityReport]:
        """
        Calculate quality metrics for each color channel.

        Args:
            original: Original image (BGR)
            watermarked: Watermarked image (BGR)

        Returns:
            Dictionary with reports for 'blue', 'green', 'red' channels
        """
        channel_names = ['blue', 'green', 'red']
        reports = {}

        for i, name in enumerate(channel_names):
            orig_channel = original[:, :, i:i+1]
            wm_channel = watermarked[:, :, i:i+1]

            # Expand to 3 channels for the calculate method
            orig_3ch = np.repeat(orig_channel, 3, axis=2)
            wm_3ch = np.repeat(wm_channel, 3, axis=2)

            reports[name] = self.calculate(orig_3ch, wm_3ch)

        return reports

    def visualize_difference(
        self,
        original: np.ndarray,
        watermarked: np.ndarray,
        amplify: int = 10
    ) -> np.ndarray:
        """
        Create a visualization of the difference between images.

        Args:
            original: Original image
            watermarked: Watermarked image
            amplify: Amplification factor for visualization

        Returns:
            Difference image (amplified for visibility)
        """
        # Calculate absolute difference
        diff = cv2.absdiff(original, watermarked)

        # Amplify for visualization
        diff_amplified = np.clip(diff * amplify, 0, 255).astype(np.uint8)

        return diff_amplified

    @staticmethod
    def estimate_jpeg_quality_needed(psnr: float) -> int:
        """
        Estimate minimum JPEG quality to preserve watermark.

        Based on empirical relationship between PSNR and JPEG artifacts.

        Args:
            psnr: Current PSNR value

        Returns:
            Recommended minimum JPEG quality (0-100)
        """
        # Higher PSNR = more margin for compression
        if psnr >= 50:
            return 60  # Can handle aggressive compression
        elif psnr >= 45:
            return 70
        elif psnr >= 40:
            return 75
        elif psnr >= 35:
            return 85
        else:
            return 90  # Need high quality to preserve watermark
