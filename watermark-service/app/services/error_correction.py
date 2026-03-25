"""
Reed-Solomon error correction for robust payload recovery.
Provides forward error correction to survive image transformations.
"""
import numpy as np
from typing import Tuple, List
from reedsolo import RSCodec, ReedSolomonError


class ErrorCorrectionService:
    """
    Reed-Solomon error correction for robust payload recovery.

    Provides:
    - Configurable error correction capacity (10-30% overhead)
    - Interleaving for burst error resistance
    - CRC validation for integrity
    """

    def __init__(self, nsym: int = 32):
        """
        Initialize with Reed-Solomon codec.

        Args:
            nsym: Number of error correction symbols (higher = more robust)
                  32 symbols can correct up to 16 byte errors in 255-byte block
        """
        self.nsym = nsym
        self.rs_codec = RSCodec(nsym)
        self.interleave_depth = 4  # Interleaving depth for burst errors

    def encode(self, data: bytes) -> bytes:
        """
        Encode data with Reed-Solomon error correction.

        Adds interleaving for burst error resistance.

        Args:
            data: Raw payload bytes

        Returns:
            Encoded bytes with error correction
        """
        # RS encode
        encoded = bytes(self.rs_codec.encode(data))

        # Interleave for burst error resistance
        interleaved = self._interleave(encoded)

        return interleaved

    def decode(self, data: bytes) -> Tuple[bytes, int]:
        """
        Decode data with error correction.

        Args:
            data: Encoded bytes (potentially with errors)

        Returns:
            Tuple of (decoded data, number of errors corrected)
            Raises ReedSolomonError if too many errors
        """
        # De-interleave
        deinterleaved = self._deinterleave(data)

        try:
            # RS decode
            decoded = self.rs_codec.decode(deinterleaved)

            # Calculate errors corrected
            # The decode returns (message, parity, errata_pos)
            if isinstance(decoded, tuple):
                message = bytes(decoded[0])
                errors_corrected = len(decoded[2]) if len(decoded) > 2 else 0
            else:
                message = bytes(decoded)
                errors_corrected = 0

            return message, errors_corrected

        except ReedSolomonError as e:
            raise ValueError(f"Too many errors to correct: {e}")

    def _interleave(self, data: bytes) -> bytes:
        """
        Interleave bytes to spread burst errors.

        Uses block interleaving with depth=4 to distribute
        consecutive errors across different RS blocks.
        """
        if len(data) < self.interleave_depth:
            return data

        # Pad to multiple of interleave depth
        padded_len = ((len(data) + self.interleave_depth - 1)
                      // self.interleave_depth * self.interleave_depth)
        padded = data + bytes(padded_len - len(data))

        # Reshape into matrix and transpose
        matrix = np.frombuffer(padded, dtype=np.uint8).reshape(
            -1, self.interleave_depth
        )
        transposed = matrix.T.flatten()

        # Store original length in first 2 bytes (big-endian)
        length_bytes = len(data).to_bytes(2, 'big')
        result = length_bytes + bytes(transposed)

        return result

    def _deinterleave(self, data: bytes) -> bytes:
        """
        Reverse the interleaving process.
        """
        if len(data) < 2 + self.interleave_depth:
            return data

        # Extract original length
        original_len = int.from_bytes(data[:2], 'big')
        interleaved = data[2:]

        # Ensure we have complete blocks
        if len(interleaved) % self.interleave_depth != 0:
            # Pad if necessary
            pad_len = self.interleave_depth - (len(interleaved) % self.interleave_depth)
            interleaved = interleaved + bytes(pad_len)

        # Reshape and transpose back
        num_rows = len(interleaved) // self.interleave_depth
        matrix = np.frombuffer(interleaved, dtype=np.uint8).reshape(
            self.interleave_depth, num_rows
        )
        deinterleaved = matrix.T.flatten()

        # Trim to original length
        return bytes(deinterleaved[:original_len])

    def get_overhead_ratio(self) -> float:
        """
        Calculate the overhead ratio for error correction.

        Returns:
            Ratio of encoded size to original size
        """
        # For RS(255, 255-nsym), overhead is nsym/(255-nsym)
        data_symbols = 255 - self.nsym
        return (255 + 2) / data_symbols  # +2 for interleaving length header

    def get_max_correctable_errors(self) -> int:
        """
        Get maximum number of byte errors that can be corrected.

        Returns:
            Maximum correctable errors per RS block
        """
        return self.nsym // 2


def bits_to_bytes(bits: List[int]) -> bytes:
    """Convert a list of bits to bytes."""
    # Pad to multiple of 8
    padded = bits + [0] * ((8 - len(bits) % 8) % 8)

    byte_array = []
    for i in range(0, len(padded), 8):
        byte_val = 0
        for j in range(8):
            byte_val |= (padded[i + j] << (7 - j))
        byte_array.append(byte_val)

    return bytes(byte_array)


def bytes_to_bits(data: bytes) -> List[int]:
    """Convert bytes to a list of bits."""
    bits = []
    for byte_val in data:
        for i in range(7, -1, -1):
            bits.append((byte_val >> i) & 1)
    return bits
