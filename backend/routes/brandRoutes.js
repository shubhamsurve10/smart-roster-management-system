
import express from "express";

import {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand,
} from "../controllers/brandController.js";

import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// All authenticated users can view brands
router.get(
  "/",
  protect,
  authorizeRoles("admin", "pod_lead", "agent"),
  getBrands
);

// Only Admin can manage brands
router.post("/", protect, authorizeRoles("admin"), createBrand);
router.put("/:id", protect, authorizeRoles("admin"), updateBrand);
router.delete("/:id", protect, authorizeRoles("admin"), deleteBrand);

export default router;
