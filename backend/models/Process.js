
import mongoose from "mongoose";

const processSchema = new mongoose.Schema(
  {
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },

    type: {
      type: String,
      enum: ["CS", "ACC", "NDR", "Retention"],
      required: true,
    },

    calendarType: {
      type: String,
      enum: [
        "ALL_365",
        "EXCEPT_HOLIDAYS",
        "NO_SUN_NO_HOLIDAY",
      ],
      required: true,
    },

    minStaff: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

processSchema.index(
  { brand: 1, type: 1 },
  { unique: true }
);

const Process = mongoose.model("Process", processSchema);

export default Process;
