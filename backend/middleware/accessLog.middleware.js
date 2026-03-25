const AccessLog = require('../models/AccessLog.model');

/**
 * Parse user agent string for device info
 */
const parseUserAgent = (userAgent) => {
  if (!userAgent) return { device: 'Unknown', browser: 'Unknown', os: 'Unknown' };

  let device = 'Desktop';
  let browser = 'Unknown';
  let os = 'Unknown';

  // Detect device
  if (/mobile/i.test(userAgent)) {
    device = 'Mobile';
  } else if (/tablet|ipad/i.test(userAgent)) {
    device = 'Tablet';
  }

  // Detect browser
  if (/chrome/i.test(userAgent) && !/edge|edg/i.test(userAgent)) {
    browser = 'Chrome';
  } else if (/firefox/i.test(userAgent)) {
    browser = 'Firefox';
  } else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) {
    browser = 'Safari';
  } else if (/edge|edg/i.test(userAgent)) {
    browser = 'Edge';
  } else if (/msie|trident/i.test(userAgent)) {
    browser = 'Internet Explorer';
  }

  // Detect OS
  if (/windows/i.test(userAgent)) {
    os = 'Windows';
  } else if (/macintosh|mac os/i.test(userAgent)) {
    os = 'macOS';
  } else if (/linux/i.test(userAgent)) {
    os = 'Linux';
  } else if (/android/i.test(userAgent)) {
    os = 'Android';
  } else if (/iphone|ipad|ipod/i.test(userAgent)) {
    os = 'iOS';
  }

  return { device, browser, os };
};

/**
 * Middleware to log all API access
 */
exports.accessLogger = async (req, res, next) => {
  // Store start time
  req.startTime = Date.now();

  // Store original end function
  const originalEnd = res.end;

  // Override end function to log after response
  res.end = function(...args) {
    // Call original end
    originalEnd.apply(res, args);

    // Don't log health checks and static assets
    if (req.originalUrl === '/api/health' ||
        req.originalUrl.startsWith('/static') ||
        req.originalUrl.startsWith('/favicon')) {
      return;
    }

    // Determine action based on route
    let action = determineAction(req.method, req.originalUrl);

    // Parse user agent
    const { device, browser, os } = parseUserAgent(req.headers['user-agent']);

    // Create log entry (async, don't wait)
    const logEntry = {
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      userRole: req.user?.role || null,
      action,
      resourceType: determineResourceType(req.originalUrl),
      endpoint: req.originalUrl,
      method: req.method,
      statusCode: res.statusCode,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'],
      device,
      browser,
      os,
      success: res.statusCode < 400,
      metadata: {
        responseTime: Date.now() - req.startTime,
        contentLength: res.get('Content-Length'),
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        body: sanitizeBody(req.body)
      }
    };

    // Log asynchronously
    AccessLog.logAccess(logEntry).catch(err => {
      console.error('Failed to log access:', err);
    });
  };

  next();
};

/**
 * Determine action type from request
 */
const determineAction = (method, url) => {
  const urlLower = url.toLowerCase();

  // Auth actions
  if (urlLower.includes('/auth/login')) return 'LOGIN_ATTEMPT';
  if (urlLower.includes('/auth/register')) return 'REGISTER';
  if (urlLower.includes('/auth/logout')) return 'LOGOUT';
  if (urlLower.includes('/auth/verify-mfa')) return 'MFA_VERIFIED';
  if (urlLower.includes('/auth/forgot-password')) return 'PASSWORD_RESET_REQUEST';
  if (urlLower.includes('/auth/reset-password')) return 'PASSWORD_RESET_SUCCESS';
  if (urlLower.includes('/auth/refresh-token')) return 'TOKEN_REFRESH';

  // Design actions
  if (urlLower.includes('/designs')) {
    switch (method) {
      case 'POST':
        if (urlLower.includes('/share')) return 'DESIGN_SHARE';
        if (urlLower.includes('/download')) return 'DESIGN_DOWNLOAD';
        return 'DESIGN_CREATE';
      case 'GET':
        return 'DESIGN_VIEW';
      case 'PUT':
      case 'PATCH':
        return 'DESIGN_UPDATE';
      case 'DELETE':
        return 'DESIGN_DELETE';
    }
  }

  // Watermark actions
  if (urlLower.includes('/watermark')) {
    if (urlLower.includes('/verify')) return 'WATERMARK_VERIFY';
    if (urlLower.includes('/remove')) return 'WATERMARK_REMOVE';
    if (method === 'POST') return 'WATERMARK_ADD';
  }

  // Default based on method
  switch (method) {
    case 'GET': return 'DESIGN_VIEW';
    case 'POST': return 'DESIGN_CREATE';
    case 'PUT':
    case 'PATCH': return 'DESIGN_UPDATE';
    case 'DELETE': return 'DESIGN_DELETE';
    default: return 'DESIGN_VIEW';
  }
};

/**
 * Determine resource type from URL
 */
const determineResourceType = (url) => {
  const urlLower = url.toLowerCase();

  if (urlLower.includes('/auth')) return 'auth';
  if (urlLower.includes('/users')) return 'user';
  if (urlLower.includes('/designs')) return 'design';
  if (urlLower.includes('/collaborat')) return 'collaboration';

  return 'system';
};

/**
 * Sanitize request body for logging (remove sensitive data)
 */
const sanitizeBody = (body) => {
  if (!body || Object.keys(body).length === 0) return undefined;

  const sanitized = { ...body };
  const sensitiveFields = [
    'password',
    'newPassword',
    'currentPassword',
    'confirmPassword',
    'mfaSecret',
    'token',
    'refreshToken',
    'accessToken',
    'code',
    'mfaCode'
  ];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
};

/**
 * Middleware to log specific security events
 */
exports.logSecurityEvent = (action, details = {}) => {
  return async (req, res, next) => {
    const { device, browser, os } = parseUserAgent(req.headers['user-agent']);

    await AccessLog.logAccess({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      userRole: req.user?.role || null,
      action,
      resourceType: 'system',
      endpoint: req.originalUrl,
      method: req.method,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      device,
      browser,
      os,
      success: true,
      metadata: details,
      isSuspicious: details.isSuspicious || false,
      threatLevel: details.threatLevel || 'none'
    });

    next();
  };
};
