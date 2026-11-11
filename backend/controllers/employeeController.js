
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Employee from "../models/Employee.js";
import Pod from "../models/Pod.js";

// Get employees
export const getEmployees = async (req, res) => {
  try {
    let filter = {};

    // Pod Leads can only view employees in their own pod
    if (req.user.role === "pod_lead") {
      if (!req.user.pod) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to a pod",
        });
      }

      filter.pod = req.user.pod;
    }

    // Agents can only view their own employee record
    if (req.user.role === "agent") {
      filter._id = req.user.employee;
    }

    const employees = await Employee.find(filter)
      .select("-password")
      .populate("pod", "name")
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create an employee (Admin only through route middleware)
export const createEmployee = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      pod,
      role,
      preferredOffDay,
    } = req.body;

    // Validate name
    if (
      typeof name !== "string" ||
      name.trim().length < 3
    ) {
      return res.status(400).json({
        success: false,
        message: "Name must contain at least 3 characters",
      });
    }

    // Validate email
    const normalizedEmail =
      typeof email === "string"
        ? email.trim().toLowerCase()
        : "";

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    // Validate password
    if (
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    // Validate role
    const selectedRole = role || "agent";

    if (!["admin", "agent", "pod_lead"].includes(selectedRole)) {
      return res.status(400).json({
        success: false,
        message: "Role must be admin, agent or pod_lead",
      });
    }

    // Validate preferred off-day
    if (
      preferredOffDay !== undefined &&
      preferredOffDay !== null &&
      (!Number.isInteger(preferredOffDay) ||
        preferredOffDay < 0 ||
        preferredOffDay > 6)
    ) {
      return res.status(400).json({
        success: false,
        message: "Preferred off day must be between 0 and 6",
      });
    }

    // Check duplicate email
    const existingEmployee = await Employee.findOne({
      email: normalizedEmail,
    });

    if (existingEmployee) {
      return res.status(409).json({
        success: false,
        message: "An employee with this email already exists",
      });
    }

    // Validate pod when one is supplied
    let existingPod = null;

    if (pod) {
      if (!mongoose.Types.ObjectId.isValid(pod)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Pod ID",
        });
      }

      existingPod = await Pod.findById(pod);

      if (!existingPod) {
        return res.status(404).json({
          success: false,
          message: "Pod not found",
        });
      }
    }

    // Only one pod lead per pod
    if (selectedRole === "pod_lead" && existingPod.lead) {
      return res.status(409).json({
        success: false,
        message: "This pod already has a lead",
      });
    }

    // Hash password before saving
    const hashedPassword = await bcrypt.hash(password, 12);

    const employee = await Employee.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      pod: selectedRole === "admin" ? undefined : pod,
      role: selectedRole,
      preferredOffDay: preferredOffDay ?? null,
    });

    // Assign pod lead
    if (employee.role === "pod_lead") {
      existingPod.lead = employee._id;
      await existingPod.save();
    }

    const employeeData = employee.toObject();
    delete employeeData.password;

    res.status(201).json({
      success: true,
      message: "Employee created successfully",
      data: employeeData,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An employee with this email already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update employee details
export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, pod, role, preferredOffDay } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    if (
      name === undefined &&
      pod === undefined &&
      role === undefined &&
      preferredOffDay === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update",
      });
    }

    const employee = await Employee.findById(id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (!employee.active) {
      return res.status(400).json({
        success: false,
        message: "Cannot update an inactive employee",
      });
    }

    // Pod Leads can only update employees in their own pod
    if (req.user.role === "pod_lead") {
      if (!req.user.pod) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to a pod",
        });
      }

      if (employee.pod?.toString() !== req.user.pod.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only update employees in your own pod",
        });
      }

      // Pod Leads cannot change roles or move employees between pods
      if (pod !== undefined || role !== undefined) {
        return res.status(403).json({
          success: false,
          message: "You cannot change employee roles or pod assignments",
        });
      }
    }

    // Validate and update name
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 3) {
        return res.status(400).json({
          success: false,
          message: "Name must contain at least 3 characters",
        });
      }

      employee.name = name.trim();
    }

    // Pod reassignment is Admin only
    // Pod reassignment is Admin only
if (pod !== undefined) {
  // Allow an employee to have no Pod
  if (pod === "" || pod === null) {
    const currentLeadPod = await Pod.findOne({ lead: id });

    if (currentLeadPod) {
      return res.status(400).json({
        success: false,
        message: "Reassign the employee as pod lead before removing their Pod",
      });
    }

    employee.pod = null;
  } else {
    if (
      typeof pod !== "string" ||
      !mongoose.Types.ObjectId.isValid(pod)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid Pod ID",
      });
    }

    const existingPod = await Pod.findById(pod);

    if (!existingPod) {
      return res.status(404).json({
        success: false,
        message: "Pod not found",
      });
    }

    const currentLeadPod = await Pod.findOne({ lead: id });

      if (
        currentLeadPod &&
        currentLeadPod._id.toString() !== pod
      ) {
        return res.status(400).json({
          success: false,
          message: "Reassign the employee as pod lead before changing their Pod",
        });
      }

      employee.pod = pod;
    }
  }
    // Role changes are Admin only
    if (role !== undefined) {
      if (!["agent", "pod_lead", "admin"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Role must be admin, agent or pod_lead",
        });
      }

      const currentLeadPod = await Pod.findOne({ lead: id });

      if (role === "pod_lead" && !currentLeadPod) {
        return res.status(400).json({
          success: false,
          message: "Use the Pod Lead Assignment API to promote an employee",
        });
      }

      if (role === "agent" && currentLeadPod) {
        currentLeadPod.lead = null;
        await currentLeadPod.save();
      }

      employee.role = role;
    }

    if (preferredOffDay !== undefined) {
      if (
        preferredOffDay !== null &&
        (!Number.isInteger(preferredOffDay) ||
          preferredOffDay < 0 ||
          preferredOffDay > 6)
      ) {
        return res.status(400).json({
          success: false,
          message: "Preferred off day must be null or an integer between 0 and 6",
        });
      }

      employee.preferredOffDay = preferredOffDay;
    }

    await employee.save();

    const employeeData = employee.toObject();
    delete employeeData.password;

    res.status(200).json({
      success: true,
      message: "Employee updated successfully",
      data: employeeData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Soft deactivate an employee (Admin only through route middleware)
export const deactivateEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    const employee = await Employee.findById(id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (!employee.active) {
      return res.status(400).json({
        success: false,
        message: "Employee is already inactive",
      });
    }

    const podLead = await Pod.findOne({ lead: id });

    if (podLead) {
      return res.status(400).json({
        success: false,
        message: "Assign another pod lead before deactivating this employee",
      });
    }

    employee.active = false;
    await employee.save();

    const employeeData = employee.toObject();
    delete employeeData.password;

    res.status(200).json({
      success: true,
      message: "Employee deactivated successfully",
      data: employeeData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
