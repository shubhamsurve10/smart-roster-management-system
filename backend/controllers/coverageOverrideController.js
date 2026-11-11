
import mongoose from "mongoose";
import CoverageOverride from "../models/CoverageOverride.js";
import Process from "../models/Process.js";

// Validate a real calendar date
const isValidDate = (date) => {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return false;
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === date
  );
};

// Check Admin permission for modifications
const isAdmin = (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({
      success: false,
      message: "Only Admin can modify coverage overrides",
    });

    return false;
  }

  return true;
};

// Get all coverage overrides
export const getCoverageOverrides = async (req, res) => {
  try {
    const overrides = await CoverageOverride.find()
      .populate({
        path: "process",
        select: "type brand minStaff",
        populate: {
          path: "brand",
          select: "name",
        },
      })
      .sort({ date: 1, weekday: 1 });

    res.status(200).json({
      success: true,
      count: overrides.length,
      data: overrides,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create a coverage override
export const createCoverageOverride = async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const { process, date, weekday, minStaff } = req.body;

    if (!process || minStaff === undefined) {
      return res.status(400).json({
        success: false,
        message: "Process and minimum staff are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(process)) {
      return res.status(400).json({
        success: false,
        message: "Invalid process ID",
      });
    }

    if (!Number.isInteger(minStaff) || minStaff < 1) {
      return res.status(400).json({
        success: false,
        message: "Minimum staff must be a positive integer",
      });
    }

    const hasDate = date !== undefined && date !== null;
    const hasWeekday = weekday !== undefined && weekday !== null;

    if (hasDate === hasWeekday) {
      return res.status(400).json({
        success: false,
        message: "Provide either a date or a weekday, not both",
      });
    }

    if (hasDate && !isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid date in YYYY-MM-DD format",
      });
    }

    if (
      hasWeekday &&
      (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    ) {
      return res.status(400).json({
        success: false,
        message: "Weekday must be an integer between 0 and 6",
      });
    }

    const existingProcess = await Process.findById(process);

    if (!existingProcess) {
      return res.status(404).json({
        success: false,
        message: "Process not found",
      });
    }

    const duplicateFilter = hasDate
      ? { process, date }
      : { process, weekday };

    const existingOverride = await CoverageOverride.findOne(
      duplicateFilter
    );

    if (existingOverride) {
      return res.status(409).json({
        success: false,
        message:
          "A coverage override already exists for this process and date or weekday",
      });
    }

    const override = await CoverageOverride.create({
      process,
      ...(hasDate ? { date } : { weekday }),
      minStaff,
    });

    res.status(201).json({
      success: true,
      message: "Coverage override created successfully",
      data: override,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A coverage override already exists for this process and date or weekday",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update a coverage override
export const updateCoverageOverride = async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const { id } = req.params;
    const { process, date, weekday, minStaff } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coverage override ID",
      });
    }

    const override = await CoverageOverride.findById(id);

    if (!override) {
      return res.status(404).json({
        success: false,
        message: "Coverage override not found",
      });
    }

    const updatedProcess = process ?? override.process.toString();
    const updatedMinStaff = minStaff ?? override.minStaff;

    if (!mongoose.Types.ObjectId.isValid(updatedProcess)) {
      return res.status(400).json({
        success: false,
        message: "Invalid process ID",
      });
    }

    if (
      !Number.isInteger(updatedMinStaff) ||
      updatedMinStaff < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Minimum staff must be a positive integer",
      });
    }

    const existingProcess = await Process.findById(updatedProcess);

    if (!existingProcess) {
      return res.status(404).json({
        success: false,
        message: "Process not found",
      });
    }

    const dateProvided = date !== undefined;
    const weekdayProvided = weekday !== undefined;

    if (dateProvided && weekdayProvided) {
      return res.status(400).json({
        success: false,
        message: "Provide either a date or a weekday, not both",
      });
    }

    let updatedDate = override.date;
    let updatedWeekday = override.weekday;

    if (dateProvided) {
      if (date === null || date === "") {
        return res.status(400).json({
          success: false,
          message: "A valid date is required",
        });
      }

      if (!isValidDate(date)) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid date in YYYY-MM-DD format",
        });
      }

      updatedDate = date;
      updatedWeekday = undefined;
    } else if (weekdayProvided) {
      if (
        !Number.isInteger(weekday) ||
        weekday < 0 ||
        weekday > 6
      ) {
        return res.status(400).json({
          success: false,
          message: "Weekday must be an integer between 0 and 6",
        });
      }

      updatedWeekday = weekday;
      updatedDate = undefined;
    }

    const duplicateFilter = {
      process: updatedProcess,
      _id: { $ne: id },
      ...(updatedDate !== undefined
        ? { date: updatedDate }
        : { weekday: updatedWeekday }),
    };

    const duplicateOverride = await CoverageOverride.findOne(
      duplicateFilter
    );

    if (duplicateOverride) {
      return res.status(409).json({
        success: false,
        message:
          "A coverage override already exists for this process and date or weekday",
      });
    }

    override.process = updatedProcess;
    override.minStaff = updatedMinStaff;
    override.date = updatedDate;
    override.weekday = updatedWeekday;

    await override.save();

    res.status(200).json({
      success: true,
      message: "Coverage override updated successfully",
      data: override,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A coverage override already exists for this process and date or weekday",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete a coverage override
export const deleteCoverageOverride = async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coverage override ID",
      });
    }

    const override = await CoverageOverride.findById(id);

    if (!override) {
      return res.status(404).json({
        success: false,
        message: "Coverage override not found",
      });
    }

    await CoverageOverride.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Coverage override deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
