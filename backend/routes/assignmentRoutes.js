
import express from "express";

import {
  getAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getStaffingRecommendations,
} from "../controllers/assignmentController.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// All authenticated users can view their permitted assignments
router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead", "agent"),
  getAssignments
);

// Only Admin can manage assignments
router.post("/", protect, authorizeRoles("admin"), createAssignment);
router.put("/:id", protect, authorizeRoles("admin"), updateAssignment);
router.delete("/:id", protect, authorizeRoles("admin"), deleteAssignment);
// Admin only: get staffing recommendations for a process and date
router.get(
  "/staffing-recommendations",
  protect,
  authorizeRoles("admin"),
  getStaffingRecommendations
);

export default router;
