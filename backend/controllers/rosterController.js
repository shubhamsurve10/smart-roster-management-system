
import mongoose from "mongoose";

import Roster from "../models/Roster.js";
import RosterEntry from "../models/RosterEntry.js";

import { generateMonthlyRoster } from "../services/rosterGenerationService.js";
import { validateMonthlyRoster } from "../services/rosterValidationService.js";

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

// Only Admin can perform roster management actions
const isAdmin = (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({
      success: false,
      message: "Only Admin can perform this action.",
    });
    return false;
  }

  return true;
};

// Get all rosters
// All authenticated roles can view roster months.
// Employee-level visibility is controlled by rosterEntryController.
export const getRosters = async (req, res) => {
  try {
    const rosters = await Roster.find().sort({ month: -1 });

    return res.status(200).json({
      success: true,
      count: rosters.length,
      data: rosters,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create roster - Admin only
export const createRoster = async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const { month } = req.body;

    if (typeof month !== "string" || !monthRegex.test(month)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid month in YYYY-MM format.",
      });
    }

    const existingRoster = await Roster.findOne({ month });

    if (existingRoster) {
      return res.status(409).json({
        success: false,
        message: "Roster already exists for this month.",
      });
    }

    const roster = await Roster.create({ month });

    return res.status(201).json({
      success: true,
      message: "Roster created successfully.",
      data: roster,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update roster - Admin only
export const updateRoster = async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const { id } = req.params;
    const { month, status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid roster ID.",
      });
    }

    const roster = await Roster.findById(id);

    if (!roster) {
      return res.status(404).json({
        success: false,
        message: "Roster not found.",
      });
    }

    if (roster.status !== "DRAFT") {
      return res.status(400).json({
        success: false,
        message: "Only draft rosters can be updated.",
      });
    }

    if (month !== undefined) {
      if (typeof month !== "string" || !monthRegex.test(month)) {
        return res.status(400).json({
          success: false,
          message: "Invalid month. Use YYYY-MM.",
        });
      }

      if (month !== roster.month) {
        const existingEntries = await RosterEntry.countDocuments({
          rosterMonth: roster.month,
        });

        if (existingEntries > 0) {
          return res.status(400).json({
            success: false,
            message: "Cannot change month after roster entries exist.",
          });
        }

        const duplicate = await Roster.findOne({ month });

        if (duplicate) {
          return res.status(409).json({
            success: false,
            message: "A roster already exists for this month.",
          });
        }

        roster.month = month;
      }
    }

    if (status !== undefined && status !== "DRAFT") {
      return res.status(400).json({
        success: false,
        message: "Use the roster publish API to publish a roster.",
      });
    }

    await roster.save();

    return res.status(200).json({
      success: true,
      message: "Roster updated successfully.",
      data: roster,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete roster - Admin only
export const deleteRoster = async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid roster ID.",
      });
    }

    const roster = await Roster.findById(id);

    if (!roster) {
      return res.status(404).json({
        success: false,
        message: "Roster not found.",
      });
    }

    if (roster.status !== "DRAFT") {
      return res.status(400).json({
        success: false,
        message: "Published rosters cannot be deleted.",
      });
    }

    const existingEntries = await RosterEntry.countDocuments({
      rosterMonth: roster.month,
    });

    if (existingEntries > 0) {
      return res.status(400).json({
        success: false,
        message: "Delete roster entries before deleting the roster.",
      });
    }

    await roster.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Roster deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Generate monthly roster - Admin only
export const generateRoster = async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid roster ID.",
      });
    }

    const roster = await Roster.findById(id);

    if (!roster) {
      return res.status(404).json({
        success: false,
        message: "Roster not found.",
      });
    }

    if (roster.status !== "DRAFT") {
      return res.status(400).json({
        success: false,
        message: "Only draft rosters can be generated.",
      });
    }

    const result = await generateMonthlyRoster(roster.month);

    return res.status(200).json({
      success: true,
      message: "Monthly roster generated successfully.",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Validate monthly roster - Admin only
export const validateRoster = async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid roster ID.",
      });
    }

    const roster = await Roster.findById(id);

    if (!roster) {
      return res.status(404).json({
        success: false,
        message: "Roster not found.",
      });
    }

    const validation = await validateMonthlyRoster(roster.month);

    return res.status(200).json({
      success: true,
      message: validation.isValid
        ? "Roster validation completed successfully."
        : "Roster validation found errors.",
      data: validation,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Publish monthly roster - Admin only
export const publishRoster = async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid roster ID.",
      });
    }

    const roster = await Roster.findById(id);

    if (!roster) {
      return res.status(404).json({
        success: false,
        message: "Roster not found.",
      });
    }

    if (roster.status !== "DRAFT") {
      return res.status(400).json({
        success: false,
        message: "Only draft rosters can be published.",
      });
    }

    const validation = await validateMonthlyRoster(roster.month);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Roster cannot be published. Please fix the validation errors.",
        data: validation,
      });
    }

    const publishedRoster = await Roster.findOneAndUpdate(
      { _id: id, status: "DRAFT" },
      { $set: { status: "PUBLISHED" } },
      { new: true, runValidators: true }
    );

    if (!publishedRoster) {
      return res.status(409).json({
        success: false,
        message: "Roster status changed. Please validate again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Roster published successfully.",
      data: publishedRoster,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
