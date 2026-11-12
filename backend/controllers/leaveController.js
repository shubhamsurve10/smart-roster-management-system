import mongoose from "mongoose";
import Leave from "../models/Leave.js";
import Employee from "../models/Employee.js";

const isValidDate = (date) => {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
};

const validLeaveType = (type) => ["LEAVE", "COMP_OFF"].includes(type);

const hasOverlappingRequest = async ({ employee, startDate, endDate, excludeId }) => {
  const filter = {
    employee,
    status: { $in: ["PENDING", "APPROVED"] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };

  if (excludeId) filter._id = { $ne: excludeId };
  return Leave.findOne(filter).select("_id status startDate endDate").lean();
};

const validateDates = (startDate, endDate) => {
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return "Please provide valid dates in YYYY-MM-DD format";
  }
  if (endDate < startDate) {
    return "End date cannot be before start date";
  }
  return null;
};

// Admin sees all requests. Agents and pod leads see only their own requests.
export const getLeaves = async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === "agent") {
      const ownEmployeeId = req.user.employee || req.user.id;
      if (!ownEmployeeId) return res.status(403).json({ success: false, message: "Your account is not linked to an employee record" });
      filter.employee = ownEmployeeId;
    } else if (req.user.role === "pod_lead") {
      if (!req.user.pod) return res.status(403).json({ success: false, message: "You are not assigned to a pod" });
      filter.employee = { $in: await Employee.find({ pod: req.user.pod, active: true }).distinct("_id") };
    }

    const leaves = await Leave.find(filter)
      .populate("employee", "name role pod")
      .populate("reviewedBy", "name")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves,
    });
  } catch (error) {
    console.error("getLeaves error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve leave requests",
    });
  }
};

// Agents and pod leads can submit only for themselves. Every new request starts PENDING.
// Admin may submit on behalf of an employee, but cannot bypass the review endpoint.
export const createLeave = async (req, res) => {
  try {
    const { startDate, endDate, type, reason = "" } = req.body;
    let employeeId;

    if (req.user.role === "admin") {
      employeeId = req.body.employee;
    } else {
      employeeId = req.user.employee || req.user.id;
    }

    if (!employeeId || !startDate || !endDate || !type) {
      return res.status(400).json({
        success: false,
        message: "Employee, start date, end date and type are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    const dateError = validateDates(startDate, endDate);
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    if (!validLeaveType(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be LEAVE or COMP_OFF",
      });
    }

    if (typeof reason !== "string" || reason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Reason must be text and cannot exceed 500 characters",
      });
    }

    const employee = await Employee.findOne({
      _id: employeeId,
      active: true,
    }).select("_id name");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Active employee not found",
      });
    }

    const overlappingRequest = await hasOverlappingRequest({
      employee: employeeId,
      startDate,
      endDate,
    });

    if (overlappingRequest) {
      return res.status(409).json({
        success: false,
        message: "An overlapping pending or approved leave request already exists",
      });
    }

    const leave = await Leave.create({
      employee: employeeId,
      startDate,
      endDate,
      type,
      reason: reason.trim(),
      status: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
    });

    await leave.populate("employee", "name role pod");

    return res.status(201).json({
      success: true,
      message: "Leave request submitted successfully and is awaiting admin approval",
      data: leave,
    });
  } catch (error) {
    console.error("createLeave error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to create leave request",
    });
  }
};

// Admin-only edit of request details. Status is deliberately not editable here.
export const updateLeave = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid leave ID" });
    }

    const leave = await Leave.findById(id);
    if (!leave) {
      return res.status(404).json({ success: false, message: "Leave request not found" });
    }

    const employeeId = req.body.employee ?? leave.employee.toString();
    const startDate = req.body.startDate ?? leave.startDate;
    const endDate = req.body.endDate ?? leave.endDate;
    const type = req.body.type ?? leave.type;
    const reason = req.body.reason ?? leave.reason;

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: "Invalid employee ID" });
    }

    const dateError = validateDates(startDate, endDate);
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    if (!validLeaveType(type)) {
      return res.status(400).json({ success: false, message: "Type must be LEAVE or COMP_OFF" });
    }

    if (typeof reason !== "string" || reason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Reason must be text and cannot exceed 500 characters",
      });
    }

    const employee = await Employee.findOne({ _id: employeeId, active: true }).select("_id");
    if (!employee) {
      return res.status(404).json({ success: false, message: "Active employee not found" });
    }

    const overlappingRequest = await hasOverlappingRequest({
      employee: employeeId,
      startDate,
      endDate,
      excludeId: id,
    });

    if (overlappingRequest) {
      return res.status(409).json({
        success: false,
        message: "An overlapping pending or approved leave request already exists",
      });
    }

    leave.employee = employeeId;
    leave.startDate = startDate;
    leave.endDate = endDate;
    leave.type = type;
    leave.reason = reason.trim();

    await leave.save();
    await leave.populate("employee", "name role pod");

    return res.status(200).json({
      success: true,
      message: "Leave request details updated successfully",
      data: leave,
    });
  } catch (error) {
    console.error("updateLeave error:", error);
    return res.status(500).json({ success: false, message: "Unable to update leave request" });
  }
};

// Admin or the employee's own Pod Lead can review a pending request.
export const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid leave ID" });
    }

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be APPROVED or REJECTED",
      });
    }

    const leave = await Leave.findById(id);
    if (!leave) {
      return res.status(404).json({ success: false, message: "Leave request not found" });
    }

    if (req.user.role === "pod_lead") {
      const inPod = await Employee.exists({ _id: leave.employee, pod: req.user.pod, active: true });
      if (!inPod) return res.status(403).json({ success: false, message: "You can only review leave requests from your own pod" });
    }

    if (leave.status !== "PENDING") {
      return res.status(409).json({
        success: false,
        message: `This request has already been ${leave.status.toLowerCase()}`,
      });
    }

    leave.status = status;
    leave.reviewedBy = req.user.id;
    leave.reviewedAt = new Date();

    await leave.save();
    await leave.populate("employee", "name role pod");
    await leave.populate("reviewedBy", "name");

    return res.status(200).json({
      success: true,
      message: `Leave request ${status.toLowerCase()} successfully`,
      data: leave,
    });
  } catch (error) {
    console.error("updateLeaveStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update leave request status",
    });
  }
};

// Admin-only deletion (enforced by leaveRoutes.js).
export const deleteLeave = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid leave ID" });
    }

    const leave = await Leave.findById(id);
    if (!leave) {
      return res.status(404).json({ success: false, message: "Leave request not found" });
    }

    await Leave.findByIdAndDelete(id);
    return res.status(200).json({ success: true, message: "Leave request deleted successfully" });
  } catch (error) {
    console.error("deleteLeave error:", error);
    return res.status(500).json({ success: false, message: "Unable to delete leave request" });
  }
};
