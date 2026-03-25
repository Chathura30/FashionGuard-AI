const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { requirePermission, PERMISSIONS } = require('../middleware/rbac.middleware');
const { uploadDesign, handleMulterError, requireFile } = require('../config/multer');
const watermarkController = require('../controllers/watermark.controller');

/**
 * Standalone watermark routes for verification and management
 */

/**
 * @route   POST /api/watermarks/verify-image
 * @desc    Verify watermark in an uploaded external image
 * @access  Private (VERIFY_WATERMARK permission)
 */
router.post('/verify-image',
  protect,
  requirePermission(PERMISSIONS.VERIFY_WATERMARK),
  uploadDesign.single('image'),
  handleMulterError,
  requireFile,
  watermarkController.verifyExternalImage
);

/**
 * @route   GET /api/watermarks/my
 * @desc    Get current user's watermarked designs
 * @access  Private
 */
router.get('/my',
  protect,
  watermarkController.getMyWatermarks
);

module.exports = router;
