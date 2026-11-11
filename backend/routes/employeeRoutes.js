import express from "express";
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
} from "../controllers/employeeController.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin and Pod Lead can view employees
router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead"),
  getEmployees
);

// Only Admin can create employees
router.post(
  "/",
  protect,
  authorizeRoles("admin"),
  createEmployee
);

// Admin and Pod Lead can edit employees
router.patch(
  "/:id",
  protect,
  authorizeRoles("admin", "pod_lead"),
  updateEmployee
);

// Only Admin can deactivate employees
router.delete(
  "/:id",
  protect,
  authorizeRoles("admin"),
  deactivateEmployee
);

export default router;