const Design = require('../models/Design.model');
const Watermark = require('../models/Watermark.model');
const AccessLog = require('../models/AccessLog.model');
const { watermarkService } = require('../utils/watermark.util');
const { pythonWatermarkService } = require('../utils/pythonWatermark.util');
const { encryptionService } = require('../utils/encryption.util');
const { storageService } = require('../utils/storage.util');
const crypto = require('crypto');

// Configuration for Python watermark service
const USE_PYTHON_WATERMARK = process.env.USE_PYTHON_WATERMARK === 'true';

// Helper: safely get owner ID string from either ObjectId or populated User document
const getOwnerId = (owner) => (owner?._id || owner).toString();

/**
 * @desc    Add invisible watermark to a design
 * @route   POST /api/designs/:id/watermark
 * @access  Private (ADD_WATERMARK permission)
 */
exports.addWatermark = async (req, res) => {
  try {
    const design = req.design; // Set by verifyEditAccess middleware
    const userId = req.user.id;

    // Check if already watermarked
    if (design.isWatermarked) {
      return res.status(400).json({
        success: false,
        message: 'Design is already watermarked'
      });
    }

    // Check if image format is supported
    if (!watermarkService.isSupportedFormat(design.mimeType)) {
      return res.status(400).json({
        success: false,
        message: 'Watermarking is only supported for JPEG, PNG, WebP, and TIFF images'
      });
    }

    // Get design with encryption metadata
    const designWithEncryption = await Design.findWithEncryption(design._id);

    // Read and decrypt the original file
    const encryptedData = await storageService.readFromRelativePath(
      designWithEncryption.storagePath
    );

    const decryptedData = encryptionService.decryptFile(
      encryptedData,
      designWithEncryption.fileId,
      getOwnerId(designWithEncryption.owner),
      designWithEncryption.encryptionSalt,
      designWithEncryption.encryptionIV,
      designWithEncryption.encryptionAuthTag
    );

    // Generate watermark key
    const watermarkKey = watermarkService.generateWatermarkKey();

    let watermarkedImage, watermarkId, embeddedBits, algorithmUsed, qualityMetrics;

    // Check if Python service should be used and is available
    const usePython = USE_PYTHON_WATERMARK && await pythonWatermarkService.checkHealth();

    if (usePython) {
      // Use Python AI-powered watermarking service
      console.log('Using Python watermark service for enhanced AI-powered watermarking');

      const pythonResult = await pythonWatermarkService.embedWatermark(
        decryptedData,
        {
          designerId: getOwnerId(design.owner),
          designId: design._id.toString(),
          fileHash: designWithEncryption.fileHash,
          timestamp: Math.floor(Date.now() / 1000)
        },
        watermarkKey
      );

      watermarkedImage = pythonResult.watermarkedImage;
      watermarkId = pythonResult.watermarkId;
      embeddedBits = pythonResult.quality?.dct_bits || 0;
      algorithmUsed = 'dct-lsb-hybrid-v2';
      qualityMetrics = pythonResult.quality;

      console.log(`Python watermark applied: PSNR=${qualityMetrics?.psnr?.toFixed(1)}dB, SSIM=${qualityMetrics?.ssim?.toFixed(3)}`);
    } else {
      // Use JavaScript DCT watermarking (fallback)
      console.log('Using JavaScript watermark service');

      // Create watermark payload
      const payload = watermarkService.createPayload(
        getOwnerId(design.owner),
        design._id.toString(),
        designWithEncryption.fileHash
      );

      // Embed watermark
      const jsResult = await watermarkService.embedWatermark(
        decryptedData,
        payload,
        watermarkKey
      );

      watermarkedImage = jsResult.watermarkedImage;
      watermarkId = jsResult.watermarkId;
      embeddedBits = jsResult.embeddedBits;
      algorithmUsed = 'dct-v1';
      qualityMetrics = null;
    }

    // Encrypt the watermark key for storage
    const keySalt = crypto.randomBytes(32).toString('hex');
    const keyIv = crypto.randomBytes(12).toString('hex');
    const keyDerivedKey = encryptionService.deriveFileKey(
      'watermark-key',
      getOwnerId(design.owner),
      keySalt
    );

    const keyCipher = crypto.createCipheriv('aes-256-gcm',
      keyDerivedKey, Buffer.from(keyIv, 'hex'));
    const encryptedKey = Buffer.concat([
      keyCipher.update(Buffer.from(watermarkKey, 'hex')),
      keyCipher.final()
    ]).toString('hex');
    const keyAuthTag = keyCipher.getAuthTag().toString('hex');

    // Save watermarked image (re-encrypt with same parameters)
    const watermarkedFileId = storageService.generateFileId();
    const {
      encryptedData: encryptedWatermarked,
      salt: wmSalt,
      iv: wmIv,
      authTag: wmAuthTag
    } = encryptionService.encryptFile(
      watermarkedImage,
      watermarkedFileId,
      getOwnerId(design.owner)
    );

    const { relativePath: watermarkedPath } = await storageService.saveEncryptedFile(
      getOwnerId(design.owner),
      design._id.toString(),
      watermarkedFileId,
      encryptedWatermarked
    );

    // Create Watermark record
    const watermark = new Watermark({
      design: design._id,
      watermarkId,
      encryptedKey,
      keySalt,
      keyIv,
      keyAuthTag,
      algorithm: algorithmUsed,
      strength: watermarkService.delta,
      redundancy: watermarkService.redundancy,
      payload: {
        designerId: design.owner,
        designId: design._id,
        timestamp: new Date(),
        fileHashPrefix: designWithEncryption.fileHash.substring(0, 16)
      },
      appliedBy: userId,
      qualityMetrics: qualityMetrics ? {
        psnr: qualityMetrics.psnr,
        ssim: qualityMetrics.ssim,
        invisible: qualityMetrics.invisible
      } : null
    });

    await watermark.save();

    // Update design
    design.setWatermarked(watermarkId, userId, algorithmUsed);
    design.watermarkedFilePath = watermarkedPath;
    design.watermarkedFileId = watermarkedFileId;
    design.watermarkedEncryptionSalt = wmSalt;
    design.watermarkedEncryptionIV = wmIv;
    design.watermarkedEncryptionAuthTag = wmAuthTag;
    await design.save();

    // Log action
    await AccessLog.logAccess({
      userId,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'WATERMARK_ADD',
      resourceType: 'design',
      resourceId: design._id,
      resourceName: design.title,
      endpoint: req.originalUrl,
      method: 'POST',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: {
        watermarkId,
        algorithm: algorithmUsed,
        embeddedBits,
        usedPythonService: usePython,
        qualityMetrics
      }
    });

    res.status(201).json({
      success: true,
      message: 'Watermark applied successfully',
      data: {
        watermarkId,
        algorithm: algorithmUsed,
        appliedAt: watermark.createdAt,
        quality: qualityMetrics ? {
          psnr: qualityMetrics.psnr,
          ssim: qualityMetrics.ssim,
          invisible: qualityMetrics.invisible
        } : null,
        design: {
          id: design._id,
          title: design.title
        }
      }
    });

  } catch (error) {
    console.error('Add watermark error:', error);

    await AccessLog.logAccess({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'WATERMARK_ADD',
      resourceType: 'design',
      resourceId: req.params.id,
      endpoint: req.originalUrl,
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: false,
      errorMessage: error.message
    });

    res.status(500).json({
      success: false,
      message: 'Failed to apply watermark. Please try again.'
    });
  }
};

