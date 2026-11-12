
import mongoose from "mongoose";
import RosterEntry from "../models/RosterEntry.js";
import Roster from "../models/Roster.js";
import Employee from "../models/Employee.js";
import Assignment from "../models/Assignment.js";
import Process from "../models/Process.js";
import Leave from "../models/Leave.js";
import WeeklyOffRule from "../models/WeeklyOffRule.js";
import Holiday from "../models/Holiday.js";

const validStatuses = [
  "WORKING",
  "WEEKLY_OFF",
  "HOLIDAY",
  "LEAVE",
  "COMP_OFF",
  "UNASSIGNED",
  "NON_WORKING_DAY",
  "NOT_SCHEDULED",
];

const isValidDate = (date) => {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
};

// Validate employee access based on logged-in user's role
const canAccessEmployee = async (req, employeeId) => {
  // Admin can access every employee
  if (req.user.role === "admin") {
    return true;
  }

  // Pod Lead can access employees in their own pod only
  if (req.user.role === "pod_lead") {
    if (!req.user.pod) {
      return false;
    }

    const employee = await Employee.findOne({
      _id: employeeId,
      pod: req.user.pod,
    }).select("_id");

    return !!employee;
  }

  // Agents cannot create or update roster entries
  return false;
};

// Validate selected processes against employee assignments
const validateProcesses = async (employeeId, processes) => {
  if (!Array.isArray(processes)) {
    return "Processes must be an array.";
  }

  if (
    processes.some(
      (id) => !mongoose.Types.ObjectId.isValid(id)
    )
  ) {
    return "One or more process IDs are invalid.";
  }

  const uniqueProcesses = [...new Set(processes.map(String))];

  if (uniqueProcesses.length !== processes.length) {
    return "Duplicate process IDs are not allowed.";
  }

  if (processes.length === 0) {
    return null;
  }

  const assignments = await Assignment.find({
    employee: employeeId,
    process: { $in: processes },
  }).select("process");

  if (assignments.length !== processes.length) {
    return "Employee must be assigned to every selected process.";
  }

  return null;
};

// Temporary process allocation is deliberately separate from permanent Assignment records.
const validateTemporaryProcesses = async (employeeId, temporaryProcesses, date, permanentProcesses = []) => {
  if (!Array.isArray(temporaryProcesses)) return "Temporary processes must be an array.";
  if (temporaryProcesses.some((id) => !mongoose.Types.ObjectId.isValid(id))) return "One or more temporary process IDs are invalid.";
  const unique = [...new Set(temporaryProcesses.map(String))];
  if (unique.length !== temporaryProcesses.length) return "Duplicate temporary process IDs are not allowed.";
  if (unique.some((id) => permanentProcesses.map(String).includes(id))) return "A process cannot be both permanent and temporary on the same date.";
  if (!unique.length) return null;

  const [processes, approvedLeave, fixedOff] = await Promise.all([
    Process.find({ _id: { $in: unique } }).select("_id calendarType").lean(),
    Leave.exists({ employee: employeeId, status: "APPROVED", startDate: { $lte: date }, endDate: { $gte: date } }),
    WeeklyOffRule.exists({ employee: employeeId, type: "FIXED", weekday: new Date(`${date}T00:00:00.000Z`).getUTCDay() }),
  ]);
  if (processes.length !== unique.length) return "One or more temporary processes do not exist.";
  if (approvedLeave || fixedOff) return "An employee on approved leave or a fixed weekly off cannot receive temporary work.";
  const holiday = await Holiday.exists({ date });
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  for (const process of processes) {
    const open = process.calendarType === "ALL_365" ||
      (process.calendarType === "EXCEPT_HOLIDAYS" && !holiday) ||
      (process.calendarType === "NO_SUN_NO_HOLIDAY" && weekday !== 0 && !holiday);
    if (!open) return "A selected temporary process is closed on this date.";
  }
  return null;
};

