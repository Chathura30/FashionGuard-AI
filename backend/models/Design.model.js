const mongoose = require('mongoose');

const collaboratorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  permission: {
    type: String,
    enum: ['view', 'edit', 'download'],
    default: 'view'
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { _id: false });

const designSchema = new mongoose.Schema({
  // Ownership
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Design must have an owner'],
    index: true
  },

  // Collaborators with granular permissions
  collaborators: [collaboratorSchema],

  // Original file information
  originalName: {
    type: String,
    required: [true, 'Original filename is required'],
    maxlength: [255, 'Filename cannot exceed 255 characters']
  },
  mimeType: {
    type: String,
    required: [true, 'MIME type is required']
  },
  fileSize: {
    type: Number,
    required: [true, 'File size is required'],
    min: [1, 'File size must be positive']
  },

  // Encryption metadata (critical for decryption)
  encryptionSalt: {
    type: String,
    required: [true, 'Encryption salt is required'],
    select: false // Don't include in normal queries for security
  },
  encryptionIV: {
    type: String,
    required: [true, 'Encryption IV is required'],
    select: false
  },
  encryptionAuthTag: {
    type: String,
    required: [true, 'Encryption auth tag is required'],
    select: false
  },

  // File integrity
  fileHash: {
    type: String,
    required: [true, 'File hash is required for integrity verification'],
    select: false
  },

  // Storage location
  storagePath: {
    type: String,
    required: [true, 'Storage path is required'],
    select: false
  },
  fileId: {
    type: String,
    required: [true, 'File ID is required'],
    select: false
  },

  // Design metadata
  title: {
    type: String,
    required: [true, 'Design title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  category: {
    type: String,
    enum: ['sketch', 'pattern', 'technical', 'rendering', 'other'],
    default: 'other'
  },

  // Watermark information
  isWatermarked: {
    type: Boolean,
    default: false,
    index: true
  },
  watermarkId: {
    type: String,
    index: true
  },
  watermarkedAt: {
    type: Date
  },
  watermarkedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  watermarkVersion: {
    type: String,
    enum: ['none', 'dct-v1', 'dct-v2', 'dct-lsb-hybrid-v2'],
    default: 'none'
  },
  // Watermarked file storage (separate from original)
  watermarkedFilePath: {
    type: String,
    select: false
  },
  watermarkedFileId: {
    type: String,
    select: false
  },
  // Encryption metadata for the watermarked file (different from original)
  watermarkedEncryptionSalt: {
    type: String,
    select: false
  },
  watermarkedEncryptionIV: {
    type: String,
    select: false
  },
  watermarkedEncryptionAuthTag: {
    type: String,
    select: false
  },

  // Status and versioning
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'active',
    index: true
  },
  version: {
    type: Number,
    default: 1
  },
  previousVersions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Design'
  }],

  // Audit fields
  lastAccessedAt: {
    type: Date
  },
  accessCount: {
    type: Number,
    default: 0
  },
  downloadCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
designSchema.index({ owner: 1, status: 1 });
designSchema.index({ owner: 1, createdAt: -1 });
designSchema.index({ 'collaborators.user': 1 });
designSchema.index({ tags: 1 });
designSchema.index({ category: 1 });
designSchema.index({ title: 'text', description: 'text' });

/**
 * Check if a user has access to this design
 * @param {ObjectId} userId - User ID to check
 * @returns {Object|null} Access info or null if no access
 */
designSchema.methods.getUserAccess = function(userId) {
  const userIdStr = userId.toString();

  // Handle both populated (User doc) and unpopulated (ObjectId) owner
  const ownerId = this.owner?._id ? this.owner._id.toString() : this.owner.toString();

  // Owner has full access
  if (ownerId === userIdStr) {
    return { isOwner: true, permission: 'owner' };
  }

  // Check collaborators
  const collaborator = this.collaborators.find(
    c => c.user.toString() === userIdStr
  );

  if (collaborator) {
    return { isOwner: false, permission: collaborator.permission };
  }

  return null;
};

/**
 * Check if user can download this design
 * @param {ObjectId} userId - User ID to check
 * @returns {boolean}
 */
designSchema.methods.canDownload = function(userId) {
  const access = this.getUserAccess(userId);
  if (!access) return false;

  return access.isOwner || access.permission === 'download' || access.permission === 'edit';
};

