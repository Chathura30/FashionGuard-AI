const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const AccessLog = require('../models/AccessLog.model');

/**
 * Middleware to protect routes - verifies JWT token
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      const user = await User.findById(decoded.id);

      if (!user) {
        await AccessLog.logAccess({
          action: 'INVALID_TOKEN',
          resourceType: 'auth',
          endpoint: req.originalUrl,
          method: req.method,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          success: false,
          errorMessage: 'User not found for token'
        });

        return res.status(401).json({
          success: false,
          message: 'User no longer exists'
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account has been deactivated'
        });
      }

      // Check if password was changed after token was issued
      if (user.changedPasswordAfter(decoded.iat)) {
        await AccessLog.logAccess({
          userId: user._id,
          userEmail: user.email,
          action: 'INVALID_TOKEN',
          resourceType: 'auth',
          endpoint: req.originalUrl,
          method: req.method,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          success: false,
          errorMessage: 'Password changed after token issued'
        });

        return res.status(401).json({
          success: false,
          message: 'Password recently changed. Please login again.'
        });
      }

      // Add user to request
      req.user = {
        id: user._id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      };

      // Update last activity (fire-and-forget, no pre-save hooks, non-blocking)
      User.updateOne({ _id: user._id }, { $set: { lastActivity: new Date() } })
        .exec()
        .catch(err => console.error('Failed to update lastActivity:', err));

      next();

    } catch (err) {
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }
      if (err.name === 'TokenExpiredError') {
        await AccessLog.logAccess({
          action: 'SESSION_EXPIRED',
          resourceType: 'auth',
          endpoint: req.originalUrl,
          method: req.method,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          success: false,
          errorMessage: 'Token expired'
        });

        return res.status(401).json({
          success: false,
          message: 'Token expired. Please login again.'
        });
      }
      throw err;
    }

  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (user && user.isActive) {
          req.user = {
            id: user._id,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName
          };
        }
      } catch (err) {
        // Token invalid, but we continue without user
        req.user = null;
      }
    }

    next();

  } catch (error) {
    next();
  }
};

/**
 * Middleware to check if email is verified
 */
exports.requireEmailVerification = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address to access this feature',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    next();

  } catch (error) {
    console.error('Email verification check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify email status'
    });
  }
};

/**
 * Middleware to check if MFA is enabled (for sensitive operations)
 */
exports.requireMFA = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user.mfaEnabled) {
      return res.status(403).json({
        success: false,
        message: 'MFA must be enabled to perform this action',
        code: 'MFA_REQUIRED'
      });
    }

    next();

  } catch (error) {
    console.error('MFA check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify MFA status'
    });
  }
};
