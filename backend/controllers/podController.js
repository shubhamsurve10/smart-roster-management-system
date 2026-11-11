
import mongoose from "mongoose";
import Pod from "../models/Pod.js";
import Employee from "../models/Employee.js";

// Get pods
export const getPods = async (req, res) => {
  try {
    let filter = {};

    // Pod Leads can only see their own pod
    if (req.user.role === "pod_lead") {
      if (!req.user.pod) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to a pod",
        });
      }

      filter = { _id: req.user.pod };
    }

    const pods = await Pod.find(filter)
      .populate("lead", "name role")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: pods.length,
      data: pods,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create a pod
export const createPod = async (req, res) => {
  try {
    const { name } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Pod name is required",
      });
    }

    const trimmedName = name.trim();

    const existingPod = await Pod.findOne({
      name: trimmedName,
    });

    if (existingPod) {
      return res.status(409).json({
        success: false,
        message: "A pod with this name already exists",
      });
    }

    const pod = await Pod.create({
      name: trimmedName,
    });

    return res.status(201).json({
      success: true,
      message: "Pod created successfully",
      data: pod,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A pod with this name already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update pod name
export const updatePod = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pod ID",
      });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Pod name is required",
      });
    }

    const pod = await Pod.findById(id);

    if (!pod) {
      return res.status(404).json({
        success: false,
        message: "Pod not found",
      });
    }

    const trimmedName = name.trim();

    const existingPod = await Pod.findOne({
      name: trimmedName,
      _id: { $ne: id },
    });

    if (existingPod) {
      return res.status(409).json({
        success: false,
        message: "A pod with this name already exists",
      });
    }

    pod.name = trimmedName;
    await pod.save();

    return res.status(200).json({
      success: true,
      message: "Pod updated successfully",
      data: pod,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A pod with this name already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Assign or change pod lead
export const assignPodLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { employee } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pod ID",
      });
    }

    if (
      typeof employee !== "string" ||
      !mongoose.Types.ObjectId.isValid(employee)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
      });
    }

    const pod = await Pod.findById(id);

    if (!pod) {
      return res.status(404).json({
        success: false,
        message: "Pod not found",
      });
    }

    const newLead = await Employee.findOne({
      _id: employee,
      pod: id,
      active: true,
    });

    if (!newLead) {
      return res.status(404).json({
        success: false,
        message: "Active employee belonging to this pod not found",
      });
    }

    if (newLead.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "An Admin cannot be assigned as a pod lead",
      });
    }

    if (pod.lead?.toString() === employee) {
      return res.status(200).json({
        success: true,
        message: "This employee is already the pod lead",
        data: await pod.populate("lead", "name role"),
      });
    }

    if (pod.lead) {
      await Employee.findByIdAndUpdate(pod.lead, {
        role: "agent",
      });
    }

    newLead.role = "pod_lead";
    pod.lead = newLead._id;

    await newLead.save();
    await pod.save();

    return res.status(200).json({
      success: true,
      message: "Pod lead assigned successfully",
      data: await pod.populate("lead", "name role"),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Remove pod lead
export const removePodLead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pod ID",
      });
    }

    const pod = await Pod.findById(id);

    if (!pod) {
      return res.status(404).json({
        success: false,
        message: "Pod not found",
      });
    }

    if (!pod.lead) {
      return res.status(400).json({
        success: false,
        message: "This pod does not have an assigned lead",
      });
    }

    await Employee.findByIdAndUpdate(pod.lead, {
      role: "agent",
    });

    pod.lead = null;
    await pod.save();

    return res.status(200).json({
      success: true,
      message: "Pod lead removed successfully",
      data: pod,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete pod
export const deletePod = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pod ID",
      });
    }

    const pod = await Pod.findById(id);

    if (!pod) {
      return res.status(404).json({
        success: false,
        message: "Pod not found",
      });
    }

    const employeeExists = await Employee.exists({
      pod: id,
    });

    if (employeeExists) {
      return res.status(409).json({
        success: false,
        message: "Cannot delete a pod that still has employees",
      });
    }

    await Pod.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Pod deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
