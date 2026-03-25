const crypto = require('crypto');
const { Transform } = require('stream');

/**
 * Encryption Service for secure file storage
 * Uses AES-256-GCM with per-file derived keys via HKDF
 */
class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.ivLength = 12; // 96 bits recommended for GCM
    this.saltLength = 32; // 256 bits
    this.authTagLength = 16; // 128 bits
    this.keyLength = 32; // 256 bits for AES-256

    // Load master key from environment
    const masterKeyHex = process.env.ENCRYPTION_KEY;
    if (!masterKeyHex || masterKeyHex.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (256 bits)');
    }
    this.masterKey = Buffer.from(masterKeyHex, 'hex');
  }

  /**
   * Generate secure random bytes
   * @param {number} length - Number of bytes
   * @returns {Buffer}
   */
  generateRandomBytes(length) {
    return crypto.randomBytes(length);
  }

  /**
   * Generate encryption metadata for a new file
   * @returns {Object} { salt, iv } as hex strings
   */
  generateEncryptionMetadata() {
    return {
      salt: this.generateRandomBytes(this.saltLength).toString('hex'),
      iv: this.generateRandomBytes(this.ivLength).toString('hex')
    };
  }

  /**
   * Derive a per-file encryption key using HKDF
   * @param {string} fileId - Unique file identifier
   * @param {string} userId - Owner's user ID
   * @param {string} saltHex - Salt as hex string
   * @returns {Buffer} 256-bit derived key
   */
  deriveFileKey(fileId, userId, saltHex) {
    const salt = Buffer.from(saltHex, 'hex');
    const info = Buffer.from(`fashionguard:design:${fileId}:${userId}`, 'utf8');

    // HKDF-SHA256 key derivation
    return crypto.hkdfSync('sha256', this.masterKey, salt, info, this.keyLength);
  }

  /**
   * Encrypt a buffer
   * @param {Buffer} plaintext - Data to encrypt
   * @param {Buffer} key - 256-bit encryption key
   * @param {Buffer} iv - 12-byte initialization vector
   * @returns {Object} { ciphertext, authTag }
   */
  encrypt(plaintext, key, iv) {
    const cipher = crypto.createCipheriv(this.algorithm, key, iv, {
      authTagLength: this.authTagLength
    });

    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return { ciphertext, authTag };
  }

  /**
   * Decrypt a buffer
   * @param {Buffer} ciphertext - Encrypted data
   * @param {Buffer} key - 256-bit encryption key
   * @param {Buffer} iv - 12-byte initialization vector
   * @param {Buffer} authTag - 16-byte authentication tag
   * @returns {Buffer} Decrypted plaintext
   */
  decrypt(ciphertext, key, iv, authTag) {
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv, {
      authTagLength: this.authTagLength
    });

    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
  }

  /**
   * Create an encryption transform stream for large files
   * @param {Buffer} key - 256-bit encryption key
   * @param {Buffer} iv - 12-byte initialization vector
   * @returns {Object} { stream, getAuthTag }
   */
  createEncryptStream(key, iv) {
    const cipher = crypto.createCipheriv(this.algorithm, key, iv, {
      authTagLength: this.authTagLength
    });

    return {
      stream: cipher,
      getAuthTag: () => cipher.getAuthTag()
    };
  }

  /**
   * Create a decryption transform stream for large files
   * @param {Buffer} key - 256-bit encryption key
   * @param {Buffer} iv - 12-byte initialization vector
   * @param {Buffer} authTag - 16-byte authentication tag
   * @returns {crypto.Decipher}
   */
  createDecryptStream(key, iv, authTag) {
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv, {
      authTagLength: this.authTagLength
    });

    decipher.setAuthTag(authTag);

    return decipher;
  }

  /**
   * Calculate SHA-256 hash of a buffer
   * @param {Buffer} data - Data to hash
   * @returns {string} Hash as hex string
   */
  calculateHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Create a hash stream for calculating hash during streaming
   * @returns {Object} { stream, getHash }
   */
  createHashStream() {
    const hash = crypto.createHash('sha256');

    const stream = new Transform({
      transform(chunk, encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      }
    });

    return {
      stream,
      getHash: () => hash.digest('hex')
    };
  }

  /**
   * Encrypt file data with all metadata
   * @param {Buffer} fileData - File content
   * @param {string} fileId - Unique file identifier
   * @param {string} userId - Owner's user ID
   * @returns {Object} { encryptedData, salt, iv, authTag, fileHash }
   */
  encryptFile(fileData, fileId, userId) {
    // Generate encryption metadata
    const { salt, iv } = this.generateEncryptionMetadata();

    // Derive per-file key
    const key = this.deriveFileKey(fileId, userId, salt);

    // Calculate original file hash for integrity verification
    const fileHash = this.calculateHash(fileData);

    // Encrypt the file
    const ivBuffer = Buffer.from(iv, 'hex');
    const { ciphertext, authTag } = this.encrypt(fileData, key, ivBuffer);

    return {
      encryptedData: ciphertext,
      salt,
      iv,
      authTag: authTag.toString('hex'),
      fileHash
    };
  }

  /**
   * Decrypt file data
   * @param {Buffer} encryptedData - Encrypted file content
   * @param {string} fileId - Unique file identifier
   * @param {string} userId - Owner's user ID
   * @param {string} salt - Salt as hex string
   * @param {string} iv - IV as hex string
   * @param {string} authTag - Auth tag as hex string
   * @returns {Buffer} Decrypted file content
   */
  decryptFile(encryptedData, fileId, userId, salt, iv, authTag) {
    // Derive the same per-file key
    const key = this.deriveFileKey(fileId, userId, salt);

    // Convert hex strings to buffers
    const ivBuffer = Buffer.from(iv, 'hex');
    const authTagBuffer = Buffer.from(authTag, 'hex');

    // Decrypt the file
    return this.decrypt(encryptedData, key, ivBuffer, authTagBuffer);
  }

  /**
   * Verify file integrity by comparing hashes
   * @param {Buffer} data - File data to verify
   * @param {string} expectedHash - Expected SHA-256 hash
   * @returns {boolean}
   */
  verifyIntegrity(data, expectedHash) {
    const actualHash = this.calculateHash(data);
    return crypto.timingSafeEqual(
      Buffer.from(actualHash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  }
}

// Export singleton instance
const encryptionService = new EncryptionService();

module.exports = {
  encryptionService,
  EncryptionService
};
