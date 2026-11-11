// Read-only roster insights: leave impact (what-if), views and CSV export.
// Nothing here writes to the database.

import { analyzeLeaveImpact, validateRosterPlan, buildRosterCsv } from "../engine/rosterEngine.js";
import { loadRosterInput } from "./loadRosterInput.js";

export const analyzeMonthlyLeaveImpact = async (month, newLeave) => {
  const input = await loadRosterInput(month);
  if (!input.roster) throw new Error("Roster not found for this month.");
  return {
    rosterStatus: input.roster.status,
    ...analyzeLeaveImpact({ ...input, manualEntries: input.entries.filter((entry) => entry.isManual) }, newLeave),
  };
};

// Views built from the SAVED roster entries (company, pod, brand, process, employee).
export const getMonthlyRosterViews = async (month) => {
  const input = await loadRosterInput(month);
  if (!input.roster) throw new Error("Roster not found for this month.");
  const result = validateRosterPlan(input, { includeViews: true });
  return {
    month,
    rosterStatus: input.roster.status,
    isValid: result.isValid,
    summary: result.summary,
    ...result.views,
  };
};

export const exportMonthlyRosterCsv = async (month, { view = "employees", employeeIds = null } = {}) => {
  const input = await loadRosterInput(month);
  if (!input.roster) throw new Error("Roster not found for this month.");
  const { views } = validateRosterPlan(input, { includeViews: true });
  return buildRosterCsv(views, { view, employeeIds });
};
