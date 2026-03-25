const Design = require('../models/Design.model');
const User = require('../models/User.model');
const AccessLog = require('../models/AccessLog.model');
const { encryptionService } = require('../utils/encryption.util');
const { storageService } = require('../utils/storage.util');
const { sanitizeFilename } = require('../config/multer');
const { validationResult } = require('express-validator');

/**
 * @desc    Upload and encrypt a new design
 * @route   POST /api/designs
 * @access  Private (CREATE_DESIGN permission)
 */
exports.uploadDesign = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { title, description, tags, category } = req.body;
    const userId = req.user.id;

    // Generate unique file ID
    const fileId = storageService.generateFileId();

    // Create design document first to get designId
    const design = new Design({
      owner: userId,
      originalName: sanitizeFilename(file.originalname),
      mimeType: file.mimetype,
      fileSize: file.size,
      title: title || sanitizeFilename(file.originalname),
      description: description || '',
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [],
      category: category || 'other',
      fileId: fileId,
      // Placeholder values - will be updated after encryption
      encryptionSalt: 'pending',
      encryptionIV: 'pending',
      encryptionAuthTag: 'pending',
      fileHash: 'pending',
      storagePath: 'pending'
    });

    await design.save();

    try {
      // Encrypt the file
      const {
        encryptedData,
        salt,
        iv,
        authTag,
        fileHash
      } = encryptionService.encryptFile(file.buffer, fileId, userId);

      // Save encrypted file to disk
      const { relativePath } = await storageService.saveEncryptedFile(
        userId,
        design._id.toString(),
        fileId,
        encryptedData
      );

      // Update design with encryption metadata
      design.encryptionSalt = salt;
      design.encryptionIV = iv;
      design.encryptionAuthTag = authTag;
      design.fileHash = fileHash;
      design.storagePath = relativePath;
      await design.save();

      // Update user's storage usage and design count
      await User.findByIdAndUpdate(userId, {
        $inc: {
          storageUsed: file.size,
          designsCount: 1
        }
      });

      // Log successful upload
      await AccessLog.logAccess({
        userId,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'DESIGN_CREATE',
        resourceType: 'design',
        resourceId: design._id,
        resourceName: design.title,
        endpoint: '/api/designs',
        method: 'POST',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        success: true,
        metadata: {
          fileSize: file.size,
          mimeType: file.mimetype,
          encrypted: true
        }
      });

      res.status(201).json({
        success: true,
        message: 'Design uploaded and encrypted successfully',
        data: {
          design: {
            id: design._id,
            title: design.title,
            description: design.description,
            category: design.category,
            tags: design.tags,
            originalName: design.originalName,
            mimeType: design.mimeType,
            fileSize: design.fileSize,
            status: design.status,
            isWatermarked: design.isWatermarked,
            createdAt: design.createdAt
          }
        }
      });

    } catch (encryptionError) {
      // Clean up the design document if encryption fails
      await Design.findByIdAndDelete(design._id);
      throw encryptionError;
    }

  } catch (error) {
    console.error('Design upload error:', error);

    await AccessLog.logAccess({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'DESIGN_CREATE',
      resourceType: 'design',
      endpoint: '/api/designs',
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: false,
      errorMessage: error.message
    });

    res.status(500).json({
      success: false,
      message: 'Failed to upload design. Please try again.'
    });
  }
};

/**
 * @desc    Download and decrypt a design
 * @route   GET /api/designs/:id/download
 * @access  Private (requires download permission)
 */
