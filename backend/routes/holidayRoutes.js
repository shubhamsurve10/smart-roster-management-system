
import express from "express";

import {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
} from "../controllers/holidayController.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// All authenticated users can view holidays
router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead", "agent"),
  getHolidays
);

// Only Admin can manage holidays
router.post("/", protect, authorizeRoles("admin"), createHoliday);
router.put("/:id", protect, authorizeRoles("admin"), updateHoliday);
router.delete("/:id", protect, authorizeRoles("admin"), deleteHoliday);

export default router;
