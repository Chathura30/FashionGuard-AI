const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

/**
 * Validation rules
 */
const registerValidation = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number and special character')
];

const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
];

const mfaValidation = [
  body('userId')
    .notEmpty().withMessage('User ID is required'),
  body('code')
    .notEmpty().withMessage('Verification code is required')
    .isLength({ min: 6, max: 8 }).withMessage('Invalid verification code')
];

const passwordValidation = [
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number and special character')
];

/**
 * Public routes
 */

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', registerValidation, authController.register);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', loginValidation, authController.login);

// @route   POST /api/auth/verify-mfa
// @desc    Verify MFA code
// @access  Public (with mfaToken)
router.post('/verify-mfa', mfaValidation, authController.verifyMFA);

// @route   POST /api/auth/refresh-token
// @desc    Refresh access token
// @access  Public (with valid refresh token)
router.post('/refresh-token', authController.refreshToken);

// @route   GET /api/auth/verify-email/:token
// @desc    Verify email address
// @access  Public
router.get('/verify-email/:token', authController.verifyEmail);

// @route   POST /api/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post('/forgot-password',
  body('email').isEmail().withMessage('Please provide a valid email'),
  authController.forgotPassword
);

// @route   POST /api/auth/reset-password/:token
// @desc    Reset password
// @access  Public
router.post('/reset-password/:token', passwordValidation, authController.resetPassword);

/**
 * Protected routes
 */

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', protect, authController.getMe);

// @route   POST /api/auth/change-password
// @desc    Change password
// @access  Private
router.post('/change-password',
  protect,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain uppercase, lowercase, number and special character')
  ],
  authController.changePassword
);

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', protect, authController.logout);

// @route   POST /api/auth/setup-mfa
// @desc    Setup MFA
// @access  Private
router.post('/setup-mfa', protect, authController.setupMFA);

// @route   POST /api/auth/enable-mfa
// @desc    Enable MFA after verification
// @access  Private
router.post('/enable-mfa',
  protect,
  body('code').notEmpty().withMessage('Verification code is required'),
  authController.enableMFA
);

// @route   POST /api/auth/disable-mfa
// @desc    Disable MFA
// @access  Private
router.post('/disable-mfa',
  protect,
  [
    body('password').notEmpty().withMessage('Password is required'),
    body('code').notEmpty().withMessage('MFA code is required')
  ],
  authController.disableMFA
);

module.exports = router;
