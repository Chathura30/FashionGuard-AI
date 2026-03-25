const User = require('../models/User.model');
const AccessLog = require('../models/AccessLog.model');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { sendEmail } = require('../utils/email.util');

/**
 * @desc    Register new user
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, password, role } = req.body;

    // Check if user exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      await AccessLog.logAccess({
        action: 'REGISTER',
        resourceType: 'auth',
        endpoint: '/api/auth/register',
        method: 'POST',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'Email already registered',
        metadata: { email }
      });

      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    // Create user (default role is 'designer' unless admin creates)
    const user = new User({
      firstName,
      lastName,
      email,
      password,
      role: role || 'designer'
    });

    // Generate email verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    // Log successful registration
    await AccessLog.logAccess({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'REGISTER',
      resourceType: 'auth',
      endpoint: '/api/auth/register',
      method: 'POST',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: { userId: user._id }
    });

    // Send verification email (optional - don't fail if email fails)
    try {
      const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
      await sendEmail({
        to: user.email,
        subject: 'Welcome to FashionGuard - Verify Your Email',
        template: 'verification',
        data: {
          name: user.firstName,
          verificationUrl
        }
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }

    // Generate tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Save refresh token
    user.refreshTokens.push({
      token: refreshToken,
      device: req.headers['user-agent'],
      ip: req.ip,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          mfaEnabled: user.mfaEnabled
        },
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Check for brute force
    const recentFailedAttempts = await AccessLog.getRecentFailedLogins(ipAddress);
    if (recentFailedAttempts >= 5) {
      await AccessLog.logAccess({
        action: 'BRUTE_FORCE_DETECTED',
        resourceType: 'auth',
        endpoint: '/api/auth/login',
        method: 'POST',
        ipAddress,
        userAgent: req.headers['user-agent'],
        success: false,
        isSuspicious: true,
        threatLevel: 'high',
        metadata: { email, attemptCount: recentFailedAttempts }
      });

      return res.status(429).json({
        success: false,
        message: 'Too many failed login attempts. Please try again later.'
      });
    }

    // Find user with password
    const user = await User.findByEmail(email).select('+password');
    if (!user) {
      await AccessLog.logAccess({
        action: 'LOGIN_FAILED',
        resourceType: 'auth',
        endpoint: '/api/auth/login',
        method: 'POST',
        ipAddress,
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'Invalid credentials',
        metadata: { email }
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is locked
    if (user.isAccountLocked()) {
      await AccessLog.logAccess({
        userId: user._id,
        userEmail: user.email,
        action: 'LOGIN_FAILED',
        resourceType: 'auth',
        endpoint: '/api/auth/login',
        method: 'POST',
        ipAddress,
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'Account locked',
        metadata: { lockUntil: user.lockUntil }
      });

      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked. Please try again later.'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.handleFailedLogin();

      await AccessLog.logAccess({
        userId: user._id,
        userEmail: user.email,
        action: 'LOGIN_FAILED',
        resourceType: 'auth',
        endpoint: '/api/auth/login',
        method: 'POST',
        ipAddress,
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'Invalid password',
        metadata: { attemptNumber: user.loginAttempts }
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      // Generate temporary token for MFA verification
      const mfaToken = crypto.randomBytes(32).toString('hex');

      // Store temporarily (you might want to use Redis in production)
      user.mfaPendingToken = mfaToken;
      user.mfaPendingExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
      await user.save();

      await AccessLog.logAccess({
        userId: user._id,
        userEmail: user.email,
        userRole: user.role,
        action: 'LOGIN_ATTEMPT',
        resourceType: 'auth',
        endpoint: '/api/auth/login',
        method: 'POST',
        ipAddress,
        userAgent: req.headers['user-agent'],
        success: true,
        metadata: { mfaRequired: true }
      });

      return res.status(200).json({
        success: true,
        message: 'MFA verification required',
        data: {
          mfaRequired: true,
          mfaToken,
          userId: user._id
        }
      });
    }

    // Generate tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Update user login info
    await user.handleSuccessfulLogin(ipAddress, req.headers['user-agent']);

    // Save refresh token
    user.refreshTokens.push({
      token: refreshToken,
      device: req.headers['user-agent'],
      ip: ipAddress,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    await user.save();

    // Log successful login
    await AccessLog.logAccess({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'LOGIN_SUCCESS',
      resourceType: 'auth',
      endpoint: '/api/auth/login',
      method: 'POST',
      ipAddress,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          mfaEnabled: user.mfaEnabled,
          lastLogin: user.lastLogin
        },
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
};

/**
 * @desc    Verify MFA token
 * @route   POST /api/auth/verify-mfa
 * @access  Public (with mfaToken)
 */
