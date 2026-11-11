  // Thin database wrapper around the pure roster engine (engine/rosterEngine.js).
  // Existing exports keep their names, signatures and return shapes.

  import mongoose from "mongoose";

  import Holiday from "../models/Holiday.js";
  import Employee from "../models/Employee.js";
  import WeeklyOffRule from "../models/WeeklyOffRule.js";
  import Leave from "../models/Leave.js";
  import CoverageOverride from "../models/CoverageOverride.js";
  import Assignment from "../models/Assignment.js";
  import RosterEntry from "../models/RosterEntry.js";

  import { getMonthDates as engineGetMonthDates, getWeekday } from "../engine/dates.js";
  import {
    isProcessOperating as engineIsProcessOperating,
    resolveAvailability,
    resolveRequiredStaff,
    generateRosterPlan,
    publicPlan,
    computeDayProcessCoverage,
    processLabel,
    buildContext,
  } from "../engine/rosterEngine.js";
  import { loadRosterInput } from "./loadRosterInput.js";

  // ---------------------------------------------------------------------------
  // Legacy helpers (kept for existing callers)
  // ---------------------------------------------------------------------------

  // Generate every date in a month in YYYY-MM-DD format. Throws on bad input.
  export const getMonthDates = (month) => engineGetMonthDates(month);

  // Pure check; an unsupported calendar type is treated as closed (never throws).
  export const isProcessOperating = (process, date, holidayDates) =>
    engineIsProcessOperating(process, date, holidayDates);

  // Get operating dates for a process in a month (one holiday query).
  export const getProcessOperatingDates = async (process, month) => {
    const dates = getMonthDates(month);
    const holidays = await Holiday.find({
      date: { $gte: dates[0], $lte: dates[dates.length - 1] },
    })
      .select("date")
      .lean();
    const holidayDates = new Set(holidays.map((holiday) => holiday.date));
    return dates.filter((date) => isProcessOperating(process, date, holidayDates));
  };

  // Availability of one employee on one date (three small queries).
  // Returns { available, reason, preferredOff }.
  export const getEmployeeAvailability = async (employeeId, date) => {
    const [employee, leaves, rules] = await Promise.all([
      Employee.findById(employeeId).select("_id name active preferredOffDay").lean(),
      Leave.find({ employee: employeeId, status: "APPROVED", startDate: { $lte: date }, endDate: { $gte: date } })
        .select("employee startDate endDate type status")
        .lean(),
      WeeklyOffRule.find({ employee: employeeId, weekday: getWeekday(date) }).select("employee weekday type").lean(),
    ]);

    return resolveAvailability({
      employee: employee ? { ...employee, _id: String(employee._id) } : null,
      date,
      leaves: leaves.map((leave) => ({ ...leave, employee: String(leave.employee) })),
      weeklyOffRules: rules.map((rule) => ({ ...rule, employee: String(rule.employee) })),
    });
  };

  // Required staff: date override > weekday override > minStaff; 0 when closed.
  export const getRequiredStaff = async (process, date) => {
    const [holiday, overrides] = await Promise.all([
      Holiday.findOne({ date }).select("date").lean(),
      CoverageOverride.find({ process: process._id, $or: [{ date }, { weekday: getWeekday(date) }] }).lean(),
    ]);
    return resolveRequiredStaff({
      process: { ...process, _id: String(process._id), minStaff: process.minStaff },
      date,
      coverageOverrides: overrides.map((override) => ({ ...override, process: String(override.process) })),
      holidayDates: new Set(holiday ? [holiday.date] : []),
    });
  };

  // Active employees assigned to a process, primary first.
  export const getProcessCandidates = async (processId) => {
    const assignments = await Assignment.find({ process: processId })
      .populate({ path: "employee", select: "name pod role active" })
      .sort({ isPrimary: -1, createdAt: 1 })
      .lean();

    return assignments
      .filter((assignment) => assignment.employee && assignment.employee.active)
      .map((assignment) => ({ employee: assignment.employee, isPrimary: assignment.isPrimary }));
  };

  const getCachedInput = async (date, caches = {}) => {
    const month = date.slice(0, 7);
    if (!caches.inputCache) caches.inputCache = new Map();
    if (!caches.inputCache.has(month)) {
      caches.inputCache.set(month, await loadRosterInput(month, { includeEntries: false }));
    }
    return caches.inputCache.get(month);
  };

  // Coverage of one process on one date (every available assignee counts).
  export const getDailyProcessCoverage = async (
    process,
    date,
    holidayDates, // kept for signature compatibility; holidays are loaded in batch
    caches = {},
    blockedEmployeeIds = new Set()
  ) => {
    const input = await getCachedInput(date, caches);
    return computeDayProcessCoverage(input, String(process._id), date, new Set([...blockedEmployeeIds].map(String)));
  };

  // Daily allocation plan: everyone available works all their operating processes.
  export const buildDailyAllocationPlan = async (processes, date, holidayDates, blockedEmployeeIds = new Set()) => {
    const caches = {};
    const input = await getCachedInput(date, caches);
    const ctx = buildContext({ ...input, month: date.slice(0, 7) });
    const allocations = new Map();
    const conflicts = [];
    const warnings = [];

    for (const process of processes) {
      const processId = String(process._id);
      const coverage = computeDayProcessCoverage(input, processId, date, new Set([...blockedEmployeeIds].map(String)));
      if (!coverage.operating || coverage.required <= 0) continue;

      for (const candidate of coverage.candidates) {
        const employeeId = candidate.employee._id;
        if (!allocations.has(employeeId)) allocations.set(employeeId, { employee: employeeId, status: "WORKING", processes: [] });
        const allocation = allocations.get(employeeId);
        if (!allocation.processes.includes(processId)) allocation.processes.push(processId);
        if (candidate.preferredOff) {
          warnings.push({
            type: "PREFERRED_OFF_USED",
            date,
            employee: employeeId,
            employeeName: candidate.employee.name,
            process: processId,
            processType: process.type,
            message: `${candidate.employee.name} works ${processLabel(ctx, processId)} on their preferred off day.`,
          });
        }
      }

      if (coverage.shortage > 0) {
        conflicts.push({
          type: "INSUFFICIENT_STAFF",
          date,
          process: processId,
          processType: process.type,
          required: coverage.required,
          available: coverage.available,
          shortage: coverage.shortage,
          unavailableEmployees: coverage.unavailableCandidates,
          message: `${processLabel(ctx, processId)} needs ${coverage.required} on ${date} but only ${coverage.available} available.`,
        });
      }
    }

    return { date, allocations: [...allocations.values()], conflicts, warnings };
  };

  // ---------------------------------------------------------------------------
  // Saving: transaction first, safe fallback only for standalone MongoDB
  // ---------------------------------------------------------------------------

  // True only for "this deployment does not support transactions" errors.
  // The driver may wrap the server error (e.g. "This MongoDB deployment does not
  // support retryable writes" with originalError "Transaction numbers are only
  // allowed on a replica set member or mongos"), so the wrapped errors are checked too.
  const errorChain = (error, depth = 0) =>
    error && depth < 5
      ? [
          error,
          ...errorChain(error.originalError, depth + 1),
          ...errorChain(error.errorResponse?.originalError, depth + 1),
          ...errorChain(error.cause, depth + 1),
        ]
      : [];

  export const isTransactionUnsupportedError = (error) =>
    errorChain(error).some((item) => {
      const message = String(item?.message || item?.errmsg || "");
      const illegalOperation = item?.code === 20 || item?.codeName === "IllegalOperation";
      return (
        /Transaction numbers are only allowed on a replica set member or mongos/i.test(message) ||
        /transactions are not supported/i.test(message) ||
        (illegalOperation && /transaction|retryable writes/i.test(message))
      );
    });

  const replaceWithTransaction = async (month, entries) => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await RosterEntry.deleteMany({ rosterMonth: month, isManual: false }, { session });
        if (entries.length) await RosterEntry.insertMany(entries, { session, ordered: true });
      });
    } finally {
      await session.endSession();
    }
  };

  const replaceWithoutTransaction = async (month, entries) => {
    // Keep the old generated entries in memory so they can be restored.
    const previous = await RosterEntry.find({ rosterMonth: month, isManual: false }).lean();
    await RosterEntry.deleteMany({ rosterMonth: month, isManual: false });

    try {
      if (entries.length) await RosterEntry.insertMany(entries, { ordered: true });
    } catch (insertError) {
      let restored = false;
      let restoreError = null;
      try {
        await RosterEntry.deleteMany({ rosterMonth: month, isManual: false });
        if (previous.length) await RosterEntry.insertMany(previous, { ordered: false });
        restored = true;
      } catch (error) {
        restoreError = error;
      }

      const failure = new Error(
        restored
          ? `Saving the generated roster for ${month} failed (${insertError.message}). The previous generated entries were restored; nothing was changed.`
          : `Saving the generated roster for ${month} failed (${insertError.message}) and the previous entries could not be restored (${restoreError?.message}). The roster may be incomplete: regenerate it before publishing.`
      );
      failure.cause = insertError;
      failure.restored = restored;
      throw failure;
    }
  };

  // Replace generated (non-manual) entries for a month. Manual entries are never touched.
  export const saveGeneratedEntries = async (month, entries) => {
    try {
      await replaceWithTransaction(month, entries);
      return { saveMode: "TRANSACTION" };
    } catch (error) {
      if (!isTransactionUnsupportedError(error)) {
        if (error?.code === 11000) {
          const duplicate = new Error(
            `Saving the generated roster for ${month} failed: an entry already exists for the same employee and date (probably a manual entry created during generation). Nothing was changed; generate again.`
          );
          duplicate.cause = error;
          throw duplicate;
        }
        throw error;
      }
    }

    await replaceWithoutTransaction(month, entries);
    return {
      saveMode: "NON_TRANSACTIONAL_FALLBACK",
      saveNote: "MongoDB is running without replica-set transactions; entries were replaced with a delete+insert and an in-memory backup.",
    };
  };

  // ---------------------------------------------------------------------------
  // Monthly generation
  // ---------------------------------------------------------------------------

  export const generateMonthlyRoster = async (month) => {
    getMonthDates(month); // validates the month

    const input = await loadRosterInput(month);

    if (!input.roster) {
      throw new Error("Roster not found for this month.");
    }
    if (input.roster.status !== "DRAFT") {
      throw new Error("Only draft rosters can be generated.");
    }

    const startedAt = Date.now();
    const plan = generateRosterPlan(
      { ...input, manualEntries: input.entries.filter((entry) => entry.isManual) },
      { includeViews: true }
    );
    const generationMs = Date.now() - startedAt;

    // Compute everything first, then save in one step.
    const save = await saveGeneratedEntries(month, plan.entries);
    const result = publicPlan(plan);

    return {
      month,
      totalEntries: plan.entries.length,
      totalConflicts: plan.conflicts.length,
      totalWarnings: plan.warnings.length,
      isValid: plan.isValid,
      conflicts: plan.conflicts,
      warnings: plan.warnings,
      extraWeeklyOffs: plan.extraWeeklyOffs,
      manualEntriesPreserved: plan.manualEntriesPreserved,
      summary: plan.summary,
      coverageTotals: result.views?.totals,
      fairness: result.views?.fairness,
      ...save,
      generationMs,
    };
  };


