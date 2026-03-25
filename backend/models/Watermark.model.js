const mongoose = require('mongoose');

const verificationHistorySchema = new mongoose.Schema({
  verifiedAt: {
    type: Date,
    default: Date.now
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1
  },
  ipAddress: String,
  userAgent: String,
  success: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const watermarkSchema = new mongoose.Schema({
  // Reference to design
  design: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Design',
    required: [true, 'Watermark must be associated with a design'],
    unique: true,
    index: true
  },

  // Unique watermark identifier
  watermarkId: {
    type: String,
    required: [true, 'Watermark ID is required'],
    unique: true,
    index: true
  },

  // Encrypted key for this watermark (encrypted with master key)
  encryptedKey: {
    type: String,
    required: [true, 'Encrypted key is required'],
    select: false
  },
  keySalt: {
    type: String,
    required: true,
    select: false
  },
  keyIv: {
    type: String,
    required: true,
    select: false
  },
  keyAuthTag: {
    type: String,
    required: true,
    select: false
  },

  // Algorithm settings
  algorithm: {
    type: String,
    enum: ['dct-v1', 'dct-v2', 'dct-lsb-hybrid-v2'],
    default: 'dct-v1'
  },
  strength: {
    type: Number,
    min: 10,
    max: 50,
    default: 25
  },
  redundancy: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },

  // Embedded payload information (for verification reference)
  payload: {
    designerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    designId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Design',
      required: true
    },
    timestamp: {
      type: Date,
      required: true
    },
    fileHashPrefix: {
      type: String,
      required: true,
      maxlength: 16
    }
  },

  // Applied by
  appliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Verification tracking
  verificationCount: {
    type: Number,
    default: 0
  },
  lastVerifiedAt: Date,
  lastVerifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verificationHistory: [verificationHistorySchema],

  // Status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  removedAt: Date,
  removedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  removalReason: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Indexes
watermarkSchema.index({ 'payload.designerId': 1 });
watermarkSchema.index({ isActive: 1, createdAt: -1 });
watermarkSchema.index({ appliedBy: 1 });

/**
 * Record a verification attempt
 */
watermarkSchema.methods.recordVerification = function(userId, confidence, ipAddress, userAgent, success = true) {
  this.verificationCount += 1;
  this.lastVerifiedAt = new Date();
  this.lastVerifiedBy = userId;

  // Keep last 100 verification records
  if (this.verificationHistory.length >= 100) {
    this.verificationHistory.shift();
  }

  this.verificationHistory.push({
    verifiedAt: new Date(),
    verifiedBy: userId,
    confidence,
    ipAddress,
    userAgent,
    success
  });
};

/**
 * Mark watermark as removed
 */
watermarkSchema.methods.remove = function(userId, reason) {
  this.isActive = false;
  this.removedAt = new Date();
  this.removedBy = userId;
  this.removalReason = reason;
};

/**
 * Find watermark by design ID
 */
watermarkSchema.statics.findByDesign = function(designId) {
  return this.findOne({ design: designId, isActive: true });
};

/**
 * Find watermark by watermark ID
 */
watermarkSchema.statics.findByWatermarkId = function(watermarkId) {
  return this.findOne({ watermarkId, isActive: true });
};

/**
 * Find watermark with encryption keys (for decryption)
 */
watermarkSchema.statics.findWithKeys = function(designId) {
  return this.findOne({ design: designId, isActive: true })
    .select('+encryptedKey +keySalt +keyIv +keyAuthTag');
};

/**
 * Get watermarks by designer
 */
watermarkSchema.statics.findByDesigner = function(designerId, options = {}) {
  const query = this.find({
    'payload.designerId': designerId,
    isActive: true
  });

  return query
    .populate('design', 'title originalName mimeType')
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 50);
};

/**
 * Get verification statistics
 */
watermarkSchema.statics.getStats = async function(designerId) {
  const result = await this.aggregate([
    { $match: { 'payload.designerId': new mongoose.Types.ObjectId(designerId), isActive: true } },
    {
      $group: {
        _id: null,
        totalWatermarks: { $sum: 1 },
        totalVerifications: { $sum: '$verificationCount' },
        avgConfidence: { $avg: { $avg: '$verificationHistory.confidence' } }
      }
    }
  ]);

  return result[0] || { totalWatermarks: 0, totalVerifications: 0, avgConfidence: 0 };
};

const Watermark = mongoose.model('Watermark', watermarkSchema);

module.exports = Watermark;
