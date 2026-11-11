
import mongoose from "mongoose";
import dotenv from "dotenv";

import { getEmployeeAvailability } from "./services/rosterGenerationService.js";

dotenv.config();

const runTests = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Replace this with an existing employee's MongoDB ID
    const employeeId = "6af01b9e335c4ea21cbf58c7";

    const result = await getEmployeeAvailability(
      employeeId,
      "2026-11-09"
    );

    console.log("Employee availability:", result);
  } catch (error) {
    console.error("Test failed:", error.message);
  } finally {
    await mongoose.disconnect();
  }
};

runTests();
