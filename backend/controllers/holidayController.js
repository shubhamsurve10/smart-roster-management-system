
import mongoose from "mongoose";
import Holiday from "../models/Holiday.js";

// Validate a real calendar date
const isValidDate = (date) => {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === date
  );
};

// Get all holidays
export const getHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });

    res.status(200).json({
      success: true,
      count: holidays.length,
      data: holidays,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create a holiday
export const createHoliday = async (req, res) => {
  try {
    const { date, name } = req.body;

    if (!date || !name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Holiday date and name are required",
      });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid date in YYYY-MM-DD format",
      });
    }

    const existingHoliday = await Holiday.findOne({ date });

    if (existingHoliday) {
      return res.status(409).json({
        success: false,
        message: "A holiday already exists for this date",
      });
    }

    const holiday = await Holiday.create({
      date,
      name: name.trim(),
    });

    res.status(201).json({
      success: true,
      message: "Holiday created successfully",
      data: holiday,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A holiday already exists for this date",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update a holiday
export const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, name } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid holiday ID",
      });
    }

    const holiday = await Holiday.findById(id);

    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: "Holiday not found",
      });
    }

    const updatedDate = date ?? holiday.date;
    const updatedName = name ?? holiday.name;

    if (!isValidDate(updatedDate)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid date in YYYY-MM-DD format",
      });
    }

    if (typeof updatedName !== "string" || !updatedName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Holiday name is required",
      });
    }

    const duplicateHoliday = await Holiday.findOne({
      date: updatedDate,
      _id: { $ne: id },
    });

    if (duplicateHoliday) {
      return res.status(409).json({
        success: false,
        message: "A holiday already exists for this date",
      });
    }

    holiday.date = updatedDate;
    holiday.name = updatedName.trim();

    await holiday.save();

    res.status(200).json({
      success: true,
      message: "Holiday updated successfully",
      data: holiday,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A holiday already exists for this date",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete a holiday
export const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid holiday ID",
      });
    }

    const holiday = await Holiday.findById(id);

    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: "Holiday not found",
      });
    }

    await Holiday.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Holiday deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
