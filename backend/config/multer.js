const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Allowed MIME types for fashion design files
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/gif',
  'image/tiff',
  // Design files
  'image/vnd.adobe.photoshop', // PSD
  'application/pdf',
  'application/postscript', // AI, EPS
  'application/illustrator',
  // Archives (for design bundles)
  'application/zip',
  'application/x-zip-compressed'
];

// Allowed file extensions
const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.tiff', '.tif',
  '.psd', '.pdf', '.ai', '.eps', '.zip'
];

/**
 * Validate file type by MIME type and extension
 */
const fileFilter = (req, file, cb) => {
  // Check MIME type
  const isMimeAllowed = ALLOWED_MIME_TYPES.includes(file.mimetype);

  // Check extension
  const ext = path.extname(file.originalname).toLowerCase();
  const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);

  if (isMimeAllowed && isExtAllowed) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
  }
};

/**
 * Memory storage for smaller files (< 10MB)
 * Files are kept in memory for encryption before writing to disk
 */
const memoryStorage = multer.memoryStorage();

/**
 * Disk storage for temporary files (larger files)
 * Used when streaming encryption is needed
 */
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, '..', 'temp');
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename to prevent collisions
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const ext = path.extname(file.originalname);
    cb(null, `upload-${uniqueSuffix}${ext}`);
  }
});

/**
 * Get max file size from environment or use default (50MB)
 */
const getMaxFileSize = () => {
  return parseInt(process.env.MAX_FILE_SIZE) || 52428800; // 50MB default
};

/**
 * Multer configuration for design uploads using memory storage
 * Best for files up to ~50MB
 */
const uploadDesign = multer({
  storage: memoryStorage,
  limits: {
    fileSize: getMaxFileSize(),
    files: 1 // Single file upload only
  },
  fileFilter: fileFilter
});

/**
 * Multer configuration for large file uploads using disk storage
 * For files that need streaming encryption
 */
const uploadDesignLarge = multer({
  storage: diskStorage,
  limits: {
    fileSize: getMaxFileSize(),
    files: 1
  },
  fileFilter: fileFilter
});

/**
 * Error handler for multer errors
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${Math.round(getMaxFileSize() / 1024 / 1024)}MB`
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Only one file can be uploaded at a time'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field in upload'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed'
    });
  }

  next();
};

/**
 * Middleware to validate file presence
 */
const requireFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded. Please select a design file.'
    });
  }
  next();
};

/**
 * Sanitize filename to prevent path traversal
 */
const sanitizeFilename = (filename) => {
  // Remove path separators and null bytes
  return filename
    .replace(/[/\\]/g, '')
    .replace(/\0/g, '')
    .trim();
};

module.exports = {
  uploadDesign,
  uploadDesignLarge,
  handleMulterError,
  requireFile,
  sanitizeFilename,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  getMaxFileSize
};
