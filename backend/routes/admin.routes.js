const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/rbac.middleware');
const {
  getMonitoringOverview,
  getSecurityEvents,
  getActivitySummary,
  unlockUser
} = require('../controllers/admin.controller');

// All admin routes require authentication + admin role
router.use(protect, adminOnly);

router.get('/monitoring', getMonitoringOverview);
router.get('/security-events', getSecurityEvents);
router.get('/activity-summary', getActivitySummary);
router.post('/users/:id/unlock', unlockUser);

module.exports = router;