/**
 * Check if user can edit this design
 * @param {ObjectId} userId - User ID to check
 * @returns {boolean}
 */
designSchema.methods.canEdit = function(userId) {
  const access = this.getUserAccess(userId);
  if (!access) return false;

  return access.isOwner || access.permission === 'edit';
};

/**
 * Add a collaborator to the design
 * @param {ObjectId} userId - User to add
 * @param {string} permission - Permission level
 * @param {ObjectId} addedBy - User adding the collaborator
 */
designSchema.methods.addCollaborator = function(userId, permission, addedBy) {
  const userIdStr = userId.toString();

  // Check if already a collaborator
  const existingIndex = this.collaborators.findIndex(
    c => c.user.toString() === userIdStr
  );

  if (existingIndex >= 0) {
    // Update existing permission
    this.collaborators[existingIndex].permission = permission;
  } else {
    // Add new collaborator
    this.collaborators.push({
      user: userId,
      permission,
      addedAt: new Date(),
      addedBy
    });
  }
};

/**
 * Remove a collaborator from the design
 * @param {ObjectId} userId - User to remove
 * @returns {boolean} Whether user was removed
 */
designSchema.methods.removeCollaborator = function(userId) {
  const userIdStr = userId.toString();
  const initialLength = this.collaborators.length;

  this.collaborators = this.collaborators.filter(
    c => c.user.toString() !== userIdStr
  );

  return this.collaborators.length < initialLength;
};

/**
 * Record an access event
 */
designSchema.methods.recordAccess = function() {
  this.lastAccessedAt = new Date();
  this.accessCount += 1;
};

/**
 * Record a download event
 */
designSchema.methods.recordDownload = function() {
  this.lastAccessedAt = new Date();
  this.downloadCount += 1;
};

/**
 * Get designs owned by a user
 */
designSchema.statics.findByOwner = function(userId, options = {}) {
  const query = this.find({
    owner: userId,
    status: { $ne: 'archived' }
  });

  if (options.category) {
    query.where('category', options.category);
  }

  if (options.search) {
    query.where({ $text: { $search: options.search } });
  }

  return query.sort(options.sort || { createdAt: -1 });
};

/**
 * Get designs shared with a user
 */
designSchema.statics.findSharedWith = function(userId, options = {}) {
  const query = this.find({
    'collaborators.user': userId,
    status: { $ne: 'archived' }
  });

  return query
    .populate('owner', 'firstName lastName email avatar')
    .sort(options.sort || { createdAt: -1 });
};

/**
 * Get design with encryption metadata (for decryption)
 */
designSchema.statics.findWithEncryption = function(designId) {
  return this.findById(designId).select(
    '+encryptionSalt +encryptionIV +encryptionAuthTag +fileHash +storagePath +fileId'
  );
};

/**
 * Get design with watermark file metadata
 */
designSchema.statics.findWithWatermark = function(designId) {
  return this.findById(designId).select(
    '+encryptionSalt +encryptionIV +encryptionAuthTag +fileHash +storagePath +fileId +watermarkedFilePath +watermarkedFileId +watermarkedEncryptionSalt +watermarkedEncryptionIV +watermarkedEncryptionAuthTag'
  );
};

/**
 * Mark design as watermarked
 */
designSchema.methods.setWatermarked = function(watermarkId, userId, version = 'dct-v1') {
  this.isWatermarked = true;
  this.watermarkId = watermarkId;
  this.watermarkedAt = new Date();
  this.watermarkedBy = userId;
  this.watermarkVersion = version;
};

/**
 * Remove watermark status
 */
designSchema.methods.removeWatermark = function() {
  this.isWatermarked = false;
  this.watermarkId = undefined;
  this.watermarkedAt = undefined;
  this.watermarkedBy = undefined;
  this.watermarkVersion = 'none';
  this.watermarkedFilePath = undefined;
  this.watermarkedFileId = undefined;
  this.watermarkedEncryptionSalt = undefined;
  this.watermarkedEncryptionIV = undefined;
  this.watermarkedEncryptionAuthTag = undefined;
};

const Design = mongoose.model('Design', designSchema);

module.exports = Design;
