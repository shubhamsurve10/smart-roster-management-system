
import mongoose from "mongoose";

const rosterSchema = new mongoose.Schema(
  {
    month: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
      unique: true,
    },

    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED"],
      default: "DRAFT",
    },
  },
  {
    timestamps: true,
  }
);

const Roster = mongoose.model("Roster", rosterSchema);

export default Roster;
