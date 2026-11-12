import express from "express";

import {
  getLeaves,
  createLeave,
  updateLeave,
  updateLeaveStatus,
  deleteLeave,
} from "../controllers/leaveController.js";

import { protect, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin sees all requests, Pod Leads see their pod, Agents see their own.
router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead", "agent"),
  getLeaves
);

// Agents and pod leads submit their own requests. Admin can create a request
// for an employee, but it is also created as PENDING and must be reviewed.
router.post(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead", "agent"),
  createLeave
);

// Only admin can edit request details.
router.put(
  "/:id",
  protect,
  authorizeRoles("admin"),
  updateLeave
);

// Admin and Pod Leads can review; controller enforces pod ownership.
router.patch(
  "/:id/status",
  protect,
  authorizeRoles("admin", "pod_lead"),
  updateLeaveStatus
);

// Only admin can delete a request.
router.delete(
  "/:id",
  protect,
  authorizeRoles("admin"),
  deleteLeave
);

export default router;
