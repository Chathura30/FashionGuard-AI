const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Storage Service for secure file management
 * Handles encrypted file storage with proper directory structure
 */
class StorageService {
  constructor() {
    // Resolve storage path from environment
    this.basePath = path.resolve(
      __dirname,
      '..',
      process.env.STORAGE_PATH || '../storage/encrypted'
    );

    // Ensure base directory exists on initialization
    this.initializeStorage();
  }

  /**
   * Initialize storage directory structure
   */
  async initializeStorage() {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      console.error('Failed to initialize storage directory:', error);
    }
  }

  /**
   * Generate a unique file ID
   * @returns {string} UUID v4
   */
  generateFileId() {
    return uuidv4();
  }

  /**
   * Get the directory path for a user's designs
   * @param {string} userId - User ID
   * @returns {string} Absolute path
   */
  getUserDirectory(userId) {
    return path.join(this.basePath, userId.toString());
  }

  /**
   * Get the directory path for a specific design
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   * @returns {string} Absolute path
   */
  getDesignDirectory(userId, designId) {
    return path.join(this.basePath, userId.toString(), designId.toString());
  }

  /**
   * Get the full path for an encrypted file
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   * @param {string} fileId - File ID
   * @returns {string} Absolute path to .enc file
   */
  getFilePath(userId, designId, fileId) {
    return path.join(
      this.getDesignDirectory(userId, designId),
      `${fileId}.enc`
    );
  }

  /**
   * Get the relative storage path (for database storage)
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   * @param {string} fileId - File ID
   * @returns {string} Relative path
   */
  getRelativeStoragePath(userId, designId, fileId) {
    return path.join(userId.toString(), designId.toString(), `${fileId}.enc`);
  }

  /**
   * Ensure the design directory exists with proper permissions
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   */
  async ensureDesignDirectory(userId, designId) {
    const dir = this.getDesignDirectory(userId, designId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  /**
   * Save encrypted file data to disk
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   * @param {string} fileId - File ID
   * @param {Buffer} encryptedData - Encrypted file content
   * @returns {Object} { filePath, relativePath }
   */
  async saveEncryptedFile(userId, designId, fileId, encryptedData) {
    // Ensure directory exists
    await this.ensureDesignDirectory(userId, designId);

    const filePath = this.getFilePath(userId, designId, fileId);
    const relativePath = this.getRelativeStoragePath(userId, designId, fileId);

    // Write encrypted data to file
    await fs.writeFile(filePath, encryptedData);

    return { filePath, relativePath };
  }

  /**
   * Read encrypted file data from disk
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   * @param {string} fileId - File ID
   * @returns {Buffer} Encrypted file content
   */
  async readEncryptedFile(userId, designId, fileId) {
    const filePath = this.getFilePath(userId, designId, fileId);

    try {
      return await fs.readFile(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Encrypted file not found');
      }
      throw error;
    }
  }

  /**
   * Read encrypted file from relative path
   * @param {string} relativePath - Relative path stored in database
   * @returns {Buffer} Encrypted file content
   */
  async readFromRelativePath(relativePath) {
    const filePath = path.join(this.basePath, relativePath);

    try {
      return await fs.readFile(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Encrypted file not found');
      }
      throw error;
    }
  }

  /**
   * Create a read stream for large file downloads
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   * @param {string} fileId - File ID
   * @returns {ReadStream}
   */
  createReadStream(userId, designId, fileId) {
    const filePath = this.getFilePath(userId, designId, fileId);
    return fsSync.createReadStream(filePath);
  }

  /**
   * Create a write stream for large file uploads
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   * @param {string} fileId - File ID
   * @returns {WriteStream}
   */
  async createWriteStream(userId, designId, fileId) {
    await this.ensureDesignDirectory(userId, designId);
    const filePath = this.getFilePath(userId, designId, fileId);
    return fsSync.createWriteStream(filePath);
  }

  /**
   * Delete a single encrypted file
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   * @param {string} fileId - File ID
   */
  async deleteFile(userId, designId, fileId) {
    const filePath = this.getFilePath(userId, designId, fileId);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File already doesn't exist, that's fine
    }
  }

  /**
   * Delete all files for a design
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   */
  async deleteDesignFiles(userId, designId) {
    const dir = this.getDesignDirectory(userId, designId);

    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Delete all files for a user
   * @param {string} userId - User ID
   */
  async deleteUserFiles(userId) {
    const dir = this.getUserDirectory(userId);

    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Check if a file exists
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   * @param {string} fileId - File ID
   * @returns {boolean}
   */
  async fileExists(userId, designId, fileId) {
    const filePath = this.getFilePath(userId, designId, fileId);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   * @param {string} userId - User ID
   * @param {string} designId - Design ID
   * @param {string} fileId - File ID
   * @returns {Object} File stats
   */
  async getFileStats(userId, designId, fileId) {
    const filePath = this.getFilePath(userId, designId, fileId);
    return await fs.stat(filePath);
  }

  /**
   * Calculate total storage used by a user
   * @param {string} userId - User ID
   * @returns {number} Total bytes used
   */
  async calculateUserStorage(userId) {
    const userDir = this.getUserDirectory(userId);
    let totalSize = 0;

    try {
      const designDirs = await fs.readdir(userDir);

      for (const designId of designDirs) {
        const designDir = path.join(userDir, designId);
        const stats = await fs.stat(designDir);

        if (stats.isDirectory()) {
          const files = await fs.readdir(designDir);

          for (const file of files) {
            const filePath = path.join(designDir, file);
            const fileStats = await fs.stat(filePath);
            totalSize += fileStats.size;
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // User has no files yet
    }

    return totalSize;
  }

  /**
   * Validate file path to prevent directory traversal attacks
   * @param {string} inputPath - Path to validate
   * @returns {boolean}
   */
  isValidPath(inputPath) {
    const resolvedPath = path.resolve(this.basePath, inputPath);
    return resolvedPath.startsWith(this.basePath);
  }
}

// Export singleton instance
const storageService = new StorageService();

module.exports = {
  storageService,
  StorageService
};
