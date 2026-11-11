
import mongoose from "mongoose";

const weeklyOffRuleSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    weekday: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },

    type: {
      type: String,
      enum: ["FIXED", "PREFERRED"],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

weeklyOffRuleSchema.index(
  { employee: 1, weekday: 1 },
  { unique: true }
);

const WeeklyOffRule = mongoose.model(
  "WeeklyOffRule",
  weeklyOffRuleSchema
);

export default WeeklyOffRule;