// Get roster entries
export const getRosterEntries = async (req, res) => {
  try {
    const filter = {};

    if (req.query.rosterMonth) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.rosterMonth)) {
        return res.status(400).json({
          success: false,
          message: "Invalid rosterMonth format. Use YYYY-MM",
        });
      }

      filter.rosterMonth = req.query.rosterMonth;
    }

    // Pod Lead: view only employees in their own pod
    if (req.user.role === "pod_lead") {
      if (!req.user.pod) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to a pod",
        });
      }

      const employeeIds = await Employee.find({
        pod: req.user.pod,
      }).distinct("_id");

      filter.employee = { $in: employeeIds };
    }

    // Agent: view only their own roster entries
    if (req.user.role === "agent") {
      filter.employee = req.user.employee;
    }

    // Admin: view all roster entries
    const entries = await RosterEntry.find(filter)
      .populate("employee", "name role pod")
      .populate({ path: "temporaryProcesses", populate: { path: "brand", select: "name" } })
      .populate({
        path: "processes",
        populate: {
          path: "brand",
          select: "name",
        },
      })
      .sort({ date: 1 });

    return res.status(200).json({
      success: true,
      count: entries.length,
      data: entries,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create a manual roster entry
export const createRosterEntry = async (req, res) => {
  try {
    const {
      rosterMonth,
      employee,
      date,
      status,
      processes = [],
      temporaryProcesses = [],
    } = req.body;

    if (!Array.isArray(processes) || !Array.isArray(temporaryProcesses)) {
      return res.status(400).json({ success: false, message: "Processes and temporaryProcesses must be arrays." });
    }

    if (!rosterMonth || !employee || !date || !status) {
      return res.status(400).json({
        success: false,
        message: "Roster month, employee, date and status are required.",
      });
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(rosterMonth)) {
      return res.status(400).json({
        success: false,
        message: "Roster month must use YYYY-MM format.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(employee)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID.",
      });
    }

    if (!isValidDate(date) || date.slice(0, 7) !== rosterMonth) {
      return res.status(400).json({
        success: false,
        message: "Entry date must be valid and belong to the roster month.",
      });
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid roster entry status.",
      });
    }

    if (status === "WORKING" && processes.length + temporaryProcesses.length === 0) {
      return res.status(400).json({ success: false, message: "A working entry must have at least one permanent or temporary process." });
    }

    if (status !== "WORKING" && (processes.length > 0 || temporaryProcesses.length > 0)) {
      return res.status(400).json({
        success: false,
        message: "Non-working entries cannot have process allocations.",
      });
    }

    const roster = await Roster.findOne({
      month: rosterMonth,
    });

    if (!roster) {
      return res.status(404).json({
        success: false,
        message: "Monthly roster not found. Create the roster first.",
      });
    }

    if (roster.status === "PUBLISHED") {
      return res.status(400).json({
        success: false,
        message: "Cannot edit a published roster.",
      });
    }

    const existingEmployee = await Employee.findOne({
      _id: employee,
      active: true,
    });

    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: "Active employee not found.",
      });
    }

    // Admin can manage all employees.
    // Pod Lead can manage employees in their own pod only.
    if (!(await canAccessEmployee(req, employee))) {
      return res.status(403).json({
        success: false,
        message: "You can only manage employees in your own pod.",
      });
    }

    const processError = await validateProcesses(
      employee,
      processes
    );

    if (processError) return res.status(400).json({ success: false, message: processError });
    const temporaryError = await validateTemporaryProcesses(employee, temporaryProcesses, date, processes);
    if (temporaryError) return res.status(400).json({ success: false, message: temporaryError });

    const entry = await RosterEntry.create({
      rosterMonth,
      employee,
      date,
      status,
      processes,
      temporaryProcesses,
      isManual: true,
    });

    return res.status(201).json({
      success: true,
      message: "Roster entry created successfully.",
      data: entry,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A roster entry already exists for this employee and date.",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update a roster entry manually
export const updateRosterEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, processes, temporaryProcesses } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid roster entry ID.",
      });
    }

    const entry = await RosterEntry.findById(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Roster entry not found.",
      });
    }

    // Admin can manage all employees.
    // Pod Lead can manage employees in their own pod only.
    if (!(await canAccessEmployee(req, entry.employee))) {
      return res.status(403).json({
        success: false,
        message: "You can only manage employees in your own pod.",
      });
    }

    const roster = await Roster.findOne({
      month: entry.rosterMonth,
    });

    if (!roster) {
      return res.status(404).json({
        success: false,
        message: "Monthly roster not found.",
      });
    }

    if (roster.status === "PUBLISHED") {
      return res.status(400).json({
        success: false,
        message: "Cannot edit a published roster.",
      });
    }

    const updatedStatus = status ?? entry.status;

    const updatedProcesses = processes ?? (updatedStatus === "WORKING" ? entry.processes : []);
    const updatedTemporaryProcesses = temporaryProcesses ?? (updatedStatus === "WORKING" ? (entry.temporaryProcesses || []) : []);

    if (!validStatuses.includes(updatedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid roster entry status.",
      });
    }

    if (!Array.isArray(updatedProcesses) || !Array.isArray(updatedTemporaryProcesses)) {
      return res.status(400).json({ success: false, message: "Processes and temporaryProcesses must be arrays." });
    }

    if (
      updatedStatus === "WORKING" &&
      updatedProcesses.length + updatedTemporaryProcesses.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A working entry must have at least one assigned process.",
      });
    }

    if (
      updatedStatus !== "WORKING" &&
      (updatedProcesses.length > 0 || updatedTemporaryProcesses.length > 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Non-working entries cannot have process allocations.",
      });
    }

    const processError = await validateProcesses(
      entry.employee,
      updatedProcesses
    );

    if (processError) return res.status(400).json({ success: false, message: processError });
    const temporaryError = await validateTemporaryProcesses(entry.employee, updatedTemporaryProcesses, entry.date, updatedProcesses);
    if (temporaryError) return res.status(400).json({ success: false, message: temporaryError });

    entry.status = updatedStatus;
    entry.processes = updatedProcesses;
    entry.temporaryProcesses = updatedTemporaryProcesses;
    entry.isManual = true;

    await entry.save();

    return res.status(200).json({
      success: true,
      message: "Roster entry updated successfully.",
      data: entry,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
