
import express from "express";

import {
  getProcesses,
  createProcess,
  updateProcess,
  deleteProcess,
} from "../controllers/processController.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// All authenticated users can view processes
router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead", "agent"),
  getProcesses
);

// Only Admin can manage processes
router.post("/", protect, authorizeRoles("admin"), createProcess);
router.put("/:id", protect, authorizeRoles("admin"), updateProcess);
router.delete("/:id", protect, authorizeRoles("admin"), deleteProcess);

export default router;
