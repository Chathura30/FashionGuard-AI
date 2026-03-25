const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { requirePermission, PERMISSIONS } = require('../middleware/rbac.middleware');
const {
  verifyDesignAccess,
  verifyDownloadAccess,
  verifyEditAccess,
  verifyOwnership
} = require('../middleware/designAccess.middleware');
const { uploadDesign, handleMulterError, requireFile } = require('../config/multer');
const designController = require('../controllers/design.controller');
const watermarkController = require('../controllers/watermark.controller');
const { body } = require('express-validator');

/**
 * Validation rules for design upload
 */
const uploadValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
  body('category')
    .optional()
    .isIn(['sketch', 'pattern', 'technical', 'rendering', 'other'])
    .withMessage('Invalid category')
];

/**
 * Validation rules for design update
 */
const updateValidation = [
  body('title')
    .optional()
    .trim()
    .notEmpty().withMessage('Title cannot be empty')
    .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
  body('category')
    .optional()
    .isIn(['sketch', 'pattern', 'technical', 'rendering', 'other'])
    .withMessage('Invalid category'),
  body('status')
    .optional()
    .isIn(['draft', 'active', 'archived'])
    .withMessage('Invalid status')
];

/**
 * Validation rules for sharing
 */
const shareValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format'),
  body('permission')
    .optional()
    .isIn(['view', 'edit', 'download'])
    .withMessage('Permission must be view, edit, or download')
];

// ==================== DESIGN ROUTES ====================

/**
 * @route   GET /api/designs/my
 * @desc    Get current user's designs
 * @access  Private
 */
router.get('/my',
  protect,
  requirePermission(PERMISSIONS.READ_DESIGN),
  designController.getMyDesigns
);

/**
 * @route   GET /api/designs/shared
 * @desc    Get designs shared with current user
 * @access  Private
 */
router.get('/shared',
  protect,
  requirePermission(PERMISSIONS.READ_DESIGN),
  designController.getSharedDesigns
);

/**
 * @route   POST /api/designs
 * @desc    Upload and encrypt a new design
 * @access  Private (CREATE_DESIGN permission)
 */
router.post('/',
  protect,
  requirePermission(PERMISSIONS.CREATE_DESIGN),
  uploadDesign.single('designFile'),
  handleMulterError,
  requireFile,
  uploadValidation,
  designController.uploadDesign
);

/**
 * @route   GET /api/designs/:id
 * @desc    Get single design details
 * @access  Private (owner, collaborator, or admin)
 */
router.get('/:id',
  protect,
  requirePermission(PERMISSIONS.READ_DESIGN),
  verifyDesignAccess,
  designController.getDesign
);

/**
 * @route   GET /api/designs/:id/download
 * @desc    Download and decrypt a design file
 * @access  Private (requires download permission)
 */
router.get('/:id/download',
  protect,
  requirePermission(PERMISSIONS.DOWNLOAD_DESIGN),
  verifyDownloadAccess,
  designController.downloadDesign
);

/**
 * @route   PUT /api/designs/:id
 * @desc    Update design metadata
 * @access  Private (owner, editor, or admin)
 */
router.put('/:id',
  protect,
  requirePermission(PERMISSIONS.UPDATE_DESIGN),
  verifyEditAccess,
  updateValidation,
  designController.updateDesign
);

/**
 * @route   DELETE /api/designs/:id
 * @desc    Delete a design and its encrypted files
 * @access  Private (owner or admin)
 */
router.delete('/:id',
  protect,
  requirePermission(PERMISSIONS.DELETE_DESIGN),
  verifyOwnership,
  designController.deleteDesign
);

/**
 * @route   POST /api/designs/:id/share
 * @desc    Share design with another user
 * @access  Private (owner only)
 */
router.post('/:id/share',
  protect,
  requirePermission(PERMISSIONS.SHARE_DESIGN),
  verifyOwnership,
  shareValidation,
  designController.shareDesign
);

/**
 * @route   DELETE /api/designs/:id/collaborators/:userId
 * @desc    Remove collaborator from design
 * @access  Private (owner only)
 */
router.delete('/:id/collaborators/:userId',
  protect,
  requirePermission(PERMISSIONS.SHARE_DESIGN),
  verifyOwnership,
  designController.removeCollaborator
);

// ==================== WATERMARK ROUTES ====================

/**
 * @route   POST /api/designs/:id/watermark
 * @desc    Apply invisible watermark to design
 * @access  Private (ADD_WATERMARK permission)
 */
router.post('/:id/watermark',
  protect,
  requirePermission(PERMISSIONS.ADD_WATERMARK),
  verifyEditAccess,
  watermarkController.addWatermark
);

/**
 * @route   GET /api/designs/:id/watermark
 * @desc    Get watermark information
 * @access  Private (VERIFY_WATERMARK permission)
 */
router.get('/:id/watermark',
  protect,
  requirePermission(PERMISSIONS.VERIFY_WATERMARK),
  verifyDesignAccess,
  watermarkController.getWatermarkInfo
);

/**
 * @route   POST /api/designs/:id/watermark/verify
 * @desc    Verify watermark on design
 * @access  Private (VERIFY_WATERMARK permission)
 */
router.post('/:id/watermark/verify',
  protect,
  requirePermission(PERMISSIONS.VERIFY_WATERMARK),
  verifyDesignAccess,
  watermarkController.verifyWatermark
);

/**
 * @route   DELETE /api/designs/:id/watermark
 * @desc    Remove watermark from design
 * @access  Private (owner or admin)
 */
router.delete('/:id/watermark',
  protect,
  requirePermission(PERMISSIONS.REMOVE_WATERMARK),
  verifyOwnership,
  watermarkController.removeWatermark
);

module.exports = router;
