
import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    process: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Process",
      required: true,
    },

    isPrimary: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

assignmentSchema.index(
  { employee: 1, process: 1 },
  { unique: true }
);

const Assignment = mongoose.model("Assignment", assignmentSchema);

export default Assignment;
