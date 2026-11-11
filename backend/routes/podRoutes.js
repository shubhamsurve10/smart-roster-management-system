
import express from "express";

import {
  getPods,
  createPod,
  updatePod,
  assignPodLead,
  removePodLead,
  deletePod,
} from "../controllers/podController.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin and Pod Lead can view pods
router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead"),
  getPods
);

// Only Admin can create pods
router.post(
  "/",
  protect,
  authorizeRoles("admin"),
  createPod
);

// Only Admin can update pods
router.put(
  "/:id",
  protect,
  authorizeRoles("admin"),
  updatePod
);

// Only Admin can assign or remove Pod Leads
router.put(
  "/:id/lead",
  protect,
  authorizeRoles("admin"),
  assignPodLead
);

router.delete(
  "/:id/lead",
  protect,
  authorizeRoles("admin"),
  removePodLead
);

// Only Admin can delete pods
router.delete(
  "/:id",
  protect,
  authorizeRoles("admin"),
  deletePod
);

export default router;
