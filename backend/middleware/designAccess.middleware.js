const Design = require('../models/Design.model');
const AccessLog = require('../models/AccessLog.model');

/**
 * Middleware to verify user has access to a design
 * Attaches design and access info to request
 */
const verifyDesignAccess = async (req, res, next) => {
  try {
    const designId = req.params.id;

    if (!designId) {
      return res.status(400).json({
        success: false,
        message: 'Design ID is required'
      });
    }

    // Find design (basic info only, no encryption metadata)
    const design = await Design.findById(designId).populate('owner', 'firstName lastName email');

    if (!design) {
      await logAccessAttempt(req, 'DESIGN_ACCESS_DENIED', null, 'Design not found');
      return res.status(404).json({
        success: false,
        message: 'Design not found'
      });
    }

    // Check if design is archived
    if (design.status === 'archived') {
      await logAccessAttempt(req, 'DESIGN_ACCESS_DENIED', design._id, 'Design is archived');
      return res.status(404).json({
        success: false,
        message: 'Design not found'
      });
    }

    // Get user's access level
    const access = design.getUserAccess(req.user.id);
    const isAdmin = req.user.role === 'admin';

    if (!access && !isAdmin) {
      await logAccessAttempt(req, 'PERMISSION_DENIED', design._id, 'No access to design');
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this design'
      });
    }

    // Attach design and access info to request
    req.design = design;
    req.designAccess = access || { isOwner: false, permission: 'admin' };
    req.isDesignOwner = access?.isOwner || false;
    req.isAdmin = isAdmin;

    next();
  } catch (error) {
    console.error('Design access verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify design access'
    });
  }
};

/**
 * Middleware to verify user can download a design
 */
const verifyDownloadAccess = async (req, res, next) => {
  try {
    const designId = req.params.id;

    // Find design with encryption metadata (including watermarked file paths)
    const design = await Design.findWithWatermark(designId);

    if (!design) {
      await logAccessAttempt(req, 'DOWNLOAD_DENIED', null, 'Design not found');
      return res.status(404).json({
        success: false,
        message: 'Design not found'
      });
    }

    if (design.status === 'archived') {
      await logAccessAttempt(req, 'DOWNLOAD_DENIED', design._id, 'Design is archived');
      return res.status(404).json({
        success: false,
        message: 'Design not found'
      });
    }

    const isAdmin = req.user.role === 'admin';
    const canDownload = design.canDownload(req.user.id);

    if (!canDownload && !isAdmin) {
      await logAccessAttempt(req, 'DOWNLOAD_DENIED', design._id, 'No download permission');
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to download this design'
      });
    }

    req.design = design;
    req.isDesignOwner = design.owner.toString() === req.user.id.toString();

    next();
  } catch (error) {
    console.error('Download access verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify download access'
    });
  }
};

/**
 * Middleware to verify user can edit a design
 */
const verifyEditAccess = async (req, res, next) => {
  try {
    const designId = req.params.id;

    const design = await Design.findById(designId);

    if (!design) {
      await logAccessAttempt(req, 'EDIT_DENIED', null, 'Design not found');
      return res.status(404).json({
        success: false,
        message: 'Design not found'
      });
    }

    if (design.status === 'archived') {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit archived designs'
      });
    }

    const isAdmin = req.user.role === 'admin';
    const canEdit = design.canEdit(req.user.id);

    if (!canEdit && !isAdmin) {
      await logAccessAttempt(req, 'EDIT_DENIED', design._id, 'No edit permission');
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to edit this design'
      });
    }

    req.design = design;
    req.isDesignOwner = design.owner.toString() === req.user.id.toString();

    next();
  } catch (error) {
    console.error('Edit access verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify edit access'
    });
  }
};

/**
 * Middleware to verify user is the design owner
 */
const verifyOwnership = async (req, res, next) => {
  try {
    const designId = req.params.id;

    const design = await Design.findById(designId);

    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found'
      });
    }

    const isOwner = design.owner.toString() === req.user.id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      await logAccessAttempt(req, 'OWNERSHIP_DENIED', design._id, 'Not the owner');
      return res.status(403).json({
        success: false,
        message: 'Only the design owner can perform this action'
      });
    }

    req.design = design;
    req.isDesignOwner = isOwner;

    next();
  } catch (error) {
    console.error('Ownership verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify ownership'
    });
  }
};

/**
 * Helper to log access attempts
 */
async function logAccessAttempt(req, action, resourceId, errorMessage) {
  try {
    await AccessLog.logAccess({
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action,
      resourceType: 'design',
      resourceId,
      endpoint: req.originalUrl,
      method: req.method,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      success: false,
      errorMessage,
      isSuspicious: action === 'PERMISSION_DENIED',
      threatLevel: action === 'PERMISSION_DENIED' ? 'low' : 'none'
    });
  } catch (logError) {
    console.error('Failed to log access attempt:', logError);
  }
}

module.exports = {
  verifyDesignAccess,
  verifyDownloadAccess,
  verifyEditAccess,
  verifyOwnership
};
