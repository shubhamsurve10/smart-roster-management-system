
import mongoose from "mongoose";
import Process from "../models/Process.js";
import Brand from "../models/Brand.js";
import Assignment from "../models/Assignment.js";
import CoverageOverride from "../models/CoverageOverride.js";

const validTypes = ["CS", "ACC", "NDR", "Retention"];

const validCalendarTypes = [
  "ALL_365",
  "EXCEPT_HOLIDAYS",
  "NO_SUN_NO_HOLIDAY",
];

// Get all processes
export const getProcesses = async (req, res) => {
  try {
    const processes = await Process.find()
      .populate("brand", "name")
      .sort({ type: 1 });

    res.status(200).json({
      success: true,
      count: processes.length,
      data: processes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create a process
export const createProcess = async (req, res) => {
  try {
    const { brand, type, calendarType, minStaff } = req.body;

    if (!brand || !type || !calendarType) {
      return res.status(400).json({
        success: false,
        message: "Brand, process type and calendar type are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(brand)) {
      return res.status(400).json({
        success: false,
        message: "Invalid brand ID",
      });
    }

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid process type",
      });
    }

    if (!validCalendarTypes.includes(calendarType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid calendar type",
      });
    }

    if (
      minStaff !== undefined &&
      (!Number.isInteger(minStaff) || minStaff < 1)
    ) {
      return res.status(400).json({
        success: false,
        message: "Minimum staff must be a positive integer",
      });
    }

    const existingBrand = await Brand.findById(brand);

    if (!existingBrand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    const existingProcess = await Process.findOne({
      brand,
      type,
    });

    if (existingProcess) {
      return res.status(409).json({
        success: false,
        message: "This process already exists for the selected brand",
      });
    }

    const process = await Process.create({
      brand,
      type,
      calendarType,
      minStaff,
    });

    res.status(201).json({
      success: true,
      message: "Process created successfully",
      data: process,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This process already exists for the selected brand",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update a process
export const updateProcess = async (req, res) => {
  try {
    const { id } = req.params;
    const { brand, type, calendarType, minStaff } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid process ID",
      });
    }

    const process = await Process.findById(id);

    if (!process) {
      return res.status(404).json({
        success: false,
        message: "Process not found",
      });
    }

    const updatedBrand = brand ?? process.brand.toString();
    const updatedType = type ?? process.type;
    const updatedCalendarType = calendarType ?? process.calendarType;
    const updatedMinStaff = minStaff ?? process.minStaff;

    if (!mongoose.Types.ObjectId.isValid(updatedBrand)) {
      return res.status(400).json({
        success: false,
        message: "Invalid brand ID",
      });
    }

    if (!validTypes.includes(updatedType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid process type",
      });
    }

    if (!validCalendarTypes.includes(updatedCalendarType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid calendar type",
      });
    }

    if (!Number.isInteger(updatedMinStaff) || updatedMinStaff < 1) {
      return res.status(400).json({
        success: false,
        message: "Minimum staff must be a positive integer",
      });
    }

    const existingBrand = await Brand.findById(updatedBrand);

    if (!existingBrand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    const duplicateProcess = await Process.findOne({
      brand: updatedBrand,
      type: updatedType,
      _id: { $ne: id },
    });

    if (duplicateProcess) {
      return res.status(409).json({
        success: false,
        message: "This process already exists for the selected brand",
      });
    }

    process.brand = updatedBrand;
    process.type = updatedType;
    process.calendarType = updatedCalendarType;
    process.minStaff = updatedMinStaff;

    await process.save();

    res.status(200).json({
      success: true,
      message: "Process updated successfully",
      data: process,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This process already exists for the selected brand",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete a process
export const deleteProcess = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid process ID",
      });
    }

    const process = await Process.findById(id);

    if (!process) {
      return res.status(404).json({
        success: false,
        message: "Process not found",
      });
    }

    const [assignmentExists, overrideExists] = await Promise.all([
      Assignment.exists({ process: id }),
      CoverageOverride.exists({ process: id }),
    ]);

    if (assignmentExists || overrideExists) {
      return res.status(409).json({
        success: false,
        message: "Cannot delete a process that has assignments or coverage overrides",
      });
    }

    await Process.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Process deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
