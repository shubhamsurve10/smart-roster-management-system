// New, additive endpoints. Existing roster controllers are unchanged.

import mongoose from "mongoose";

import Roster from "../models/Roster.js";
import Employee from "../models/Employee.js";
import { isValidDate } from "../engine/dates.js";
import {
  analyzeMonthlyLeaveImpact,
  getMonthlyRosterViews,
  exportMonthlyRosterCsv,
} from "../services/rosterInsightsService.js";

const findRoster = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: "Invalid roster ID." });
    return null;
  }
  const roster = await Roster.findById(id).lean();
  if (!roster) {
    res.status(404).json({ success: false, message: "Roster not found." });
    return null;
  }
  return roster;
};

// POST /api/rosters/:id/leave-impact  (admin only)
// Body: { employee, startDate, endDate, type }. Saves nothing.
export const leaveImpact = async (req, res) => {
  try {
    const roster = await findRoster(req, res);
    if (!roster) return;

    const { employee, startDate, endDate, type = "LEAVE" } = req.body || {};

    if (!employee || !mongoose.Types.ObjectId.isValid(employee)) {
      return res.status(400).json({ success: false, message: "A valid employee ID is required." });
    }
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ success: false, message: "startDate and endDate must be valid YYYY-MM-DD dates." });
    }
    if (endDate < startDate) {
      return res.status(400).json({ success: false, message: "endDate cannot be before startDate." });
    }
    if (!["LEAVE", "COMP_OFF"].includes(type)) {
      return res.status(400).json({ success: false, message: "type must be LEAVE or COMP_OFF." });
    }

    const result = await analyzeMonthlyLeaveImpact(roster.month, { employee, startDate, endDate, type });

    return res.status(200).json({ success: true, message: result.message, data: result });
  } catch (error) {
    const status = /not found|inactive|must be|cannot be/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// GET /api/rosters/:id/views  (admin, pod_lead)
// Company / pod / brand / process / employee views of the saved roster.
// Pod leads only see employee rows for their own pod.
export const getRosterViews = async (req, res) => {
  try {
    const roster = await findRoster(req, res);
    if (!roster) return;

    const views = await getMonthlyRosterViews(roster.month);

    if (req.user?.role === "pod_lead") {
      const podId = req.user.pod;
      views.employees = views.employees.filter((employee) => employee.pod === podId);
      views.pods = views.pods.filter((pod) => pod.pod === podId);
    }

    return res.status(200).json({ success: true, data: views });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/rosters/:id/export?view=employees|coverage  (admin, pod_lead)
export const exportRoster = async (req, res) => {
  try {
    const roster = await findRoster(req, res);
    if (!roster) return;

    const view = req.query.view === "coverage" ? "coverage" : "employees";
    let employeeIds = null;

    if (req.user?.role === "pod_lead") {
      const members = await Employee.find({ pod: req.user.pod }).distinct("_id");
      employeeIds = members.map(String);
    }

    const csv = await exportMonthlyRosterCsv(roster.month, { view, employeeIds });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="roster-${roster.month}-${view}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
