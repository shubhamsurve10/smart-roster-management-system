
import express from "express";

import {
  getWeeklyOffRules,
  createWeeklyOffRule,
  updateWeeklyOffRule,
  deleteWeeklyOffRule,
} from "../controllers/weeklyOffRuleController.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead", "agent"),
  getWeeklyOffRules
);

// Admin and Pod Lead can add rules.
// Backend restricts Pod Leads to PREFERRED rules for their own pod.
router.post(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead"),
  createWeeklyOffRule
);

// Only Admin can update or delete rules.
router.put(
  "/:id",
  protect,
  authorizeRoles("admin"),
  updateWeeklyOffRule
);

// PATCH compatibility with the existing frontend CrudPage.
router.patch(
  "/:id",
  protect,
  authorizeRoles("admin"),
  updateWeeklyOffRule
);

router.delete(
  "/:id",
  protect,
  authorizeRoles("admin"),
  deleteWeeklyOffRule
);

export default router;
