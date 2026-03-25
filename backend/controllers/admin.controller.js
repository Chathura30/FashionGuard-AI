const User = require('../models/User.model');
const Design = require('../models/Design.model');
const Watermark = require('../models/Watermark.model');
const AccessLog = require('../models/AccessLog.model');

/**
 * @desc    Get system monitoring overview
 * @route   GET /api/admin/monitoring
 * @access  Private/Admin
 */
exports.getMonitoringOverview = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      lockedUsers,
      totalDesigns,
      watermarkedDesigns,
      recentLogins,
      recentFailedLogins,
      suspiciousActivities,
      recentEvents,
      criticalEvents
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isLocked: true }),
      Design.countDocuments({ status: { $ne: 'archived' } }),
      Design.countDocuments({ isWatermarked: true }),
      AccessLog.countDocuments({ action: 'LOGIN_SUCCESS', createdAt: { $gte: last24h } }),
      AccessLog.countDocuments({ action: 'LOGIN_FAILED', createdAt: { $gte: last24h } }),
      AccessLog.countDocuments({ isSuspicious: true, createdAt: { $gte: last7d } }),
      AccessLog.find({ createdAt: { $gte: last24h } })
        .sort({ createdAt: -1 })
        .limit(50)
        .select('action userEmail ipAddress success isSuspicious threatLevel createdAt'),
      AccessLog.find({ threatLevel: { $in: ['high', 'critical'] }, createdAt: { $gte: last7d } })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('action userEmail ipAddress isSuspicious threatLevel errorMessage createdAt')
    ]);

    res.status(200).json({
      success: true,
      data: {
        systemHealth: {
          status: 'operational',
          timestamp: now
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          locked: lockedUsers,
          inactive: totalUsers - activeUsers
        },
        designs: {
          total: totalDesigns,
          watermarked: watermarkedDesigns,
          unprotected: totalDesigns - watermarkedDesigns
        },
        activity24h: {
          successfulLogins: recentLogins,
          failedLogins: recentFailedLogins,
          suspiciousActivities: suspiciousActivities
        },
        recentEvents,
        criticalEvents
      }
    });

  } catch (error) {
    console.error('Monitoring overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve monitoring data' });
  }
};

/**
 * @desc    Get security events with filtering
 * @route   GET /api/admin/security-events
 * @access  Private/Admin
 */
exports.getSecurityEvents = async (req, res) => {
  try {
    const { page = 1, limit = 20, threatLevel, isSuspicious, action, days = 7 } = req.query;
    const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const filter = { createdAt: { $gte: since } };
    if (threatLevel) filter.threatLevel = threatLevel;
    if (isSuspicious !== undefined) filter.isSuspicious = isSuspicious === 'true';
    if (action) filter.action = action;

    const [logs, total] = await Promise.all([
      AccessLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      AccessLog.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Security events error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve security events' });
  }
};

/**
 * @desc    Get activity summary grouped by action type
 * @route   GET /api/admin/activity-summary
 * @access  Private/Admin
 */
exports.getActivitySummary = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const summary = await AccessLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          successCount: { $sum: { $cond: ['$success', 1, 0] } },
          failCount: { $sum: { $cond: ['$success', 0, 1] } },
          suspiciousCount: { $sum: { $cond: ['$isSuspicious', 1, 0] } }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: { summary, period: `${days} days` }
    });

  } catch (error) {
    console.error('Activity summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve activity summary' });
  }
};

/**
 * @desc    Unlock a locked user account
 * @route   POST /api/admin/users/:id/unlock
 * @access  Private/Admin
 */
exports.unlockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isLocked: false, lockUntil: null, loginAttempts: 0 },
      { new: true }
    ).select('-refreshTokens -mfaBackupCodes -mfaSecret');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await AccessLog.logAccess({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'ACCOUNT_UNLOCKED',
      resourceType: 'user',
      resourceId: user._id,
      endpoint: req.originalUrl,
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: { unlockedUserId: user._id, unlockedUserEmail: user.email }
    });

    res.status(200).json({
      success: true,
      message: `Account for ${user.email} has been unlocked`,
      data: { user }
    });

  } catch (error) {
    console.error('Unlock user error:', error);
    res.status(500).json({ success: false, message: 'Failed to unlock user' });
  }
};
