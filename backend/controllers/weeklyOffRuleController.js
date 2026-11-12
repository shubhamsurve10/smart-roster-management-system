import mongoose from "mongoose";
import WeeklyOffRule from "../models/WeeklyOffRule.js";
import Employee from "../models/Employee.js";

const validWeekday = (value) => Number.isInteger(value) && value >= 0 && value <= 6;
const ownEmployeeId = (user) => user.employee || user.id;

const canManageEmployee = async (user, employeeId) => {
  if (user.role === "admin") return true;
  if (user.role === "agent") return String(ownEmployeeId(user)) === String(employeeId);
  if (user.role === "pod_lead" && user.pod) {
    return Boolean(await Employee.exists({ _id: employeeId, pod: user.pod, active: true }));
  }
  return false;
};

export const getWeeklyOffRules = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === "agent") filter.employee = ownEmployeeId(req.user);
    if (req.user.role === "pod_lead") {
      if (!req.user.pod) return res.status(403).json({ success: false, message: "You are not assigned to a pod" });
      filter.employee = { $in: await Employee.find({ pod: req.user.pod, active: true }).distinct("_id") };
    }
    const rules = await WeeklyOffRule.find(filter).populate("employee", "name role pod").sort({ weekday: 1, type: 1 });
    return res.status(200).json({ success: true, count: rules.length, data: rules });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Admin may create either type. A new preferred rule replaces the old preference.
export const createWeeklyOffRule = async (req, res) => {
  try {
    const { employee, weekday, type } = req.body;
    if (!employee || !validWeekday(weekday) || !["FIXED", "PREFERRED"].includes(type)) {
      return res.status(400).json({ success: false, message: "Employee, valid weekday (0-6), and FIXED/PREFERRED type are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(employee)) return res.status(400).json({ success: false, message: "Invalid employee ID" });
    const active = await Employee.exists({ _id: employee, active: true });
    if (!active) return res.status(404).json({ success: false, message: "Active employee not found" });
    const opposite = await WeeklyOffRule.findOne({ employee, type: type === "FIXED" ? "PREFERRED" : "FIXED", weekday });
    if (opposite) return res.status(409).json({ success: false, message: "Fixed and preferred weekly offs cannot be the same weekday" });
    if (type === "FIXED") {
      const existing = await WeeklyOffRule.findOne({ employee, type: "FIXED" });
      if (existing && existing.weekday !== weekday) return res.status(409).json({ success: false, message: "This employee already has a fixed weekly off. Edit the existing rule instead." });
    }
    if (type === "PREFERRED") await WeeklyOffRule.deleteMany({ employee, type: "PREFERRED" });
    const rule = await WeeklyOffRule.create({ employee, weekday, type });
    await rule.populate("employee", "name role pod");
    return res.status(201).json({ success: true, message: "Weekly-off rule created", data: rule });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "A rule already exists for this employee and weekday" });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Admin can edit any rule. Pod Leads can edit PREFERRED rules in their pod only.
export const updateWeeklyOffRule = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid weekly-off rule ID" });
    const rule = await WeeklyOffRule.findById(id);
    if (!rule) return res.status(404).json({ success: false, message: "Weekly-off rule not found" });
    if (req.user.role !== "admin") {
      if (rule.type !== "PREFERRED" || !(await canManageEmployee(req.user, rule.employee))) {
        return res.status(403).json({ success: false, message: "You can only change preferred weekly offs for employees you manage" });
      }
      if (req.body.type && req.body.type !== "PREFERRED") return res.status(403).json({ success: false, message: "Only Admin can change fixed weekly offs" });
      if (req.body.employee && String(req.body.employee) !== String(rule.employee)) return res.status(403).json({ success: false, message: "You cannot move a rule to another employee" });
    }
    const weekday = req.body.weekday ?? rule.weekday;
    const type = req.user.role === "admin" ? (req.body.type ?? rule.type) : "PREFERRED";
    const employee = req.user.role === "admin" ? (req.body.employee ?? rule.employee) : rule.employee;
    if (!validWeekday(weekday) || !["FIXED", "PREFERRED"].includes(type)) return res.status(400).json({ success: false, message: "Invalid weekday or rule type" });
    if (!(await Employee.exists({ _id: employee, active: true }))) return res.status(404).json({ success: false, message: "Active employee not found" });
    if (await WeeklyOffRule.exists({ employee, type: type === "FIXED" ? "PREFERRED" : "FIXED", weekday })) return res.status(409).json({ success: false, message: "Fixed and preferred weekly offs cannot be the same weekday" });
    if (type === "PREFERRED") await WeeklyOffRule.deleteMany({ employee, type: "PREFERRED", _id: { $ne: id } });
    else if (await WeeklyOffRule.exists({ employee, type: "FIXED", _id: { $ne: id } })) return res.status(409).json({ success: false, message: "Only one fixed weekly off is allowed per employee" });
    rule.employee = employee; rule.weekday = weekday; rule.type = type;
    await rule.save(); await rule.populate("employee", "name role pod");
    return res.status(200).json({ success: true, message: "Weekly-off rule updated", data: rule });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "A rule already exists for this employee and weekday" });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Self-service and Pod Lead preference setter. The employee identity is never trusted from an Agent payload.
export const setPreferredWeeklyOff = async (req, res) => {
  try {
    const { weekday } = req.body;
    if (!validWeekday(weekday)) return res.status(400).json({ success: false, message: "Weekday must be an integer from 0 to 6" });
    const employeeId = req.user.role === "agent" ? ownEmployeeId(req.user) : req.body.employee;
    if (!employeeId || !mongoose.Types.ObjectId.isValid(employeeId)) return res.status(400).json({ success: false, message: "A valid employee is required" });
    if (!(await canManageEmployee(req.user, employeeId))) return res.status(403).json({ success: false, message: "You can only set preferences for yourself or employees in your pod" });
    const fixed = await WeeklyOffRule.findOne({ employee: employeeId, type: "FIXED" });
    if (fixed?.weekday === weekday) return res.status(409).json({ success: false, message: "Preferred day cannot be the same as the fixed weekly off" });
    await WeeklyOffRule.deleteMany({ employee: employeeId, type: "PREFERRED" });
    const rule = await WeeklyOffRule.create({ employee: employeeId, weekday, type: "PREFERRED" });
    await rule.populate("employee", "name role pod");
    return res.status(200).json({ success: true, message: "Preferred weekly off saved. It will apply to future roster generation.", data: rule });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "A weekly-off rule already exists for this weekday" });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteWeeklyOffRule = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid weekly-off rule ID" });
    const rule = await WeeklyOffRule.findById(id);
    if (!rule) return res.status(404).json({ success: false, message: "Weekly-off rule not found" });
    if (req.user.role !== "admin" && (rule.type !== "PREFERRED" || !(await canManageEmployee(req.user, rule.employee)))) return res.status(403).json({ success: false, message: "You cannot delete this weekly-off rule" });
    await rule.deleteOne();
    return res.status(200).json({ success: true, message: "Weekly-off rule deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
