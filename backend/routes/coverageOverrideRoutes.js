
import express from "express";

import {
  getCoverageOverrides,
  createCoverageOverride,
  updateCoverageOverride,
  deleteCoverageOverride,
} from "../controllers/coverageOverrideController.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// All authenticated roles can view coverage overrides
router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead", "agent"),
  getCoverageOverrides
);

// Only Admin can create
router.post(
  "/",
  protect,
  authorizeRoles("admin"),
  createCoverageOverride
);

// Only Admin can update
router.put(
  "/:id",
  protect,
  authorizeRoles("admin"),
  updateCoverageOverride
);

// Only Admin can delete
router.delete(
  "/:id",
  protect,
  authorizeRoles("admin"),
  deleteCoverageOverride
);

export default router;
