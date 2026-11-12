import express from "express";
import { getWeeklyOffRules, createWeeklyOffRule, updateWeeklyOffRule, deleteWeeklyOffRule, setPreferredWeeklyOff } from "../controllers/weeklyOffRuleController.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
const router = express.Router();
router.use(protect);
router.get("/", authorizeRoles("admin", "pod_lead", "agent"), getWeeklyOffRules);
router.patch("/preferred", authorizeRoles("admin", "pod_lead", "agent"), setPreferredWeeklyOff);
router.post("/", authorizeRoles("admin"), createWeeklyOffRule);
// PATCH matches the frontend CrudPage update method; PUT retained for compatibility.
router.patch("/:id", authorizeRoles("admin", "pod_lead", "agent"), updateWeeklyOffRule);
router.put("/:id", authorizeRoles("admin", "pod_lead", "agent"), updateWeeklyOffRule);
router.delete("/:id", authorizeRoles("admin", "pod_lead", "agent"), deleteWeeklyOffRule);
export default router;
