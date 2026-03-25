const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect } = require('../middleware/auth.middleware');
const { requireRole, requirePermission, adminOnly, ROLES, PERMISSIONS } = require('../middleware/rbac.middleware');
const User = require('../models/User.model');
const AccessLog = require('../models/AccessLog.model');

/**
 * @route   GET /api/users
 * @desc    Get all users (Admin only)
 * @access  Private/Admin
 */
router.get('/',
  protect,
  adminOnly,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const filter = {};
      if (req.query.role) filter.role = req.query.role;
      if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
      if (req.query.search) {
        filter.$or = [
          { firstName: { $regex: req.query.search, $options: 'i' } },
          { lastName: { $regex: req.query.search, $options: 'i' } },
          { email: { $regex: req.query.search, $options: 'i' } }
        ];
      }

      const [users, total] = await Promise.all([
        User.find(filter)
          .select('-refreshTokens -mfaBackupCodes')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        User.countDocuments(filter)
      ]);

      res.status(200).json({
        success: true,
        data: {
          users,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  }
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get('/:id',
  protect,
  async (req, res) => {
    try {
      // Users can view their own profile, admins can view any
      if (req.params.id !== req.user.id.toString() && req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'You can only view your own profile'
        });
      }

      const user = await User.findById(req.params.id)
        .select('-refreshTokens -mfaBackupCodes -mfaSecret');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        data: { user }
      });

    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user'
      });
    }
  }
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user profile
 * @access  Private
 */
router.put('/:id',
  protect,
  [
    body('firstName').optional().trim().isLength({ min: 2, max: 50 }),
    body('lastName').optional().trim().isLength({ min: 2, max: 50 }),
    body('bio').optional().trim().isLength({ max: 500 }),
    body('company').optional().trim().isLength({ max: 100 })
  ],
  async (req, res) => {
    try {
      // Users can update their own profile, admins can update any
      if (req.params.id !== req.user.id.toString() && req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'You can only update your own profile'
        });
      }

      const allowedFields = ['firstName', 'lastName', 'bio', 'company', 'avatar'];
      const updates = {};

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });

      const user = await User.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true, runValidators: true }
      ).select('-refreshTokens -mfaBackupCodes -mfaSecret');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: { user }
      });

    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile'
      });
    }
  }
);

/**
 * @route   PUT /api/users/:id/role
 * @desc    Change user role (Admin only)
 * @access  Private/Admin
 */
router.put('/:id/role',
  protect,
  adminOnly,
  body('role').isIn(Object.values(ROLES)).withMessage('Invalid role'),
  async (req, res) => {
    try {
      const { role } = req.body;

      // Prevent admin from changing their own role
      if (req.params.id === req.user.id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'You cannot change your own role'
        });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role },
        { new: true }
      ).select('-refreshTokens -mfaBackupCodes -mfaSecret');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Log role change
      await AccessLog.logAccess({
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'ROLE_CHANGE',
        resourceType: 'user',
        resourceId: user._id,
        endpoint: req.originalUrl,
        method: req.method,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        success: true,
        metadata: {
          targetUserId: user._id,
          targetUserEmail: user.email,
          newRole: role
        }
      });

      res.status(200).json({
        success: true,
        message: `User role updated to ${role}`,
        data: { user }
      });

    } catch (error) {
      console.error('Update role error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user role'
      });
    }
  }
);

/**
 * @route   PUT /api/users/:id/status
 * @desc    Activate/Deactivate user (Admin only)
 * @access  Private/Admin
 */
router.put('/:id/status',
  protect,
  adminOnly,
  body('isActive').isBoolean().withMessage('isActive must be a boolean'),
  async (req, res) => {
    try {
      const { isActive } = req.body;

      // Prevent admin from deactivating themselves
      if (req.params.id === req.user.id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'You cannot deactivate your own account'
        });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { isActive },
        { new: true }
      ).select('-refreshTokens -mfaBackupCodes -mfaSecret');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: { user }
      });

    } catch (error) {
      console.error('Update status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user status'
      });
    }
  }
);

/**
 * @route   GET /api/users/:id/activity
 * @desc    Get user activity logs
 * @access  Private
 */
router.get('/:id/activity',
  protect,
  async (req, res) => {
    try {
      // Users can view their own activity, admins can view any
      if (req.params.id !== req.user.id.toString() && req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'You can only view your own activity'
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const [logs, total] = await Promise.all([
        AccessLog.find({ userId: req.params.id })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        AccessLog.countDocuments({ userId: req.params.id })
      ]);

      res.status(200).json({
        success: true,
        data: {
          logs,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get activity error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch activity logs'
      });
    }
  }
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user (Admin only)
 * @access  Private/Admin
 */
router.delete('/:id',
  protect,
  adminOnly,
  async (req, res) => {
    try {
      // Prevent admin from deleting themselves
      if (req.params.id === req.user.id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'You cannot delete your own account'
        });
      }

      const user = await User.findByIdAndDelete(req.params.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'User deleted successfully'
      });

    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete user'
      });
    }
  }
);

/**
 * @route   GET /api/users/permissions/me
 * @desc    Get current user's permissions
 * @access  Private
 */
router.get('/permissions/me',
  protect,
  async (req, res) => {
    try {
      const { getUserPermissions } = require('../middleware/rbac.middleware');
      const permissions = await getUserPermissions(req.user.id);

      res.status(200).json({
        success: true,
        data: {
          role: req.user.role,
          permissions
        }
      });

    } catch (error) {
      console.error('Get permissions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch permissions'
      });
    }
  }
);

module.exports = router;
