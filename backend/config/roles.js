/**
 * Role-Based Access Control (RBAC) Configuration
 * Defines roles and their associated permissions for FashionGuard
 */

const ROLES = {
  ADMIN: 'admin',
  DESIGNER: 'designer',
  COLLABORATOR: 'collaborator',
  REVIEWER: 'reviewer'
};

const PERMISSIONS = {
  // Design permissions
  CREATE_DESIGN: 'create_design',
  READ_DESIGN: 'read_design',
  UPDATE_DESIGN: 'update_design',
  DELETE_DESIGN: 'delete_design',
  SHARE_DESIGN: 'share_design',
  DOWNLOAD_DESIGN: 'download_design',

  // Watermark permissions
  ADD_WATERMARK: 'add_watermark',
  VERIFY_WATERMARK: 'verify_watermark',
  REMOVE_WATERMARK: 'remove_watermark',

  // User management permissions
  VIEW_USERS: 'view_users',
  CREATE_USER: 'create_user',
  UPDATE_USER: 'update_user',
  DELETE_USER: 'delete_user',
  MANAGE_ROLES: 'manage_roles',

  // Collaboration permissions
  INVITE_COLLABORATOR: 'invite_collaborator',
  REMOVE_COLLABORATOR: 'remove_collaborator',
  VIEW_COLLABORATORS: 'view_collaborators',

  // Comment/Review permissions
  ADD_COMMENT: 'add_comment',
  DELETE_COMMENT: 'delete_comment',
  APPROVE_DESIGN: 'approve_design',
  REJECT_DESIGN: 'reject_design',

  // Analytics permissions
  VIEW_ANALYTICS: 'view_analytics',
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  EXPORT_REPORTS: 'export_reports',

  // AI Features permissions
  USE_AI_SUGGESTIONS: 'use_ai_suggestions',
  USE_TREND_PREDICTION: 'use_trend_prediction',
  USE_COLOR_PALETTE: 'use_color_palette',

  // System permissions
  MANAGE_SETTINGS: 'manage_settings',
  VIEW_SYSTEM_HEALTH: 'view_system_health'
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    // All permissions
    ...Object.values(PERMISSIONS)
  ],

  [ROLES.DESIGNER]: [
    // Design permissions
    PERMISSIONS.CREATE_DESIGN,
    PERMISSIONS.READ_DESIGN,
    PERMISSIONS.UPDATE_DESIGN,
    PERMISSIONS.DELETE_DESIGN,
    PERMISSIONS.SHARE_DESIGN,
    PERMISSIONS.DOWNLOAD_DESIGN,

    // Watermark permissions
    PERMISSIONS.ADD_WATERMARK,
    PERMISSIONS.VERIFY_WATERMARK,

    // Collaboration permissions
    PERMISSIONS.INVITE_COLLABORATOR,
    PERMISSIONS.REMOVE_COLLABORATOR,
    PERMISSIONS.VIEW_COLLABORATORS,

    // Comment permissions
    PERMISSIONS.ADD_COMMENT,
    PERMISSIONS.DELETE_COMMENT,

    // AI Features
    PERMISSIONS.USE_AI_SUGGESTIONS,
    PERMISSIONS.USE_TREND_PREDICTION,
    PERMISSIONS.USE_COLOR_PALETTE,

    // Analytics
    PERMISSIONS.VIEW_ANALYTICS
  ],

  [ROLES.COLLABORATOR]: [
    // Limited design permissions
    PERMISSIONS.READ_DESIGN,
    PERMISSIONS.UPDATE_DESIGN,
    PERMISSIONS.DOWNLOAD_DESIGN,

    // Watermark permissions
    PERMISSIONS.ADD_WATERMARK,
    PERMISSIONS.VERIFY_WATERMARK,

    // View collaborators
    PERMISSIONS.VIEW_COLLABORATORS,

    // Comment permissions
    PERMISSIONS.ADD_COMMENT,

    // AI Features
    PERMISSIONS.USE_AI_SUGGESTIONS,
    PERMISSIONS.USE_COLOR_PALETTE
  ],

  [ROLES.REVIEWER]: [
    // Design access
    PERMISSIONS.READ_DESIGN,
    PERMISSIONS.DOWNLOAD_DESIGN, // Can download shared designs to verify watermarks

    // Review permissions
    PERMISSIONS.ADD_COMMENT,
    PERMISSIONS.APPROVE_DESIGN,
    PERMISSIONS.REJECT_DESIGN,

    // Watermark verification
    PERMISSIONS.VERIFY_WATERMARK,

    // View collaborators
    PERMISSIONS.VIEW_COLLABORATORS
  ]
};

/**
 * Check if a role has a specific permission
 */
const hasPermission = (role, permission) => {
  if (!ROLE_PERMISSIONS[role]) {
    return false;
  }
  return ROLE_PERMISSIONS[role].includes(permission);
};

/**
 * Get all permissions for a role
 */
const getRolePermissions = (role) => {
  return ROLE_PERMISSIONS[role] || [];
};

/**
 * Get role hierarchy level (for comparison)
 */
const getRoleLevel = (role) => {
  const levels = {
    [ROLES.ADMIN]: 4,
    [ROLES.DESIGNER]: 3,
    [ROLES.COLLABORATOR]: 2,
    [ROLES.REVIEWER]: 1
  };
  return levels[role] || 0;
};

/**
 * Check if role1 is higher than role2
 */
const isHigherRole = (role1, role2) => {
  return getRoleLevel(role1) > getRoleLevel(role2);
};

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  getRolePermissions,
  getRoleLevel,
  isHigherRole
};
