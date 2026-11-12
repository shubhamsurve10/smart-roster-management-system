
import mongoose from "mongoose";
import WeeklyOffRule from "../models/WeeklyOffRule.js";
import Employee from "../models/Employee.js";

// Get weekly-off rules
export const getWeeklyOffRules = async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "agent") {
      // Agents can only view their own rules
      filter.employee = req.user.employee || req.user.id;
    }

    if (req.user.role === "pod_lead") {
      if (!req.user.pod) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to a pod",
        });
      }

      // Find employees belonging to the Pod Lead's pod
      const employees = await Employee.find({
        pod: req.user.pod,
      }).select("_id");

      filter.employee = {
        $in: employees.map((employee) => employee._id),
      };
    }

    const rules = await WeeklyOffRule.find(filter)
      .populate("employee", "name role pod")
      .sort({ weekday: 1 });

    res.status(200).json({
      success: true,
      count: rules.length,
      data: rules,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to retrieve weekly-off rules",
    });
  }
};

// Create a weekly-off rule (Admin only)
export const createWeeklyOffRule = async (req, res) => {
  try {
    const { employee, weekday, type } = req.body;

    if (!employee || weekday === undefined || !type) {
      return res.status(400).json({
        success: false,
        message: "Employee, weekday and type are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(employee)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return res.status(400).json({
        success: false,
        message: "Weekday must be an integer between 0 and 6",
      });
    }

    if (!["FIXED", "PREFERRED"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be FIXED or PREFERRED",
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

    const existingRule = await WeeklyOffRule.findOne({
      employee,
      weekday,
    });

    if (existingRule) {
      return res.status(409).json({
        success: false,
        message: "A weekly-off rule already exists for this employee and weekday",
      });
    }

    const rule = await WeeklyOffRule.create({
      employee,
      weekday,
      type,
    });

    res.status(201).json({
      success: true,
      message: "Weekly-off rule created successfully",
      data: rule,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This weekly-off rule already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update a weekly-off rule (Admin only)
export const updateWeeklyOffRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { employee, weekday, type } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid weekly-off rule ID",
      });
    }

    const rule = await WeeklyOffRule.findById(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Weekly-off rule not found",
      });
    }

    const updatedEmployee = employee ?? rule.employee.toString();
    const updatedWeekday = weekday ?? rule.weekday;
    const updatedType = type ?? rule.type;

    if (!mongoose.Types.ObjectId.isValid(updatedEmployee)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    if (
      !Number.isInteger(updatedWeekday) ||
      updatedWeekday < 0 ||
      updatedWeekday > 6
    ) {
      return res.status(400).json({
        success: false,
        message: "Weekday must be an integer between 0 and 6",
      });
    }

    if (!["FIXED", "PREFERRED"].includes(updatedType)) {
      return res.status(400).json({
        success: false,
        message: "Type must be FIXED or PREFERRED",
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

    const duplicateRule = await WeeklyOffRule.findOne({
      employee: updatedEmployee,
      weekday: updatedWeekday,
      _id: { $ne: id },
    });

    if (duplicateRule) {
      return res.status(409).json({
        success: false,
        message: "A weekly-off rule already exists for this employee and weekday",
      });
    }

    rule.employee = updatedEmployee;
    rule.weekday = updatedWeekday;
    rule.type = updatedType;

    await rule.save();

    res.status(200).json({
      success: true,
      message: "Weekly-off rule updated successfully",
      data: rule,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This weekly-off rule already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete a weekly-off rule (Admin only)
export const deleteWeeklyOffRule = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid weekly-off rule ID",
      });
    }

    const rule = await WeeklyOffRule.findById(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Weekly-off rule not found",
      });
    }

    await WeeklyOffRule.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Weekly-off rule deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
