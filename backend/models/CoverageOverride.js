
import mongoose from "mongoose";

const coverageOverrideSchema = new mongoose.Schema(
  {
    process: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Process",
      required: true,
    },

    date: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    weekday: {
      type: Number,
      min: 0,
      max: 6,
    },

    minStaff: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

coverageOverrideSchema.pre("validate", function () {
  const hasDate = Boolean(this.date);
  const hasWeekday = this.weekday !== undefined && this.weekday !== null;

  if (hasDate === hasWeekday) {
    this.invalidate(
      "date",
      "Provide either a date or a weekday, not both."
    );
  }
});

coverageOverrideSchema.index(
  { process: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: {
      date: { $type: "string" },
    },
  }
);

coverageOverrideSchema.index(
  { process: 1, weekday: 1 },
  {
    unique: true,
    partialFilterExpression: {
      weekday: { $type: "number" },
    },
  }
);

const CoverageOverride = mongoose.model(
  "CoverageOverride",
  coverageOverrideSchema
);

export default CoverageOverride;
