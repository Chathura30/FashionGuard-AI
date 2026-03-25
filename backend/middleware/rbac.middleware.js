const { hasPermission, ROLES, PERMISSIONS, getRolePermissions } = require('../config/roles');
const AccessLog = require('../models/AccessLog.model');
const User = require('../models/User.model');

/**
 * Middleware to check if user has required role(s)
 * @param  {...string} roles - Allowed roles
 */
exports.requireRole = (...roles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (!roles.includes(req.user.role)) {
        // Log permission denied
        await AccessLog.logAccess({
          userId: req.user.id,
          userEmail: req.user.email,
          userRole: req.user.role,
          action: 'PERMISSION_DENIED',
          resourceType: 'system',
          endpoint: req.originalUrl,
          method: req.method,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          success: false,
          errorMessage: `Required roles: ${roles.join(', ')}. User role: ${req.user.role}`,
          isSuspicious: false,
          threatLevel: 'low'
        });

        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action',
          requiredRoles: roles,
          yourRole: req.user.role
        });
      }

      next();

    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission verification failed'
      });
    }
  };
};

/**
 * Middleware to check if user has required permission(s)
 * @param  {...string} permissions - Required permissions
 */
exports.requirePermission = (...permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Get user with custom permissions
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get role permissions
      const rolePermissions = getRolePermissions(user.role);

      // Add custom permissions
      const allPermissions = [
        ...rolePermissions,
        ...(user.customPermissions || [])
      ];

      // Remove restricted permissions
      const effectivePermissions = allPermissions.filter(
        p => !(user.restrictedPermissions || []).includes(p)
      );

      // Check if user has all required permissions
      const hasAllPermissions = permissions.every(p => effectivePermissions.includes(p));

      if (!hasAllPermissions) {
        const missingPermissions = permissions.filter(p => !effectivePermissions.includes(p));

        // Log permission denied
        await AccessLog.logAccess({
          userId: req.user.id,
          userEmail: req.user.email,
          userRole: req.user.role,
          action: 'PERMISSION_DENIED',
          resourceType: 'system',
          endpoint: req.originalUrl,
          method: req.method,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          success: false,
          errorMessage: `Missing permissions: ${missingPermissions.join(', ')}`,
          metadata: {
            requiredPermissions: permissions,
            missingPermissions,
            userRole: user.role
          },
          isSuspicious: false,
          threatLevel: 'low'
        });

        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action',
          missingPermissions
        });
      }

      // Add permissions to request for later use
      req.userPermissions = effectivePermissions;

      next();

    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission verification failed'
      });
    }
  };
};

/**
 * Middleware to check if user has ANY of the required permissions
 * @param  {...string} permissions - Required permissions (any one)
 */
exports.requireAnyPermission = (...permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const rolePermissions = getRolePermissions(user.role);
      const allPermissions = [
        ...rolePermissions,
        ...(user.customPermissions || [])
      ];
      const effectivePermissions = allPermissions.filter(
        p => !(user.restrictedPermissions || []).includes(p)
      );

      // Check if user has ANY of the required permissions
      const hasAnyPermission = permissions.some(p => effectivePermissions.includes(p));

      if (!hasAnyPermission) {
        await AccessLog.logAccess({
          userId: req.user.id,
          userEmail: req.user.email,
          userRole: req.user.role,
          action: 'PERMISSION_DENIED',
          resourceType: 'system',
          endpoint: req.originalUrl,
          method: req.method,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          success: false,
          errorMessage: `None of required permissions: ${permissions.join(', ')}`,
          isSuspicious: false,
          threatLevel: 'low'
        });

        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action',
          requiredPermissions: permissions
        });
      }

      req.userPermissions = effectivePermissions;
      next();

    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission verification failed'
      });
    }
  };
};

/**
 * Middleware to check resource ownership or admin access
 * Used for operations where users can only modify their own resources
 */
exports.requireOwnershipOrAdmin = (resourceUserIdField = 'userId') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Admins can access anything
      if (req.user.role === ROLES.ADMIN) {
        return next();
      }

      // Check if resource belongs to user
      const resourceUserId = req.params[resourceUserIdField] ||
                            req.body[resourceUserIdField] ||
                            req.resource?.userId;

      if (!resourceUserId) {
        return res.status(400).json({
          success: false,
          message: 'Resource ownership cannot be determined'
        });
      }

      if (resourceUserId.toString() !== req.user.id.toString()) {
        await AccessLog.logAccess({
          userId: req.user.id,
          userEmail: req.user.email,
          userRole: req.user.role,
          action: 'PERMISSION_DENIED',
          resourceType: 'system',
          endpoint: req.originalUrl,
          method: req.method,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          success: false,
          errorMessage: 'User does not own this resource',
          metadata: {
            resourceUserId,
            requestingUserId: req.user.id
          },
          isSuspicious: true,
          threatLevel: 'medium'
        });

        return res.status(403).json({
          success: false,
          message: 'You can only access your own resources'
        });
      }

      next();

    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        success: false,
        message: 'Ownership verification failed'
      });
    }
  };
};

/**
 * Middleware to restrict admin routes
 */
exports.adminOnly = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.role !== ROLES.ADMIN) {
      await AccessLog.logAccess({
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'PERMISSION_DENIED',
        resourceType: 'system',
        endpoint: req.originalUrl,
        method: req.method,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'Admin access required',
        isSuspicious: true,
        threatLevel: 'medium'
      });

      return res.status(403).json({
        success: false,
        message: 'Administrator access required'
      });
    }

    next();

  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({
      success: false,
      message: 'Permission verification failed'
    });
  }
};

/**
 * Get user's effective permissions (utility function)
 */
exports.getUserPermissions = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return [];

  const rolePermissions = getRolePermissions(user.role);
  const allPermissions = [
    ...rolePermissions,
    ...(user.customPermissions || [])
  ];

  return allPermissions.filter(
    p => !(user.restrictedPermissions || []).includes(p)
  );
};

// Export roles and permissions for use in routes
exports.ROLES = ROLES;
exports.PERMISSIONS = PERMISSIONS;