exports.verifyMFA = async (req, res) => {
  try {
    const { userId, mfaToken, code } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const user = await User.findById(userId).select('+mfaSecret');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify the MFA code
    const isValidCode = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 2 // Allow 2 time steps tolerance
    });

    // Check backup codes if TOTP fails
    let usedBackupCode = false;
    if (!isValidCode) {
      const backupCode = user.mfaBackupCodes.find(
        bc => bc.code === code.toUpperCase() && !bc.used
      );
      if (backupCode) {
        backupCode.used = true;
        usedBackupCode = true;
        await user.save();
      }
    }

    if (!isValidCode && !usedBackupCode) {
      await AccessLog.logAccess({
        userId: user._id,
        userEmail: user.email,
        action: 'MFA_FAILED',
        resourceType: 'auth',
        endpoint: '/api/auth/verify-mfa',
        method: 'POST',
        ipAddress,
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'Invalid MFA code'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    // Generate tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Update user login info
    await user.handleSuccessfulLogin(ipAddress, req.headers['user-agent']);

    // Save refresh token
    user.refreshTokens.push({
      token: refreshToken,
      device: req.headers['user-agent'],
      ip: ipAddress,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    await user.save();

    // Log successful MFA verification
    await AccessLog.logAccess({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'MFA_VERIFIED',
      resourceType: 'auth',
      endpoint: '/api/auth/verify-mfa',
      method: 'POST',
      ipAddress,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: { usedBackupCode }
    });

    res.status(200).json({
      success: true,
      message: usedBackupCode
        ? 'Login successful (backup code used)'
        : 'Login successful',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          mfaEnabled: user.mfaEnabled
        },
        accessToken,
        refreshToken,
        backupCodeUsed: usedBackupCode
      }
    });

  } catch (error) {
    console.error('MFA verification error:', error);
    res.status(500).json({
      success: false,
      message: 'MFA verification failed'
    });
  }
};

/**
 * @desc    Setup MFA
 * @route   POST /api/auth/setup-mfa
 * @access  Private
 */
exports.setupMFA = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+mfaSecret');

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${process.env.MFA_APP_NAME || 'FashionGuard'} (${user.email})`,
      issuer: process.env.MFA_ISSUER || 'FashionGuard Security'
    });

    // Save secret temporarily (not enabled until verified)
    user.mfaSecret = secret.base32;
    await user.save();

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      success: true,
      message: 'Scan the QR code with your authenticator app',
      data: {
        qrCode: qrCodeUrl,
        secret: secret.base32, // For manual entry
        setupKey: secret.base32
      }
    });

  } catch (error) {
    console.error('MFA setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup MFA'
    });
  }
};

/**
 * @desc    Enable MFA (after verifying setup)
 * @route   POST /api/auth/enable-mfa
 * @access  Private
 */
exports.enableMFA = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user.id).select('+mfaSecret');

    if (!user.mfaSecret) {
      return res.status(400).json({
        success: false,
        message: 'Please setup MFA first'
      });
    }

    // Verify the code
    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code. Please try again.'
      });
    }

    // Enable MFA and generate backup codes
    user.mfaEnabled = true;
    const backupCodes = user.generateBackupCodes();
    await user.save();

    // Log MFA enabled
    await AccessLog.logAccess({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'MFA_ENABLED',
      resourceType: 'auth',
      endpoint: '/api/auth/enable-mfa',
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.status(200).json({
      success: true,
      message: 'MFA enabled successfully',
      data: {
        backupCodes,
        message: 'Save these backup codes in a safe place. Each code can only be used once.'
      }
    });

  } catch (error) {
    console.error('Enable MFA error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enable MFA'
    });
  }
};

/**
 * @desc    Disable MFA
 * @route   POST /api/auth/disable-mfa
 * @access  Private
 */
exports.disableMFA = async (req, res) => {
  try {
    const { password, code } = req.body;
    const user = await User.findById(req.user.id).select('+password +mfaSecret');

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Verify MFA code
    const isValidCode = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!isValidCode) {
      return res.status(401).json({
        success: false,
        message: 'Invalid MFA code'
      });
    }

    // Disable MFA
    user.mfaEnabled = false;
    user.mfaSecret = undefined;
    user.mfaBackupCodes = [];
    await user.save();

    // Log MFA disabled
    await AccessLog.logAccess({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'MFA_DISABLED',
      resourceType: 'auth',
      endpoint: '/api/auth/disable-mfa',
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.status(200).json({
      success: true,
      message: 'MFA disabled successfully'
    });

  } catch (error) {
    console.error('Disable MFA error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disable MFA'
    });
  }
};

/**
 * @desc    Change password
 * @route   POST /api/auth/change-password
 * @access  Private
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    await AccessLog.logAccess({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'PASSWORD_CHANGED',
      resourceType: 'auth',
      endpoint: '/api/auth/change-password',
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const user = await User.findById(req.user.id);

    if (user && refreshToken) {
      // Remove the refresh token
      user.refreshTokens = user.refreshTokens.filter(
        rt => rt.token !== refreshToken
      );
      await user.save();
    }

    // Log logout
    await AccessLog.logAccess({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'LOGOUT',
      resourceType: 'auth',
      endpoint: '/api/auth/logout',
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh-token
 * @access  Public (with valid refresh token)
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Find user and check if refresh token exists
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const tokenExists = user.refreshTokens.some(rt => rt.token === refreshToken);
    if (!tokenExists) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token not found'
      });
    }

    // Generate new access token
    const newAccessToken = user.generateAccessToken();

    // Log token refresh
    await AccessLog.logAccess({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'TOKEN_REFRESH',
      resourceType: 'auth',
      endpoint: '/api/auth/refresh-token',
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          bio: user.bio,
          company: user.company,
          isEmailVerified: user.isEmailVerified,
          mfaEnabled: user.mfaEnabled,
          designsCount: user.designsCount,
          collaborationsCount: user.collaborationsCount,
          storageUsed: user.storageUsed,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
};

/**
 * @desc    Verify email
 * @route   GET /api/auth/verify-email/:token
 * @access  Public
 */
exports.verifyEmail = async (req, res) => {
  try {
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Log email verification
    await AccessLog.logAccess({
      userId: user._id,
      userEmail: user.email,
      action: 'EMAIL_VERIFIED',
      resourceType: 'auth',
      endpoint: '/api/auth/verify-email',
      method: 'GET',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.status(200).json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Email verification failed'
    });
  }
};

/**
 * @desc    Request password reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findByEmail(email);

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.'
      });
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    // Log password reset request
    await AccessLog.logAccess({
      userId: user._id,
      userEmail: user.email,
      action: 'PASSWORD_RESET_REQUEST',
      resourceType: 'auth',
      endpoint: '/api/auth/forgot-password',
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    // Send email
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
      await sendEmail({
        to: user.email,
        subject: 'FashionGuard - Password Reset Request',
        template: 'passwordReset',
        data: {
          name: user.firstName,
          resetUrl
        }
      });
    } catch (emailError) {
      console.error('Password reset email failed:', emailError);
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
};

/**
 * @desc    Reset password
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokens = []; // Invalidate all sessions
    await user.save();

    // Log password reset
    await AccessLog.logAccess({
      userId: user._id,
      userEmail: user.email,
      action: 'PASSWORD_RESET_SUCCESS',
      resourceType: 'auth',
      endpoint: '/api/auth/reset-password',
      method: 'POST',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.status(200).json({
      success: true,
      message: 'Password reset successful. Please login with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};
