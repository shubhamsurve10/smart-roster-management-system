
import mongoose from "mongoose";
import Assignment from "../models/Assignment.js";
import Employee from "../models/Employee.js";
import Process from "../models/Process.js";
import RosterEntry from "../models/RosterEntry.js";

import {
  getEmployeeAvailability,
  getRequiredStaff,
} from "../services/rosterGenerationService.js";

// Get all assignments

// Get assignments based on user role
export const getAssignments = async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "pod_lead") {
      const employees = await Employee.find({
        pod: req.user.pod,
      }).select("_id");

      const employeeIds = employees.map((employee) => employee._id);

      filter.employee = { $in: employeeIds };
    } else if (req.user.role === "agent") {
      filter.employee = req.user.employee;
    }

    const assignments = await Assignment.find(filter)
      .populate("employee", "name role pod active")
      .populate({
        path: "process",
        select: "type brand calendarType minStaff",
        populate: {
          path: "brand",
          select: "name",
        },
      });

    res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// Create an assignment
export const createAssignment = async (req, res) => {
  try {
    const { employee, process, isPrimary } = req.body;

    if (!employee || !process) {
      return res.status(400).json({
        success: false,
        message: "Employee and process are required",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(employee) ||
      !mongoose.Types.ObjectId.isValid(process)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee or process ID",
      });
    }

    if (isPrimary !== undefined && typeof isPrimary !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isPrimary must be true or false",
      });
    }

    const existingEmployee = await Employee.findOne({
      _id: employee,
      active: true,
    });

    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: "Active employee not found",
      });
    }

    const existingProcess = await Process.findById(process);

    if (!existingProcess) {
      return res.status(404).json({
        success: false,
        message: "Process not found",
      });
    }

    const existingAssignment = await Assignment.findOne({
      employee,
      process,
    });

    if (existingAssignment) {
      return res.status(409).json({
        success: false,
        message: "This employee is already assigned to this process",
      });
    }

    if (isPrimary === true) {
      const existingPrimary = await Assignment.findOne({
        process,
        isPrimary: true,
      });

      if (existingPrimary) {
        return res.status(409).json({
          success: false,
          message: "This process already has a primary employee",
        });
      }
    }

    const assignment = await Assignment.create({
      employee,
      process,
      isPrimary: isPrimary ?? false,
    });

    res.status(201).json({
      success: true,
      message: "Assignment created successfully",
      data: assignment,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This assignment already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update an assignment
export const updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { employee, process, isPrimary } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignment ID",
      });
    }

    const assignment = await Assignment.findById(id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    if (
      isPrimary !== undefined &&
      typeof isPrimary !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "isPrimary must be true or false",
      });
    }

    const updatedEmployee = employee ?? assignment.employee.toString();
    const updatedProcess = process ?? assignment.process.toString();
    const updatedIsPrimary = isPrimary ?? assignment.isPrimary;

    if (
      !mongoose.Types.ObjectId.isValid(updatedEmployee) ||
      !mongoose.Types.ObjectId.isValid(updatedProcess)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee or process ID",
      });
    }

    const existingEmployee = await Employee.findOne({
      _id: updatedEmployee,
      active: true,
    });

    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: "Active employee not found",
      });
    }

    const existingProcess = await Process.findById(updatedProcess);

    if (!existingProcess) {
      return res.status(404).json({
        success: false,
        message: "Process not found",
      });
    }

    const duplicateAssignment = await Assignment.findOne({
      employee: updatedEmployee,
      process: updatedProcess,
      _id: { $ne: id },
    });

    if (duplicateAssignment) {
      return res.status(409).json({
        success: false,
        message: "This employee is already assigned to this process",
      });
    }

    if (updatedIsPrimary) {
      const existingPrimary = await Assignment.findOne({
        process: updatedProcess,
        isPrimary: true,
        _id: { $ne: id },
      });

      if (existingPrimary) {
        return res.status(409).json({
          success: false,
          message: "This process already has a primary employee",
        });
      }
    }

    assignment.employee = updatedEmployee;
    assignment.process = updatedProcess;
    assignment.isPrimary = updatedIsPrimary;

    await assignment.save();

    res.status(200).json({
      success: true,
      message: "Assignment updated successfully",
      data: assignment,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This assignment already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete an assignment
export const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignment ID",
      });
    }

    const assignment = await Assignment.findById(id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    await Assignment.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Assignment deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getStaffingRecommendations = async (req, res) => {
  try {
    const { processId, date } = req.query;

    // Validate input
    if (!mongoose.Types.ObjectId.isValid(processId)) {
      return res.status(400).json({
        message: "Invalid process ID",
      });
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        message: "Date must be in YYYY-MM-DD format",
      });
    }

    const requestedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(requestedDate.getTime()) ||
      requestedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        message: "Invalid date",
      });
    }

    const process = await Process.findById(processId);

    if (!process) {
      return res.status(404).json({
        message: "Process not found",
      });
    }

    // Find employees already assigned to this process
    const existingAssignments = await Assignment.find({
      process: processId,
    }).select("employee");

    const existingEmployeeIds = new Set(
      existingAssignments.map((item) => item.employee.toString())
    );

    // Find all active employees
    const employees = await Employee.find({
      active: true,
    }).populate("pod", "name");

    // Find employees who already have a roster entry on this date
    const dateEntries = await RosterEntry.find({ date }).select("employee status processes temporaryProcesses");
    const entryByEmployee = new Map(dateEntries.map((entry) => [entry.employee.toString(), entry]));
    const processIdsOnDate = [...new Set(dateEntries.filter((entry) => entry.status === "WORKING").flatMap((entry) => [ ...(entry.processes || []), ...(entry.temporaryProcesses || []) ].map(String)))];
    const dateProcesses = await Process.find({ _id: { $in: processIdsOnDate } }).lean();
    const processById = new Map(dateProcesses.map((item) => [String(item._id), item]));
    const workingCountByProcess = new Map();
    for (const entry of dateEntries) {
      if (entry.status !== "WORKING") continue;
      for (const pid of new Set([...(entry.processes || []), ...(entry.temporaryProcesses || [])].map(String))) {
        workingCountByProcess.set(pid, (workingCountByProcess.get(pid) || 0) + 1);
      }
    }

    const recommendations = [];

    for (const employee of employees) {
      const employeeId = employee._id.toString();

      // Do not recommend someone already assigned to this process
      if (existingEmployeeIds.has(employeeId)) {
        continue;
      }

      // A person already working can be borrowed only when every current process
      // retains its required coverage after this person is shared.
      const currentEntry = entryByEmployee.get(employeeId);
      const currentStatus = currentEntry?.status;
      if ([...(currentEntry?.processes || []), ...(currentEntry?.temporaryProcesses || [])].some((id) => String(id) === String(processId))) continue;
      if (["WEEKLY_OFF", "LEAVE", "COMP_OFF", "HOLIDAY", "NON_WORKING_DAY"].includes(currentStatus)) continue;
      if (currentStatus === "WORKING") {
        const currentProcessIds = [...new Set([...(currentEntry.processes || []), ...(currentEntry.temporaryProcesses || [])].map(String))];
        if (!currentProcessIds.length) continue;
        let hasSpareCover = true;
        for (const currentProcessId of currentProcessIds) {
          const currentProcess = processById.get(currentProcessId) || await Process.findById(currentProcessId).lean();
          if (!currentProcess) { hasSpareCover = false; break; }
          const required = await getRequiredStaff(currentProcess, date);
          const currentCount = workingCountByProcess.get(currentProcessId) || 0;
          if (currentCount <= required) { hasSpareCover = false; break; }
        }
        if (!hasSpareCover) continue;
      }

      // Check leave, fixed weekly off, and preferred weekly off
      const availability = await getEmployeeAvailability(
        employee._id,
        date
      );

      if (!availability.available) {
        continue;
      }

      // Check the employee's previous six calendar days
      const previousDates = [];

      for (let i = 1; i <= 6; i++) {
        const previousDate = new Date(requestedDate);
        previousDate.setUTCDate(previousDate.getUTCDate() - i);
        previousDates.push(previousDate.toISOString().slice(0, 10));
      }

      const previousEntries = await RosterEntry.find({
        employee: employee._id,
        date: { $in: previousDates },
      }).select("date status");

      const previousStatusByDate = new Map(
        previousEntries.map((entry) => [entry.date, entry.status])
      );

      let consecutiveWorkDays = 0;

      for (const previousDate of previousDates) {
        if (previousStatusByDate.get(previousDate) === "WORKING") {
          consecutiveWorkDays++;
        } else {
          break;
        }
      }

      // Do not allow a seventh consecutive working day
      if (consecutiveWorkDays >= 6) {
        continue;
      }

      // Count the employee's existing permanent assignments
      const assignmentCount = await Assignment.countDocuments({
        employee: employee._id,
      });

      recommendations.push({
        employee: {
          _id: employee._id,
          name: employee.name,
          pod: employee.pod?.name || null,
        },
        assignmentCount,
        consecutiveWorkDays,
        alreadyWorking: currentStatus === "WORKING",
        preferredOff: availability.preferredOff,
        // Staffing recommendations are date-specific; they never create a permanent Assignment.
        recommendedAssignmentType: "TEMPORARY",
      });
    }

    // Prefer people whose preferred off is not today, then people already
    // working only where their current processes have spare coverage. Every
    // recommendation is a date-specific temporary allocation.
    recommendations.sort((a, b) => {
      if (a.preferredOff !== b.preferredOff) return Number(a.preferredOff) - Number(b.preferredOff);
      if (a.alreadyWorking !== b.alreadyWorking) return Number(a.alreadyWorking) - Number(b.alreadyWorking);
      return b.assignmentCount - a.assignmentCount;
    });

    return res.status(200).json({
      process: {
        _id: process._id,
        type: process.type,
        minStaff: process.minStaff,
      },
      date,
      totalRecommendations: recommendations.length,
      recommendations,
    });
  } catch (error) {
    console.error("Staffing recommendation error:", error);

    return res.status(500).json({
      message: "Failed to generate staffing recommendations",
      error: error.message,
    });
  }
};