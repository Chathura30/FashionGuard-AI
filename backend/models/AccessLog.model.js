const mongoose = require('mongoose');

const accessLogSchema = new mongoose.Schema({
  // User Information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null for failed/anonymous attempts
  },
  userEmail: {
    type: String,
    default: null
  },
  userRole: {
    type: String,
    default: null
  },

  // Action Details
  action: {
    type: String,
    required: true,
    enum: [
      // Auth actions
      'LOGIN_ATTEMPT',
      'LOGIN_SUCCESS',
      'LOGIN_FAILED',
      'LOGOUT',
      'REGISTER',
      'PASSWORD_RESET_REQUEST',
      'PASSWORD_RESET_SUCCESS',
      'PASSWORD_CHANGE',
      'MFA_ENABLED',
      'MFA_DISABLED',
      'MFA_VERIFIED',
      'MFA_FAILED',
      'EMAIL_VERIFIED',
      'TOKEN_REFRESH',

      // Design actions
      'DESIGN_CREATE',
      'DESIGN_VIEW',
      'DESIGN_UPDATE',
      'DESIGN_DELETE',
      'DESIGN_DOWNLOAD',
      'DESIGN_SHARE',

      // Watermark actions
      'WATERMARK_ADD',
      'WATERMARK_VERIFY',
      'WATERMARK_REMOVE',

      // Collaboration actions
      'COLLABORATOR_INVITE',
      'COLLABORATOR_REMOVE',
      'COLLABORATOR_JOIN',

      // Permission actions
      'PERMISSION_DENIED',
      'ROLE_CHANGE',

      // Security events
      'ACCOUNT_LOCKED',
      'ACCOUNT_UNLOCKED',
      'SUSPICIOUS_ACTIVITY',
      'BRUTE_FORCE_DETECTED',
      'SESSION_EXPIRED',
      'INVALID_TOKEN'
    ]
  },

  // Resource Information
  resourceType: {
    type: String,
    enum: ['user', 'design', 'collaboration', 'system', 'auth'],
    default: 'system'
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  resourceName: {
    type: String,
    default: null
  },

  // Request Details
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    default: 'GET'
  },
  endpoint: {
    type: String,
    required: true
  },
  statusCode: {
    type: Number,
    default: null
  },

  // Client Information
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    default: null
  },
  device: {
    type: String,
    default: null
  },
  browser: {
    type: String,
    default: null
  },
  os: {
    type: String,
    default: null
  },
  location: {
    country: String,
    city: String,
    region: String
  },

  // Result
  success: {
    type: Boolean,
    required: true
  },
  errorMessage: {
    type: String,
    default: null
  },
  errorCode: {
    type: String,
    default: null
  },

  // Additional Data
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Security Flags
  isSuspicious: {
    type: Boolean,
    default: false
  },
  threatLevel: {
    type: String,
    enum: ['none', 'low', 'medium', 'high', 'critical'],
    default: 'none'
  },
  reviewed: {
    type: Boolean,
    default: false
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: Date,
  reviewNotes: String

}, {
  timestamps: true
});

// Indexes for efficient querying
accessLogSchema.index({ userId: 1, createdAt: -1 });
accessLogSchema.index({ action: 1, createdAt: -1 });
accessLogSchema.index({ ipAddress: 1, createdAt: -1 });
accessLogSchema.index({ success: 1 });
accessLogSchema.index({ isSuspicious: 1 });
accessLogSchema.index({ threatLevel: 1 });
accessLogSchema.index({ createdAt: -1 });

// TTL index to auto-delete old logs (keep for 90 days)
accessLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Static method to log access
accessLogSchema.statics.logAccess = async function(data) {
  try {
    const log = new this(data);
    await log.save();
    return log;
  } catch (error) {
    console.error('Error logging access:', error);
    return null;
  }
};

// Static method to get recent failed logins for an IP
accessLogSchema.statics.getRecentFailedLogins = async function(ipAddress, minutes = 15) {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  return this.countDocuments({
    ipAddress,
    action: 'LOGIN_FAILED',
    createdAt: { $gte: since }
  });
};

// Static method to detect suspicious activity
accessLogSchema.statics.detectSuspiciousActivity = async function(userId, ipAddress) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Check for multiple IPs for same user
  const uniqueIPs = await this.distinct('ipAddress', {
    userId,
    createdAt: { $gte: oneHourAgo }
  });

  // Check for failed login attempts
  const failedLogins = await this.countDocuments({
    ipAddress,
    action: 'LOGIN_FAILED',
    createdAt: { $gte: oneHourAgo }
  });

  return {
    multipleIPs: uniqueIPs.length > 3,
    excessiveFailedLogins: failedLogins > 5,
    isSuspicious: uniqueIPs.length > 3 || failedLogins > 5
  };
};

// Static method to get user activity summary
accessLogSchema.statics.getUserActivitySummary = async function(userId, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const summary = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        lastOccurrence: { $max: '$createdAt' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  return summary;
};

const AccessLog = mongoose.model('AccessLog', accessLogSchema);

module.exports = AccessLog;
