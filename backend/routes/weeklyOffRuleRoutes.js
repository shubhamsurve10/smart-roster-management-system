
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

// All roles can view rules.
// Controller filters the results according to the user's role.
router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead", "agent"),
  getWeeklyOffRules
);

// Only Admin can modify weekly-off rules
router.post(
  "/",
  protect,
  authorizeRoles("admin"),
  createWeeklyOffRule
);

router.put(
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