exports.downloadDesign = async (req, res) => {
  try {
    const design = req.design; // Set by verifyDownloadAccess middleware
    const userId = req.user.id;

    // Use watermarked file if available (so downloaded file contains the watermark for verification)
    const useWatermarked = design.isWatermarked && design.watermarkedFilePath && design.watermarkedFileId;
    const filePath = useWatermarked ? design.watermarkedFilePath : design.storagePath;
    const fileId = useWatermarked ? design.watermarkedFileId : design.fileId;
    const encSalt = useWatermarked ? design.watermarkedEncryptionSalt : design.encryptionSalt;
    const encIV = useWatermarked ? design.watermarkedEncryptionIV : design.encryptionIV;
    const encAuthTag = useWatermarked ? design.watermarkedEncryptionAuthTag : design.encryptionAuthTag;

    // Read encrypted file from storage
    const encryptedData = await storageService.readFromRelativePath(filePath);

    // Decrypt the file
    const decryptedData = encryptionService.decryptFile(
      encryptedData,
      fileId,
      design.owner.toString(),
      encSalt,
      encIV,
      encAuthTag
    );

    // Verify file integrity (only for original file — watermarked file has its own AES-GCM auth)
    if (!useWatermarked && !encryptionService.verifyIntegrity(decryptedData, design.fileHash)) {
      console.error('File integrity verification failed for design:', design._id);

      await AccessLog.logAccess({
        userId,
        userEmail: req.user.email,
        action: 'DESIGN_DOWNLOAD',
        resourceType: 'design',
        resourceId: design._id,
        endpoint: req.originalUrl,
        method: 'GET',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'File integrity check failed',
        isSuspicious: true,
        threatLevel: 'high'
      });

      return res.status(500).json({
        success: false,
        message: 'File integrity verification failed. The file may be corrupted.'
      });
    }

    // Record download
    design.recordDownload();
    await design.save();

    // Log successful download
    await AccessLog.logAccess({
      userId,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'DESIGN_DOWNLOAD',
      resourceType: 'design',
      resourceId: design._id,
      resourceName: design.title,
      endpoint: req.originalUrl,
      method: 'GET',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: {
        fileSize: design.fileSize,
        isOwner: req.isDesignOwner
      }
    });

    // Set response headers
    res.set({
      'Content-Type': design.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(design.originalName)}"`,
      'Content-Length': decryptedData.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    });

    // Send decrypted file
    res.send(decryptedData);

  } catch (error) {
    console.error('Design download error:', error);

    // Check if it's a decryption error (tampering detected)
    if (error.message.includes('Unsupported state') || error.message.includes('authentication')) {
      await AccessLog.logAccess({
        userId: req.user.id,
        action: 'DESIGN_DOWNLOAD',
        resourceType: 'design',
        resourceId: req.params.id,
        success: false,
        errorMessage: 'Decryption failed - possible tampering',
        isSuspicious: true,
        threatLevel: 'critical'
      });

      return res.status(500).json({
        success: false,
        message: 'File decryption failed. The file may have been tampered with.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to download design'
    });
  }
};

/**
 * @desc    Get user's own designs
 * @route   GET /api/designs/my
 * @access  Private
 */
exports.getMyDesigns = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search, sort = '-createdAt' } = req.query;

    const query = {
      owner: req.user.id,
      status: { $ne: 'archived' }
    };

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$text = { $search: search };
    }

    const designs = await Design.find(query)
      .select('-encryptionSalt -encryptionIV -encryptionAuthTag -fileHash -storagePath -fileId')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Design.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        designs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get my designs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve designs'
    });
  }
};

/**
 * @desc    Get designs shared with user
 * @route   GET /api/designs/shared
 * @access  Private
 */
exports.getSharedDesigns = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const designs = await Design.findSharedWith(req.user.id)
      .select('-encryptionSalt -encryptionIV -encryptionAuthTag -fileHash -storagePath -fileId')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Design.countDocuments({
      'collaborators.user': req.user.id,
      status: { $ne: 'archived' }
    });

    res.status(200).json({
      success: true,
      data: {
        designs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get shared designs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve shared designs'
    });
  }
};

/**
 * @desc    Get single design details
 * @route   GET /api/designs/:id
 * @access  Private (requires access)
 */
exports.getDesign = async (req, res) => {
  try {
    const design = req.design; // Set by verifyDesignAccess middleware

    // Record access
    design.recordAccess();
    await design.save();

    res.status(200).json({
      success: true,
      data: {
        design: {
          id: design._id,
          title: design.title,
          description: design.description,
          category: design.category,
          tags: design.tags,
          originalName: design.originalName,
          mimeType: design.mimeType,
          fileSize: design.fileSize,
          status: design.status,
          isWatermarked: design.isWatermarked,
          version: design.version,
          owner: design.owner,
          collaborators: design.collaborators,
          accessCount: design.accessCount,
          downloadCount: design.downloadCount,
          createdAt: design.createdAt,
          updatedAt: design.updatedAt
        },
        access: req.designAccess
      }
    });

  } catch (error) {
    console.error('Get design error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve design'
    });
  }
};

/**
 * @desc    Update design metadata
 * @route   PUT /api/designs/:id
 * @access  Private (requires edit permission)
 */
