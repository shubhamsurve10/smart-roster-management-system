
import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    pod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pod",
      default: null,
      required: false,
    },

    role: {
      type: String,
      enum: ["admin", "agent", "pod_lead"],
      default: "agent",
    },

    active: {
      type: Boolean,
      default: true,
    },

    preferredOffDay: {
      type: Number,
      min: 0,
      max: 6,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Employee = mongoose.model("Employee", employeeSchema);

export default Employee;
