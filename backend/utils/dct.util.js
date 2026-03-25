/**
 * Discrete Cosine Transform (DCT) Utility
 * Implements 2D DCT and IDCT for 8x8 blocks
 * Used for frequency-domain watermarking
 */

class DCTService {
  constructor() {
    this.blockSize = 8;
    // Precompute cosine coefficients for faster DCT
    this.cosTable = this.precomputeCosineTable();
    this.alpha = this.precomputeAlpha();
  }

  /**
   * Precompute cosine values for DCT
   * cos((2x + 1) * u * PI / 16) for 8x8 blocks
   */
  precomputeCosineTable() {
    const N = this.blockSize;
    const table = new Array(N);

    for (let u = 0; u < N; u++) {
      table[u] = new Array(N);
      for (let x = 0; x < N; x++) {
        table[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
      }
    }

    return table;
  }

  /**
   * Precompute alpha normalization factors
   * alpha(0) = 1/sqrt(N), alpha(u) = sqrt(2/N) for u > 0
   */
  precomputeAlpha() {
    const N = this.blockSize;
    const alpha = new Array(N);

    alpha[0] = 1 / Math.sqrt(N);
    for (let i = 1; i < N; i++) {
      alpha[i] = Math.sqrt(2 / N);
    }

    return alpha;
  }

  /**
   * Apply 1D DCT to a row/column
   * @param {number[]} input - Input array of length 8
   * @returns {number[]} DCT coefficients
   */
  dct1d(input) {
    const N = this.blockSize;
    const output = new Array(N).fill(0);

    for (let u = 0; u < N; u++) {
      let sum = 0;
      for (let x = 0; x < N; x++) {
        sum += input[x] * this.cosTable[u][x];
      }
      output[u] = this.alpha[u] * sum;
    }

    return output;
  }

  /**
   * Apply 1D IDCT to a row/column
   * @param {number[]} input - DCT coefficients
   * @returns {number[]} Reconstructed values
   */
  idct1d(input) {
    const N = this.blockSize;
    const output = new Array(N).fill(0);

    for (let x = 0; x < N; x++) {
      let sum = 0;
      for (let u = 0; u < N; u++) {
        sum += this.alpha[u] * input[u] * this.cosTable[u][x];
      }
      output[x] = sum;
    }

    return output;
  }

  /**
   * Apply 2D DCT to an 8x8 block
   * Uses separable property: 2D DCT = 1D DCT on rows, then 1D DCT on columns
   * @param {number[][]} block - 8x8 pixel block
   * @returns {number[][]} 8x8 DCT coefficient block
   */
  dct2d(block) {
    const N = this.blockSize;
    const temp = new Array(N);
    const result = new Array(N);

    // Initialize result array
    for (let i = 0; i < N; i++) {
      temp[i] = new Array(N);
      result[i] = new Array(N);
    }

    // Apply 1D DCT to each row
    for (let i = 0; i < N; i++) {
      const row = block[i];
      const dctRow = this.dct1d(row);
      for (let j = 0; j < N; j++) {
        temp[i][j] = dctRow[j];
      }
    }

    // Apply 1D DCT to each column
    for (let j = 0; j < N; j++) {
      const col = new Array(N);
      for (let i = 0; i < N; i++) {
        col[i] = temp[i][j];
      }
      const dctCol = this.dct1d(col);
      for (let i = 0; i < N; i++) {
        result[i][j] = dctCol[i];
      }
    }

    return result;
  }

  /**
   * Apply 2D IDCT to an 8x8 block
   * @param {number[][]} block - 8x8 DCT coefficient block
   * @returns {number[][]} 8x8 reconstructed pixel block
   */
  idct2d(block) {
    const N = this.blockSize;
    const temp = new Array(N);
    const result = new Array(N);

    // Initialize arrays
    for (let i = 0; i < N; i++) {
      temp[i] = new Array(N);
      result[i] = new Array(N);
    }

    // Apply 1D IDCT to each column
    for (let j = 0; j < N; j++) {
      const col = new Array(N);
      for (let i = 0; i < N; i++) {
        col[i] = block[i][j];
      }
      const idctCol = this.idct1d(col);
      for (let i = 0; i < N; i++) {
        temp[i][j] = idctCol[i];
      }
    }

    // Apply 1D IDCT to each row
    for (let i = 0; i < N; i++) {
      const row = temp[i];
      const idctRow = this.idct1d(row);
      for (let j = 0; j < N; j++) {
        result[i][j] = idctRow[j];
      }
    }

    return result;
  }

  /**
   * Get mid-frequency coefficient positions for watermark embedding
   * These positions survive JPEG compression while being imperceptible
   * @returns {Array} Array of [row, col] positions
   */
  getMidFrequencyPositions() {
    // Mid-frequency positions in zigzag order (positions 10-30 approximately)
    // These survive JPEG quantization better than high frequencies
    // while being less perceptible than low frequencies
    return [
      [1, 2], [2, 1], [3, 0],  // Position 3-5 in zigzag
      [2, 2], [1, 3], [0, 4],  // Position 6-8
      [1, 4], [2, 3], [3, 2],  // Position 9-11
      [4, 1], [3, 3], [2, 4],  // Position 12-14
      [4, 2], [3, 4], [4, 3],  // Position 15-17
      [5, 2], [4, 4], [5, 3],  // Position 18-20
    ];
  }

  /**
   * Get coefficient pairs for QIM (Quantization Index Modulation) embedding
   * Each pair is used to embed one bit
   * @returns {Array} Array of position pairs [[pos1, pos2], ...]
   */
  getEmbeddingPairs() {
    return [
      [[1, 2], [2, 1]],   // Pair 1
      [[2, 2], [1, 3]],   // Pair 2
      [[3, 1], [1, 4]],   // Pair 3
      [[2, 3], [3, 2]],   // Pair 4
      [[4, 1], [1, 5]],   // Pair 5
      [[3, 3], [2, 4]],   // Pair 6
      [[4, 2], [2, 5]],   // Pair 7
      [[3, 4], [4, 3]],   // Pair 8
    ];
  }

  /**
   * Embed a single bit using coefficient relationship
   * Uses the relationship between two coefficients to encode bit
   * @param {number[][]} dctBlock - DCT coefficient block
   * @param {number} bit - Bit to embed (0 or 1)
   * @param {Array} pair - Coefficient pair positions
   * @param {number} delta - Embedding strength
   * @returns {number[][]} Modified DCT block
   */
  embedBit(dctBlock, bit, pair, delta) {
    const [pos1, pos2] = pair;
    const c1 = dctBlock[pos1[0]][pos1[1]];
    const c2 = dctBlock[pos2[0]][pos2[1]];

    // QIM-based embedding
    if (bit === 1) {
      // Ensure c1 > c2 + delta
      if (c1 <= c2 + delta) {
        const avg = (c1 + c2) / 2;
        dctBlock[pos1[0]][pos1[1]] = avg + delta / 2 + 1;
        dctBlock[pos2[0]][pos2[1]] = avg - delta / 2 - 1;
      }
    } else {
      // Ensure c2 > c1 + delta
      if (c2 <= c1 + delta) {
        const avg = (c1 + c2) / 2;
        dctBlock[pos1[0]][pos1[1]] = avg - delta / 2 - 1;
        dctBlock[pos2[0]][pos2[1]] = avg + delta / 2 + 1;
      }
    }

    return dctBlock;
  }

  /**
   * Extract a single bit from coefficient relationship
   * @param {number[][]} dctBlock - DCT coefficient block
   * @param {Array} pair - Coefficient pair positions
   * @returns {number} Extracted bit (0 or 1)
   */
  extractBit(dctBlock, pair) {
    const [pos1, pos2] = pair;
    const c1 = dctBlock[pos1[0]][pos1[1]];
    const c2 = dctBlock[pos2[0]][pos2[1]];

    return c1 > c2 ? 1 : 0;
  }

  /**
   * Convert a 1D array to 8x8 block
   * @param {number[]} data - Array of 64 values
   * @returns {number[][]} 8x8 block
   */
  arrayToBlock(data) {
    const block = [];
    for (let i = 0; i < 8; i++) {
      block.push(data.slice(i * 8, (i + 1) * 8));
    }
    return block;
  }

  /**
   * Convert 8x8 block to 1D array
   * @param {number[][]} block - 8x8 block
   * @returns {number[]} Array of 64 values
   */
  blockToArray(block) {
    const data = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        data.push(block[i][j]);
      }
    }
    return data;
  }

  /**
   * Clamp value to valid pixel range
   * @param {number} value - Value to clamp
   * @returns {number} Clamped value [0, 255]
   */
  clamp(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }
}

// Export singleton
const dctService = new DCTService();

module.exports = {
  dctService,
  DCTService
};
