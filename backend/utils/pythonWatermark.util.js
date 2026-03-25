/**
 * Python Watermark Service Integration
 * Provides high-level interface to the Python AI watermarking microservice
 */

const axios = require('axios');
const FormData = require('form-data');

const PYTHON_SERVICE_URL = process.env.PYTHON_WATERMARK_URL || 'http://localhost:8000';
const TIMEOUT_MS = 120000; // 2 minutes for large images

class PythonWatermarkService {
  constructor() {
    this.client = axios.create({
      baseURL: PYTHON_SERVICE_URL,
      timeout: TIMEOUT_MS,
      maxContentLength: 100 * 1024 * 1024, // 100MB
      maxBodyLength: 100 * 1024 * 1024,
    });

    this.isAvailable = null;
    this.lastHealthCheck = null;
  }

  /**
   * Check if Python service is available
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    // Cache health status for 30 seconds
    const now = Date.now();
    if (this.isAvailable !== null && this.lastHealthCheck && (now - this.lastHealthCheck) < 30000) {
      return this.isAvailable;
    }

    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      this.isAvailable = response.data.status === 'healthy' || response.data.status === 'degraded';
      this.lastHealthCheck = now;
      return this.isAvailable;
    } catch (error) {
      this.isAvailable = false;
      this.lastHealthCheck = now;
      console.warn('Python watermark service unavailable:', error.message);
      return false;
    }
  }

  /**
   * Embed watermark using Python service
   * @param {Buffer} imageBuffer - Decrypted image buffer
   * @param {Object} payload - Watermark payload data
   * @param {string} payload.designerId - Designer's unique ID
   * @param {string} payload.designId - Design's unique ID
   * @param {string} payload.fileHash - SHA-256 hash of original file
   * @param {number} payload.timestamp - Unix timestamp
   * @param {string} encryptionKey - Hex-encoded AES-256 key (64 chars)
   * @returns {Promise<Object>} - { watermarkedImage: Buffer, watermarkId, quality }
   */
  async embedWatermark(imageBuffer, payload, encryptionKey) {
    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: 'design.png',
      contentType: 'image/png'
    });
    formData.append('designer_id', payload.designerId);
    formData.append('design_id', payload.designId);
    formData.append('file_hash', payload.fileHash);
    formData.append('timestamp', (payload.timestamp || Math.floor(Date.now() / 1000)).toString());
    formData.append('encryption_key', encryptionKey);

    try {
      const response = await this.client.post('/embed/raw', formData, {
        headers: formData.getHeaders(),
        responseType: 'arraybuffer'
      });

      // Parse quality metrics from header
      let quality = {};
      try {
        const qualityHeader = response.headers['x-quality-metrics'];
        if (qualityHeader) {
          quality = JSON.parse(qualityHeader);
        }
      } catch (e) {
        console.warn('Failed to parse quality metrics:', e.message);
      }

      return {
        watermarkedImage: Buffer.from(response.data),
        watermarkId: response.headers['x-watermark-id'] || `wm_${Date.now().toString(36)}`,
        quality,
        processingTimeMs: parseFloat(response.headers['x-processing-time-ms'] || '0'),
        success: response.headers['x-success'] === 'true'
      };
    } catch (error) {
      if (error.response) {
        const errorData = error.response.data;
        let message = 'Python watermark embedding failed';
        if (Buffer.isBuffer(errorData)) {
          try {
            message = JSON.parse(errorData.toString()).message || message;
          } catch (e) {}
        }
        throw new Error(message);
      }
      throw new Error(`Python watermark service error: ${error.message}`);
    }
  }

  /**
   * Embed watermark and get full JSON response
   * @param {Buffer} imageBuffer - Decrypted image buffer
   * @param {Object} payload - Watermark payload data
   * @param {string} encryptionKey - Hex-encoded AES-256 key
   * @returns {Promise<Object>} - Full embedding response with base64 image
   */
  async embedWatermarkFull(imageBuffer, payload, encryptionKey) {
    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: 'design.png',
      contentType: 'image/png'
    });
    formData.append('designer_id', payload.designerId);
    formData.append('design_id', payload.designId);
    formData.append('file_hash', payload.fileHash);
    formData.append('timestamp', (payload.timestamp || Math.floor(Date.now() / 1000)).toString());
    formData.append('encryption_key', encryptionKey);

    const response = await this.client.post('/embed', formData, {
      headers: formData.getHeaders()
    });

    return response.data;
  }

  /**
   * Extract watermark using Python service
   * @param {Buffer} imageBuffer - Image buffer to extract from
   * @param {string} encryptionKey - Hex-encoded AES-256 decryption key
   * @param {number} [expectedBits] - Expected payload bits (optional optimization)
   * @returns {Promise<Object>} - Extraction result with payload and confidence
   */
  async extractWatermark(imageBuffer, encryptionKey, expectedBits = null) {
    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: 'design.png',
      contentType: 'image/png'
    });
    formData.append('encryption_key', encryptionKey);
    if (expectedBits) {
      formData.append('expected_bits', expectedBits.toString());
    }

    const response = await this.client.post('/extract', formData, {
      headers: formData.getHeaders()
    });

    return response.data;
  }

  /**
   * Verify watermark against ownership records
   * @param {Buffer} imageBuffer - Image buffer to verify
   * @param {Array<Object>} ownershipRecords - List of ownership records
   * @returns {Promise<Object>} - Verification result with matches
   */
  async verifyOwnership(imageBuffer, ownershipRecords) {
    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: 'design.png',
      contentType: 'image/png'
    });
    formData.append('records', JSON.stringify(ownershipRecords));

    const response = await this.client.post('/verify', formData, {
      headers: formData.getHeaders()
    });

    return response.data;
  }

  /**
   * Verify watermark against single ownership record
   * @param {Buffer} imageBuffer - Image buffer to verify
   * @param {string} designId - Expected design ID
   * @param {string} designerId - Expected designer ID
   * @param {string} encryptionKey - Encryption key
   * @param {number} [timestamp] - Expected timestamp (optional)
   * @returns {Promise<Object>} - Verification result
   */
  async verifySingle(imageBuffer, designId, designerId, encryptionKey, timestamp = null) {
    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: 'design.png',
      contentType: 'image/png'
    });
    formData.append('design_id', designId);
    formData.append('designer_id', designerId);
    formData.append('encryption_key', encryptionKey);
    if (timestamp) {
      formData.append('timestamp', timestamp.toString());
    }

    const response = await this.client.post('/verify/single', formData, {
      headers: formData.getHeaders()
    });

    return response.data;
  }

  /**
   * Get service health details
   * @returns {Promise<Object>} - Health status with checks
   */
  async getHealthDetails() {
    const response = await this.client.get('/health');
    return response.data;
  }
}

// Singleton instance
const pythonWatermarkService = new PythonWatermarkService();

module.exports = {
  pythonWatermarkService,
  PythonWatermarkService
};
