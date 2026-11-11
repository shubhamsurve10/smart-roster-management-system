// Thin database wrapper around the pure validation engine.

import { getMonthDates } from "../engine/dates.js";
import { validateRosterPlan } from "../engine/rosterEngine.js";
import { loadRosterInput } from "./loadRosterInput.js";

export const validateMonthlyRoster = async (month) => {
  getMonthDates(month); // validates the month

  const input = await loadRosterInput(month);

  if (!input.roster) {
    throw new Error("Roster not found for this month.");
  }

  const startedAt = Date.now();
  const result = validateRosterPlan(input, { includeViews: false });

  return {
    month,
    rosterStatus: input.roster.status,
    isValid: result.isValid,
    totalErrors: result.totalErrors,
    totalWarnings: result.totalWarnings,
    errors: result.errors,
    warnings: result.warnings,
    summary: result.summary,
    validationMs: Date.now() - startedAt,
  };
};