/**
 * @desc    Verify watermark on a design
 * @route   POST /api/designs/:id/watermark/verify
 * @access  Private (VERIFY_WATERMARK permission)
 */
exports.verifyWatermark = async (req, res) => {
  try {
    const design = req.design;
    const userId = req.user.id;

    if (!design.isWatermarked) {
      return res.status(400).json({
        success: false,
        message: 'Design is not watermarked'
      });
    }

    // Get watermark with keys
    const watermark = await Watermark.findWithKeys(design._id);

    if (!watermark) {
      return res.status(404).json({
        success: false,
        message: 'Watermark record not found'
      });
    }

    // Decrypt the watermark key
    const keyDerivedKey = encryptionService.deriveFileKey(
      'watermark-key',
      getOwnerId(design.owner),
      watermark.keySalt
    );

    const keyDecipher = crypto.createDecipheriv('aes-256-gcm',
      keyDerivedKey, Buffer.from(watermark.keyIv, 'hex'));
    keyDecipher.setAuthTag(Buffer.from(watermark.keyAuthTag, 'hex'));

    const watermarkKey = Buffer.concat([
      keyDecipher.update(Buffer.from(watermark.encryptedKey, 'hex')),
      keyDecipher.final()
    ]).toString('hex');

    // Get design with file metadata
    const designWithFiles = await Design.findWithWatermark(design._id);

    // Read watermarked file (use watermarked path/params if available, else original)
    const useWatermarked = !!(designWithFiles.watermarkedFilePath && designWithFiles.watermarkedFileId);
    const filePath = useWatermarked ? designWithFiles.watermarkedFilePath : designWithFiles.storagePath;
    const fileId = useWatermarked ? designWithFiles.watermarkedFileId : designWithFiles.fileId;
    const salt = useWatermarked ? designWithFiles.watermarkedEncryptionSalt : designWithFiles.encryptionSalt;
    const iv = useWatermarked ? designWithFiles.watermarkedEncryptionIV : designWithFiles.encryptionIV;
    const authTag = useWatermarked ? designWithFiles.watermarkedEncryptionAuthTag : designWithFiles.encryptionAuthTag;

    const encryptedData = await storageService.readFromRelativePath(filePath);

    const decryptedData = encryptionService.decryptFile(
      encryptedData,
      fileId,
      getOwnerId(design.owner),
      salt,
      iv,
      authTag
    );

    // Extract and verify watermark
    const result = await watermarkService.verifyWatermark(decryptedData, watermarkKey);

    // Record verification
    watermark.recordVerification(
      userId,
      result.confidence,
      req.ip || req.connection.remoteAddress,
      req.headers['user-agent'],
      result.hasWatermark
    );
    await watermark.save();

    // Log action
    await AccessLog.logAccess({
      userId,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'WATERMARK_VERIFY',
      resourceType: 'design',
      resourceId: design._id,
      resourceName: design.title,
      endpoint: req.originalUrl,
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: result.hasWatermark,
      metadata: {
        verified: result.hasWatermark,
        confidence: result.confidence
      }
    });

    if (result.hasWatermark && result.payload) {
      res.status(200).json({
        success: true,
        data: {
          verified: true,
          watermark: {
            watermarkId: watermark.watermarkId,
            designerId: watermark.payload.designerId,
            timestamp: watermark.payload.timestamp,
            confidence: result.confidence,
            integrityCheck: 'passed'
          },
          verificationCount: watermark.verificationCount
        }
      });
    } else {
      res.status(200).json({
        success: true,
        data: {
          verified: false,
          message: 'Watermark could not be verified. The image may have been significantly modified.',
          confidence: result.confidence
        }
      });
    }

  } catch (error) {
    console.error('Verify watermark error:', error);

    await AccessLog.logAccess({
      userId: req.user.id,
      action: 'WATERMARK_VERIFY',
      resourceType: 'design',
      resourceId: req.params.id,
      success: false,
      errorMessage: error.message
    });

    res.status(500).json({
      success: false,
      message: 'Failed to verify watermark'
    });
  }
};

