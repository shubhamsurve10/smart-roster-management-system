
import mongoose from "mongoose";

const rosterEntrySchema = new mongoose.Schema(
  {
    rosterMonth: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },

    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

      status: {
      type: String,
      enum: [
        "WORKING",
        "WEEKLY_OFF",
        "HOLIDAY",
        "LEAVE",
        "COMP_OFF",
        "UNASSIGNED",
        "NON_WORKING_DAY",
        "NOT_SCHEDULED",
      ],
      required: true,
    },

    processes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Process",
      },
    ],

    isManual: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// One roster entry per employee per date
rosterEntrySchema.index(
  { rosterMonth: 1, employee: 1, date: 1 },
  { unique: true }
);

const RosterEntry = mongoose.model(
  "RosterEntry",
  rosterEntrySchema
);

export default RosterEntry;
