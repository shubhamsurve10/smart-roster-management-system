
import express from "express";
import {
  getRosterEntries,
  createRosterEntry,
  updateRosterEntry,
} from "../controllers/rosterEntryController.js";
import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// All authenticated roles can view roster entries
router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead", "agent"),
  getRosterEntries
);

// Only Admin and Pod Leads can create entries
router.post(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead"),
  createRosterEntry
);

// Only Admin and Pod Leads can update entries
router.patch(
  "/:id",
  protect,
  authorizeRoles("admin", "pod_lead"),
  updateRosterEntry
);

export default router;