/**
 * @desc    Get watermark information
 * @route   GET /api/designs/:id/watermark
 * @access  Private (VERIFY_WATERMARK permission)
 */
exports.getWatermarkInfo = async (req, res) => {
  try {
    const design = req.design;

    if (!design.isWatermarked) {
      return res.status(404).json({
        success: false,
        message: 'Design is not watermarked'
      });
    }

    const watermark = await Watermark.findByDesign(design._id)
      .populate('appliedBy', 'firstName lastName')
      .populate('payload.designerId', 'firstName lastName');

    if (!watermark) {
      return res.status(404).json({
        success: false,
        message: 'Watermark record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        watermarkId: watermark.watermarkId,
        algorithm: watermark.algorithm,
        strength: watermark.strength,
        appliedAt: watermark.createdAt,
        appliedBy: watermark.appliedBy,
        designer: watermark.payload.designerId,
        verificationCount: watermark.verificationCount,
        lastVerifiedAt: watermark.lastVerifiedAt,
        isActive: watermark.isActive
      }
    });

  } catch (error) {
    console.error('Get watermark info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get watermark information'
    });
  }
};

/**
 * @desc    Remove watermark from design
 * @route   DELETE /api/designs/:id/watermark
 * @access  Private (owner or admin)
 */
exports.removeWatermark = async (req, res) => {
  try {
    const design = req.design;
    const userId = req.user.id;
    const { reason } = req.body;

    if (!design.isWatermarked) {
      return res.status(400).json({
        success: false,
        message: 'Design is not watermarked'
      });
    }

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a reason for removing the watermark (minimum 10 characters)'
      });
    }

    // Find and deactivate watermark
    const watermark = await Watermark.findByDesign(design._id);

    if (watermark) {
      watermark.remove(userId, reason.trim());
      await watermark.save();
    }

    // Delete watermarked file if it exists
    const designWithFiles = await Design.findWithWatermark(design._id);
    if (designWithFiles.watermarkedFileId) {
      await storageService.deleteFile(
        getOwnerId(design.owner),
        design._id.toString(),
        designWithFiles.watermarkedFileId
      );
    }

    // Update design
    design.removeWatermark();
    await design.save();

    // Log action
    await AccessLog.logAccess({
      userId,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'WATERMARK_REMOVE',
      resourceType: 'design',
      resourceId: design._id,
      resourceName: design.title,
      endpoint: req.originalUrl,
      method: 'DELETE',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: {
        reason: reason.trim(),
        watermarkId: watermark?.watermarkId
      }
    });

    res.status(200).json({
      success: true,
      message: 'Watermark removed successfully',
      data: {
        removedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Remove watermark error:', error);

    await AccessLog.logAccess({
      userId: req.user.id,
      action: 'WATERMARK_REMOVE',
      resourceType: 'design',
      resourceId: req.params.id,
      success: false,
      errorMessage: error.message
    });

    res.status(500).json({
      success: false,
      message: 'Failed to remove watermark'
    });
  }
};

/**
 * @desc    Verify watermark in an uploaded external image
 * @route   POST /api/watermarks/verify-image
 * @access  Private (VERIFY_WATERMARK permission)
 */
exports.verifyExternalImage = async (req, res) => {
  try {
    const file = req.file;
    const userId = req.user.id;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No image uploaded'
      });
    }

    // Check format
    if (!watermarkService.isSupportedFormat(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported image format. Please upload JPEG, PNG, WebP, or TIFF.'
      });
    }

    // Get all active watermarks to check against
    const watermarks = await Watermark.find({ isActive: true })
      .select('+encryptedKey +keySalt +keyIv +keyAuthTag')
      .populate('design', 'title owner')
      .populate('payload.designerId', 'firstName lastName email')
      .limit(1000); // Limit for performance

    const matches = [];

    for (const watermark of watermarks) {
      try {
        // Skip if design or owner reference is missing (deleted design)
        if (!watermark.design || !watermark.design.owner) continue;

        // Decrypt watermark key
        const keyDerivedKey = encryptionService.deriveFileKey(
          'watermark-key',
          getOwnerId(watermark.design.owner),
          watermark.keySalt
        );

        const keyDecipher = crypto.createDecipheriv('aes-256-gcm',
          keyDerivedKey, Buffer.from(watermark.keyIv, 'hex'));
        keyDecipher.setAuthTag(Buffer.from(watermark.keyAuthTag, 'hex'));

        const watermarkKey = Buffer.concat([
          keyDecipher.update(Buffer.from(watermark.encryptedKey, 'hex')),
          keyDecipher.final()
        ]).toString('hex');

        // Try to extract watermark
        const result = await watermarkService.verifyWatermark(file.buffer, watermarkKey);

        if (result.hasWatermark && result.confidence > 0.4) {
          // Safely resolve populated designer (may be null if user deleted)
          const designer = watermark.payload.designerId;
          const designerIdStr = (designer?._id || watermark.payload.designerId || '').toString();
          const designerName = designer?.firstName
            ? `${designer.firstName} ${designer.lastName}`
            : 'Unknown Designer';
          const designerEmail = designer?.email
            ? designer.email.replace(/(.{2}).*(@.*)/, '$1***$2')
            : 'unknown@***';

          matches.push({
            confidence: result.confidence,
            designId: watermark.design._id,
            designTitle: watermark.design.title,
            owner: {
              id: designerIdStr,
              name: designerName,
              email: designerEmail
            },
            originalTimestamp: watermark.payload.timestamp,
            watermarkedAt: watermark.createdAt,
            watermarkId: watermark.watermarkId,
            algorithm: watermark.algorithm
          });
        }
      } catch (err) {
        // Skip this watermark if decryption fails (wrong key = not a match)
        continue;
      }
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);

    // Log verification attempt
    await AccessLog.logAccess({
      userId,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'WATERMARK_VERIFY',
      resourceType: 'design',
      endpoint: req.originalUrl,
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: {
        externalImage: true,
        matchesFound: matches.length,
        fileSize: file.size,
        mimeType: file.mimetype
      }
    });

    res.status(200).json({
      success: true,
      data: {
        found: matches.length > 0,
        matches: matches.slice(0, 5), // Return top 5 matches
        analysisDetails: {
          imageSize: file.size,
          mimeType: file.mimetype,
          watermarksChecked: watermarks.length
        }
      }
    });

  } catch (error) {
    console.error('Verify external image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify image'
    });
  }
};

/**
 * @desc    Get user's watermarked designs
 * @route   GET /api/watermarks/my
 * @access  Private
 */
exports.getMyWatermarks = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const watermarks = await Watermark.findByDesigner(userId, { limit: parseInt(limit) })
      .skip((page - 1) * limit);

    const total = await Watermark.countDocuments({
      'payload.designerId': userId,
      isActive: true
    });

    const stats = await Watermark.getStats(userId);

    res.status(200).json({
      success: true,
      data: {
        watermarks,
        stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get my watermarks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve watermarks'
    });
  }
};