exports.updateDesign = async (req, res) => {
  try {
    const design = req.design;
    const { title, description, tags, category, status } = req.body;

    // Update allowed fields
    if (title) design.title = title;
    if (description !== undefined) design.description = description;
    if (tags) design.tags = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim());
    if (category) design.category = category;
    if (status && ['draft', 'active', 'archived'].includes(status)) {
      design.status = status;
    }

    await design.save();

    await AccessLog.logAccess({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'DESIGN_UPDATE',
      resourceType: 'design',
      resourceId: design._id,
      resourceName: design.title,
      endpoint: req.originalUrl,
      method: 'PUT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.status(200).json({
      success: true,
      message: 'Design updated successfully',
      data: {
        design: {
          id: design._id,
          title: design.title,
          description: design.description,
          category: design.category,
          tags: design.tags,
          status: design.status,
          updatedAt: design.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Update design error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update design'
    });
  }
};

/**
 * @desc    Delete a design
 * @route   DELETE /api/designs/:id
 * @access  Private (owner only)
 */
exports.deleteDesign = async (req, res) => {
  try {
    const design = req.design;
    const userId = req.user.id;

    // Delete encrypted files from storage
    await storageService.deleteDesignFiles(
      design.owner.toString(),
      design._id.toString()
    );

    // Update user's storage usage and design count
    await User.findByIdAndUpdate(design.owner, {
      $inc: {
        storageUsed: -design.fileSize,
        designsCount: -1
      }
    });

    // Delete design document
    await Design.findByIdAndDelete(design._id);

    await AccessLog.logAccess({
      userId,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'DESIGN_DELETE',
      resourceType: 'design',
      resourceId: design._id,
      resourceName: design.title,
      endpoint: req.originalUrl,
      method: 'DELETE',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: { fileSize: design.fileSize }
    });

    res.status(200).json({
      success: true,
      message: 'Design deleted successfully'
    });

  } catch (error) {
    console.error('Delete design error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete design'
    });
  }
};

/**
 * @desc    Share design with a user
 * @route   POST /api/designs/:id/share
 * @access  Private (owner only)
 */
exports.shareDesign = async (req, res) => {
  try {
    const design = req.design;
    const { email, permission = 'view' } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (!['view', 'edit', 'download'].includes(permission)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid permission. Must be view, edit, or download.'
      });
    }

    // Find user to share with
    const userToShare = await User.findOne({ email: email.toLowerCase() });

    if (!userToShare) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Can't share with yourself
    if (userToShare._id.toString() === design.owner.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot share design with yourself'
      });
    }

    // Add collaborator
    design.addCollaborator(userToShare._id, permission, req.user.id);
    await design.save();

    // Update collaborator's count
    await User.findByIdAndUpdate(userToShare._id, {
      $inc: { collaborationsCount: 1 }
    });

    await AccessLog.logAccess({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'DESIGN_SHARE',
      resourceType: 'design',
      resourceId: design._id,
      resourceName: design.title,
      endpoint: req.originalUrl,
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: {
        sharedWith: userToShare.email,
        permission
      }
    });

    res.status(200).json({
      success: true,
      message: `Design shared with ${userToShare.email}`,
      data: {
        collaborator: {
          user: userToShare._id,
          email: userToShare.email,
          firstName: userToShare.firstName,
          lastName: userToShare.lastName,
          permission
        }
      }
    });

  } catch (error) {
    console.error('Share design error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to share design'
    });
  }
};

/**
 * @desc    Remove collaborator from design
 * @route   DELETE /api/designs/:id/collaborators/:userId
 * @access  Private (owner only)
 */
exports.removeCollaborator = async (req, res) => {
  try {
    const design = req.design;
    const { userId } = req.params;

    const removed = design.removeCollaborator(userId);

    if (!removed) {
      return res.status(404).json({
        success: false,
        message: 'Collaborator not found'
      });
    }

    await design.save();

    // Update former collaborator's count
    await User.findByIdAndUpdate(userId, {
      $inc: { collaborationsCount: -1 }
    });

    await AccessLog.logAccess({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'COLLABORATOR_REMOVE',
      resourceType: 'design',
      resourceId: design._id,
      endpoint: req.originalUrl,
      method: 'DELETE',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: { removedUserId: userId }
    });

    res.status(200).json({
      success: true,
      message: 'Collaborator removed successfully'
    });

  } catch (error) {
    console.error('Remove collaborator error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove collaborator'
    });
  }
};
