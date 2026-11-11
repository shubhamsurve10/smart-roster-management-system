
import express from "express";

import {
  getRosters,
  createRoster,
  updateRoster,
  deleteRoster,
  generateRoster,
  validateRoster,
  publishRoster,
} from "../controllers/rosterController.js";

import {
  leaveImpact,
  getRosterViews,
  exportRoster,
} from "../controllers/rosterInsightsController.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// View rosters: all authenticated roles
router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead", "agent"),
  getRosters
);

// Create roster: Admin only
router.post(
  "/",
  protect,
  authorizeRoles("admin"),
  createRoster
);

// Update roster: Admin only
router.put(
  "/:id",
  protect,
  authorizeRoles("admin"),
  updateRoster
);

// Delete roster: Admin only
router.delete(
  "/:id",
  protect,
  authorizeRoles("admin"),
  deleteRoster
);

// Generate roster: Admin only
router.post(
  "/:id/generate",
  protect,
  authorizeRoles("admin"),
  generateRoster
);

// Validate roster: Admin only
router.post(
  "/:id/validate",
  protect,
  authorizeRoles("admin"),
  validateRoster
);

// Publish roster: Admin only
router.post(
  "/:id/publish",
  protect,
  authorizeRoles("admin"),
  publishRoster
);

// Leave impact (what-if, saves nothing): Admin only
router.post(
  "/:id/leave-impact",
  protect,
  authorizeRoles("admin"),
  leaveImpact
);

// Company / pod / brand / process / employee views: Admin and Pod Leads
router.get(
  "/:id/views",
  protect,
  authorizeRoles("admin", "pod_lead"),
  getRosterViews
);

// CSV export: Admin and Pod Leads (pod leads get their own pod only)
router.get(
  "/:id/export",
  protect,
  authorizeRoles("admin", "pod_lead"),
  exportRoster
);

export default router;
