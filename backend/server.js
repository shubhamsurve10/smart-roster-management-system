
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import podRoutes from "./routes/podRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import brandRoutes from "./routes/brandRoutes.js";
import processRoutes from "./routes/processRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import weeklyOffRuleRoutes from "./routes/weeklyOffRuleRoutes.js";
import leaveRoutes from "./routes/leaveRoutes.js";
import holidayRoutes from "./routes/holidayRoutes.js";
import coverageOverrideRoutes from "./routes/coverageOverrideRoutes.js";
import rosterEntryRoutes from "./routes/rosterEntryRoutes.js";
import rosterRoutes from "./routes/rosterRoutes.js";
import authRoutes from "./routes/authRoutes.js";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Pod routes
app.use("/api/pods", podRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/processes", processRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/weekly-off-rules", weeklyOffRuleRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/coverage-overrides", coverageOverrideRoutes);
app.use("/api/roster-entries", rosterEntryRoutes);
app.use("/api/rosters", rosterRoutes);
app.use("/api/auth", authRoutes);

// Test route
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Smart Roster API is running",
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
