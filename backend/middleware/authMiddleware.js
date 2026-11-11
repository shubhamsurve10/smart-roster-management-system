
import jwt from "jsonwebtoken";
import Employee from "../models/Employee.js";

// Verify JWT and load the current user's permissions
export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch current user from database instead of trusting stale role claims
    const employee = await Employee.findById(decoded.id).select(
      "_id name email role pod active"
    );

    if (!employee || !employee.active) {
      return res.status(401).json({
        success: false,
        message: "User not found or account is inactive",
      });
    }

    req.user = {
      id: employee._id.toString(),
      name: employee.name,
      email: employee.email,
      role: employee.role,
      pod: employee.pod?.toString() || null,
      employee: employee._id.toString(),
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }
};

// Restrict access by role
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
};
