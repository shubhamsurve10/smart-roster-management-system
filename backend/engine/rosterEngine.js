// Pure roster engine: no mongoose, no Express, no I/O.
// Input: plain objects with string ids and "YYYY-MM-DD" dates.
// Output: plain objects. Same input always gives the same output.

import {
  getMonthDates,
  getWeekday,
  getMonthWeeks,
  isValidDate,
  addDays,
  WEEKDAY_NAMES,
} from "./dates.js";

export const CALENDAR_TYPES = ["ALL_365", "EXCEPT_HOLIDAYS", "NO_SUN_NO_HOLIDAY"];

export const ROSTER_STATUSES = [
  "WORKING",
  "WEEKLY_OFF",
  "HOLIDAY",
  "LEAVE",
  "COMP_OFF",
  "UNASSIGNED",
  "NON_WORKING_DAY",
  "NOT_SCHEDULED",
];

export const LEAVE_TYPES = ["LEAVE", "COMP_OFF"];

// Assumption: nobody should work more than 6 days in a row.
export const MAX_CONSECUTIVE_WORKING_DAYS = 6;

const REST_STATUSES = new Set(["WEEKLY_OFF", "LEAVE", "COMP_OFF", "NON_WORKING_DAY"]);

// Severity / category / stage vocabulary used on every issue.
export const SEVERITY = { ERROR: "ERROR", WARNING: "WARNING" };
export const CATEGORY = {
  MANDATORY: "MANDATORY", // client coverage or hard availability rules
  PREFERENCE: "PREFERENCE", // employee preferences / soft rules
  WELLBEING: "WELLBEING", // rest-day rules (weekly off, max consecutive days)
  DATA: "DATA", // configuration / data quality
  ROSTER_INTEGRITY: "ROSTER_INTEGRITY", // malformed roster entries
};
export const STAGE = { GENERATION: "GENERATION", VALIDATION: "VALIDATION" };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export const toId = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && value._id !== undefined && value._id !== value) {
    return toId(value._id);
  }
  return String(value);
};

const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const uniqueSorted = (values) => [...new Set(values)].sort(compareStrings);

const isNonNegativeNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const listNames = (names) => {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

/**
 * Pure calendar rule. Returns true/false, or null for an unsupported type.
 * Never throws.
 */
export const calendarOperates = (calendarType, weekday, isHoliday) => {
  switch (calendarType) {
    case "ALL_365":
      return true;
    case "EXCEPT_HOLIDAYS":
      return !isHoliday;
    case "NO_SUN_NO_HOLIDAY":
      return weekday !== 0 && !isHoliday;
    default:
      return null;
  }
};

/**
 * Pure, backwards-compatible signature: (process, date, holidayDates:Set).
 * An unsupported calendar type is treated as closed (never throws).
 */
export const isProcessOperating = (process, date, holidayDates = new Set()) => {
  const holidays = holidayDates instanceof Set ? holidayDates : new Set(holidayDates || []);
  return calendarOperates(process?.calendarType, getWeekday(date), holidays.has(date)) === true;
};

/**
 * Pure availability rule for one employee on one date.
 * Priority: inactive > approved LEAVE/COMP_OFF > FIXED weekly off > available.
 * A PREFERRED off never makes someone unavailable.
 * Returns { available, reason, preferredOff } using the legacy reason codes:
 * INACTIVE_EMPLOYEE, LEAVE, COMP_OFF, FIXED_WEEKLY_OFF, PREFERRED_OFF_DAY, AVAILABLE.
 */
export const resolveAvailability = ({ employee, date, leaves = [], weeklyOffRules = [] }) => {
  if (!employee || employee.active === false) {
    return { available: false, reason: "INACTIVE_EMPLOYEE", preferredOff: false };
  }

  const employeeId = toId(employee);
  const approved = leaves.filter(
    (leave) =>
      toId(leave.employee) === employeeId &&
      leave.status === "APPROVED" &&
      leave.startDate <= date &&
      leave.endDate >= date
  );

  if (approved.length) {
    // LEAVE wins over COMP_OFF when they overlap; unknown types count as LEAVE.
    const hasLeave = approved.some((leave) => leave.type !== "COMP_OFF");
    const reason = hasLeave ? "LEAVE" : "COMP_OFF";
    return { available: false, reason, preferredOff: false };
  }

  const weekday = getWeekday(date);
  const rules = weeklyOffRules.filter(
    (rule) => toId(rule.employee) === employeeId && Number(rule.weekday) === weekday
  );

  if (rules.some((rule) => rule.type === "FIXED")) {
    return { available: false, reason: "FIXED_WEEKLY_OFF", preferredOff: false };
  }

  const preferredOff =
    rules.some((rule) => rule.type === "PREFERRED") ||
    (rules.length === 0 && employee.preferredOffDay === weekday);

  return {
    available: true,
    reason: preferredOff ? "PREFERRED_OFF_DAY" : "AVAILABLE",
    preferredOff,
  };
};

/**
 * Pure required-staff rule: date override > weekday override > process.minStaff
 * (default 1). A closed process requires 0.
 */
export const resolveRequiredStaff = ({ process, date, coverageOverrides = [], holidayDates = new Set() }) => {
  if (!isProcessOperating(process, date, holidayDates)) return 0;

  const processId = toId(process);
  const weekday = getWeekday(date);
  const forProcess = coverageOverrides.filter((override) => toId(override.process) === processId);

  const dateOverride = forProcess.find(
    (override) => override.date === date && isNonNegativeNumber(override.minStaff)
  );
  if (dateOverride) return dateOverride.minStaff;

  const weekdayOverride = forProcess.find(
    (override) =>
      !override.date &&
      override.weekday !== null &&
      override.weekday !== undefined &&
      Number(override.weekday) === weekday &&
      isNonNegativeNumber(override.minStaff)
  );
  if (weekdayOverride) return weekdayOverride.minStaff;

  return isNonNegativeNumber(process.minStaff) ? process.minStaff : 1;
};

// ---------------------------------------------------------------------------
// Context: normalises input, indexes it, and records data-quality issues.
// ---------------------------------------------------------------------------

export const buildContext = (input = {}) => {
  const month = input.month;
  const dates = getMonthDates(month); // throws on invalid month
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const weekdays = dates.map((date) => getWeekday(date));

  const errors = [];
  const dataWarnings = [];

  const ctx = {
    month,
    dates,
    dateIndex,
    weekdays,
    errors,
    dataWarnings,
  };

  // Brands and pods ---------------------------------------------------------
  ctx.brandMap = new Map();
  for (const brand of input.brands || []) {
    const id = toId(brand);
    if (id) ctx.brandMap.set(id, { _id: id, name: brand.name || "Unnamed brand" });
  }

  ctx.podMap = new Map();
  for (const pod of input.pods || []) {
    const id = toId(pod);
    if (id) ctx.podMap.set(id, { _id: id, name: pod.name || "Unnamed pod", lead: toId(pod.lead) });
  }

  // Employees ---------------------------------------------------------------
  ctx.employeeMap = new Map();
  for (const employee of input.employees || []) {
    const id = toId(employee);
    if (!id) continue;
    const preferred = employee.preferredOffDay;
    ctx.employeeMap.set(id, {
      _id: id,
      name: employee.name || `Employee ${id}`,
      pod: toId(employee.pod),
      role: employee.role || "agent",
      active: employee.active !== false,
      preferredOffDay:
        Number.isInteger(preferred) && preferred >= 0 && preferred <= 6 ? preferred : null,
    });
  }

  ctx.activeEmployeeIds = [...ctx.employeeMap.values()]
    .filter((employee) => employee.active)
    .map((employee) => employee._id)
    .sort(compareStrings);
  ctx.activeEmployeeSet = new Set(ctx.activeEmployeeIds);

  // Consecutive-work limit includes the previous six calendar days, not just this month.
  const priorStatusByEmployeeDate = new Map();
  for (const entry of input.priorEntries || []) {
    priorStatusByEmployeeDate.set(`${toId(entry.employee)}|${entry.date}`, entry.status);
  }
  ctx.priorWorkingRun = new Map();
  ctx.priorWorkingRunStart = new Map();
  ctx.priorRestDay = new Map();
  for (const employeeId of ctx.activeEmployeeIds) {
    let count = 0;
    let cursor = addDays(dates[0], -1);
    while (count < MAX_CONSECUTIVE_WORKING_DAYS && priorStatusByEmployeeDate.get(`${employeeId}|${cursor}`) === "WORKING") {
      count += 1;
      cursor = addDays(cursor, -1);
    }
    ctx.priorWorkingRun.set(employeeId, count);
    if (count) ctx.priorWorkingRunStart.set(employeeId, addDays(dates[0], -count));
    const priorDayStatus = priorStatusByEmployeeDate.get(`${employeeId}|${addDays(dates[0], -1)}`);
    ctx.priorRestDay.set(employeeId, ["WEEKLY_OFF", "LEAVE", "COMP_OFF", "HOLIDAY", "NON_WORKING_DAY"].includes(priorDayStatus));
  }

  ctx.employeeName = (id) => ctx.employeeMap.get(id)?.name || `Unknown employee (${id})`;
  ctx.podName = (podId) => (podId ? ctx.podMap.get(podId)?.name || null : null);

  // Holidays ----------------------------------------------------------------
  ctx.holidaySet = new Set();
  ctx.holidayNames = new Map();
  for (const holiday of input.holidays || []) {
    const date = typeof holiday === "string" ? holiday : holiday?.date;
    if (!isValidDate(date)) {
      dataWarnings.push(
        dataWarning(ctx, "INVALID_HOLIDAY_DATE", {
          message: `Holiday "${holiday?.name || date}" has an invalid date (${date}) and was ignored.`,
        })
      );
      continue;
    }
    ctx.holidaySet.add(date);
    ctx.holidayNames.set(date, holiday?.name || "Holiday");
  }
  ctx.isHolidayIdx = dates.map((date) => ctx.holidaySet.has(date));

  // Processes ---------------------------------------------------------------
  ctx.processMap = new Map();
  ctx.operating = new Map(); // pid -> boolean[] per date
  ctx.openIgnoringHoliday = new Map(); // pid -> boolean[7] by weekday

  for (const process of input.processes || []) {
    const id = toId(process);
    if (!id) continue;

    const brandId = toId(process.brand);
    const supported = CALENDAR_TYPES.includes(process.calendarType);
    let minStaff = 1;

    if (process.minStaff === undefined || process.minStaff === null) {
      minStaff = 1;
    } else if (isNonNegativeNumber(process.minStaff)) {
      minStaff = process.minStaff;
    }

    const normalised = {
      _id: id,
      brand: brandId,
      type: process.type || "Process",
      calendarType: process.calendarType,
      minStaff,
      supported,
    };
    ctx.processMap.set(id, normalised);

    if (process.minStaff !== undefined && process.minStaff !== null && !isNonNegativeNumber(process.minStaff)) {
      dataWarnings.push(
        dataWarning(ctx, "INVALID_MIN_STAFF", {
          process: id,
          message: `${processLabel(ctx, id)} has an invalid minStaff (${process.minStaff}); the default of 1 was used.`,
        })
      );
    }

    if (brandId && !ctx.brandMap.has(brandId)) {
      dataWarnings.push(
        dataWarning(ctx, "PROCESS_BRAND_MISSING", {
          process: id,
          message: `${normalised.type} process ${id} points to a brand that no longer exists.`,
        })
      );
    }

    if (!supported) {
      errors.push(
        makeIssue(ctx, {
          type: "UNSUPPORTED_CALENDAR_TYPE",
          severity: SEVERITY.ERROR,
          category: CATEGORY.DATA,
          process: id,
          calendarType: process.calendarType ?? null,
          message: `${processLabel(ctx, id)} has an unsupported calendar type "${process.calendarType}". It was treated as closed for the whole month. Use ALL_365, EXCEPT_HOLIDAYS or NO_SUN_NO_HOLIDAY.`,
        })
      );
    }

    ctx.operating.set(
      id,
      dates.map((date, index) =>
        supported ? calendarOperates(process.calendarType, weekdays[index], ctx.isHolidayIdx[index]) : false
      )
    );
    ctx.openIgnoringHoliday.set(
      id,
      [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
        supported ? calendarOperates(process.calendarType, weekday, false) : false
      )
    );
  }

  ctx.processIds = [...ctx.processMap.keys()].sort((a, b) => {
    const pa = ctx.processMap.get(a);
    const pb = ctx.processMap.get(b);
    return (
      compareStrings(brandNameOf(ctx, pa.brand), brandNameOf(ctx, pb.brand)) ||
      compareStrings(pa.type, pb.type) ||
      compareStrings(a, b)
    );
  });

  ctx.processesByBrand = new Map();
  for (const pid of ctx.processIds) {
    const brandId = ctx.processMap.get(pid).brand;
    if (!ctx.processesByBrand.has(brandId)) ctx.processesByBrand.set(brandId, []);
    ctx.processesByBrand.get(brandId).push(pid);
  }

  // Assignments -------------------------------------------------------------
  const assignmentKeys = new Set();
  const processesByEmployee = new Map();
  const assigneesByProcess = new Map();
  const primaryKeys = new Set();
  ctx.inactiveAssigneesByProcess = new Map();

  for (const assignment of input.assignments || []) {
    const employeeId = toId(assignment.employee);
    const processId = toId(assignment.process);

    if (!ctx.employeeMap.has(employeeId)) {
      dataWarnings.push(
        dataWarning(ctx, "ASSIGNMENT_EMPLOYEE_MISSING", {
          process: ctx.processMap.has(processId) ? processId : null,
          message: `An assignment points to an employee that no longer exists (${employeeId}); it was ignored.`,
        })
      );
      continue;
    }
    if (!ctx.processMap.has(processId)) {
      dataWarnings.push(
        dataWarning(ctx, "ASSIGNMENT_PROCESS_MISSING", {
          employee: employeeId,
          message: `${ctx.employeeName(employeeId)} is assigned to a process that no longer exists (${processId}); the assignment was ignored.`,
        })
      );
      continue;
    }

    const key = `${employeeId}|${processId}`;
    if (assignmentKeys.has(key)) continue;
    assignmentKeys.add(key);

    if (assignment.isPrimary) primaryKeys.add(key);

    if (!ctx.activeEmployeeSet.has(employeeId)) {
      if (!ctx.inactiveAssigneesByProcess.has(processId)) ctx.inactiveAssigneesByProcess.set(processId, []);
      ctx.inactiveAssigneesByProcess.get(processId).push(employeeId);
      continue;
    }

    if (!processesByEmployee.has(employeeId)) processesByEmployee.set(employeeId, []);
    processesByEmployee.get(employeeId).push(processId);
    if (!assigneesByProcess.has(processId)) assigneesByProcess.set(processId, []);
    assigneesByProcess.get(processId).push(employeeId);
  }

  const processOrder = new Map(ctx.processIds.map((pid, index) => [pid, index]));
  for (const [employeeId, list] of processesByEmployee) {
    processesByEmployee.set(
      employeeId,
      [...new Set(list)].sort((a, b) => processOrder.get(a) - processOrder.get(b))
    );
  }
  for (const [processId, list] of assigneesByProcess) {
    assigneesByProcess.set(processId, uniqueSorted(list));
  }

  ctx.assignmentKeys = assignmentKeys; // includes inactive employees
  ctx.primaryKeys = primaryKeys;
  ctx.processesOf = (employeeId) => processesByEmployee.get(employeeId) || [];
  ctx.assigneesOf = (processId) => assigneesByProcess.get(processId) || [];
  ctx.isAssigned = (employeeId, processId) => assignmentKeys.has(`${employeeId}|${processId}`);
  ctx.brandsOf = (employeeId) =>
    uniqueSorted(ctx.processesOf(employeeId).map((pid) => ctx.processMap.get(pid).brand));

  // Weekly-off rules --------------------------------------------------------
  ctx.rulesByEmployee = new Map();
  for (const rule of input.weeklyOffRules || []) {
    const employeeId = toId(rule.employee);
    const weekday = Number(rule.weekday);

    if (!ctx.employeeMap.has(employeeId)) {
      dataWarnings.push(
        dataWarning(ctx, "WEEKLY_OFF_RULE_EMPLOYEE_MISSING", {
          message: `A weekly-off rule points to an employee that no longer exists (${employeeId}); it was ignored.`,
        })
      );
      continue;
    }
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      dataWarnings.push(
        dataWarning(ctx, "INVALID_WEEKLY_OFF_RULE", {
          employee: employeeId,
          message: `${ctx.employeeName(employeeId)} has a weekly-off rule with an invalid weekday (${rule.weekday}); it was ignored.`,
        })
      );
      continue;
    }
    if (rule.type !== "FIXED" && rule.type !== "PREFERRED") {
      dataWarnings.push(
        dataWarning(ctx, "INVALID_WEEKLY_OFF_RULE", {
          employee: employeeId,
          message: `${ctx.employeeName(employeeId)} has a weekly-off rule with an unknown type (${rule.type}); it was ignored.`,
        })
      );
      continue;
    }

    if (!ctx.rulesByEmployee.has(employeeId)) {
      ctx.rulesByEmployee.set(employeeId, { fixed: new Set(), preferred: new Set(), ruleDays: new Set() });
    }
    const rules = ctx.rulesByEmployee.get(employeeId);
    rules.ruleDays.add(weekday);
    const target = rule.type === "FIXED" ? rules.fixed : rules.preferred;
    if (target.size && !target.has(weekday)) {
      dataWarnings.push(dataWarning(ctx, rule.type === "FIXED" ? "MULTIPLE_FIXED_WEEKLY_OFF_RULES" : "MULTIPLE_PREFERRED_WEEKLY_OFF_RULES", {
        employee: employeeId,
        message: `${ctx.employeeName(employeeId)} has multiple ${rule.type.toLowerCase()} weekly-off rules. Only the most recently updated rule (${WEEKDAY_NAMES[[...target][0]]}) is used; remove the duplicate rule.`,
      }));
      continue;
    }
    target.add(weekday);
  }

  ctx.isFixedOff = (employeeId, weekday) => Boolean(ctx.rulesByEmployee.get(employeeId)?.fixed.has(weekday));
  ctx.isPreferredOff = (employeeId, weekday) => {
    const rules = ctx.rulesByEmployee.get(employeeId);
    if (rules?.fixed.has(weekday)) return false;
    if (rules?.preferred.has(weekday)) return true;
    if (rules?.ruleDays.has(weekday)) return false;
    return ctx.employeeMap.get(employeeId)?.preferredOffDay === weekday;
  };

  // Leaves (only APPROVED counts) -------------------------------------------
  ctx.leaveByKey = new Map(); // `${employeeId}|${date}` -> "LEAVE" | "COMP_OFF"
  for (const leave of input.leaves || []) {
    if (leave.status !== "APPROVED") continue;

    const employeeId = toId(leave.employee);
    if (!ctx.employeeMap.has(employeeId)) {
      dataWarnings.push(
        dataWarning(ctx, "LEAVE_EMPLOYEE_MISSING", {
          message: `An approved leave (${leave.startDate} to ${leave.endDate}) belongs to an employee that no longer exists; it was ignored.`,
        })
      );
      continue;
    }
    if (!isValidDate(leave.startDate) || !isValidDate(leave.endDate) || leave.endDate < leave.startDate) {
      dataWarnings.push(
        dataWarning(ctx, "INVALID_LEAVE_DATES", {
          employee: employeeId,
          message: `${ctx.employeeName(employeeId)} has an approved leave with invalid dates (${leave.startDate} to ${leave.endDate}); it was ignored.`,
        })
      );
      continue;
    }

    let type = leave.type;
    if (!LEAVE_TYPES.includes(type)) {
      dataWarnings.push(
        dataWarning(ctx, "UNKNOWN_LEAVE_TYPE", {
          employee: employeeId,
          message: `${ctx.employeeName(employeeId)} has an approved leave of unknown type "${leave.type}" (${leave.startDate} to ${leave.endDate}); it was treated as LEAVE.`,
        })
      );
      type = "LEAVE";
    }

    for (const date of dates) {
      if (date < leave.startDate || date > leave.endDate) continue;
      const key = `${employeeId}|${date}`;
      // Overlapping leaves: one status per day, LEAVE wins over COMP_OFF.
      if (ctx.leaveByKey.get(key) === "LEAVE") continue;
      ctx.leaveByKey.set(key, type);
    }
  }
  ctx.leaveOn = (employeeId, index) => ctx.leaveByKey.get(`${employeeId}|${dates[index]}`) || null;

  // Coverage overrides ------------------------------------------------------
  const dateOverrides = new Map();
  const weekdayOverrides = new Map();
  for (const override of input.coverageOverrides || []) {
    const processId = toId(override.process);
    const hasDate = Boolean(override.date);
    const hasWeekday = override.weekday !== null && override.weekday !== undefined && override.weekday !== "";

    if (!ctx.processMap.has(processId)) {
      dataWarnings.push(
        dataWarning(ctx, "OVERRIDE_PROCESS_MISSING", {
          date: hasDate ? override.date : null,
          message: `A coverage override points to a process that no longer exists (${processId}); it was ignored.`,
        })
      );
      continue;
    }
    if (hasDate === hasWeekday) {
      dataWarnings.push(
        dataWarning(ctx, "INVALID_COVERAGE_OVERRIDE", {
          process: processId,
          message: `A coverage override for ${processLabel(ctx, processId)} must have either a date or a weekday (not both, not neither); it was ignored.`,
        })
      );
      continue;
    }
    if (!isNonNegativeNumber(override.minStaff)) {
      dataWarnings.push(
        dataWarning(ctx, "INVALID_COVERAGE_OVERRIDE", {
          process: processId,
          date: hasDate ? override.date : null,
          message: `A coverage override for ${processLabel(ctx, processId)} has an invalid minStaff (${override.minStaff}); it was ignored.`,
        })
      );
      continue;
    }

    if (hasDate) {
      const index = dateIndex.get(override.date);
      if (!isValidDate(override.date) || index === undefined) {
        dataWarnings.push(
          dataWarning(ctx, "OVERRIDE_OUTSIDE_MONTH", {
            process: processId,
            date: override.date,
            message: `Coverage override for ${processLabel(ctx, processId)} on ${override.date} is outside ${month}; it was ignored for this roster.`,
          })
        );
        continue;
      }
      if (!ctx.operating.get(processId)[index]) {
        dataWarnings.push(
          dataWarning(ctx, "OVERRIDE_ON_CLOSED_DAY", {
            process: processId,
            date: override.date,
            message: `Coverage override (${override.minStaff}) for ${processLabel(ctx, processId)} on ${override.date} falls on a day the process is closed; it was ignored.`,
          })
        );
        continue;
      }
      const key = `${processId}|${override.date}`;
      if (dateOverrides.has(key)) {
        dataWarnings.push(
          dataWarning(ctx, "DUPLICATE_COVERAGE_OVERRIDE", {
            process: processId,
            date: override.date,
            message: `${processLabel(ctx, processId)} has more than one override for ${override.date}; the first one was used.`,
          })
        );
        continue;
      }
      dateOverrides.set(key, override.minStaff);
    } else {
      const weekday = Number(override.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        dataWarnings.push(
          dataWarning(ctx, "INVALID_COVERAGE_OVERRIDE", {
            process: processId,
            message: `A coverage override for ${processLabel(ctx, processId)} has an invalid weekday (${override.weekday}); it was ignored.`,
          })
        );
        continue;
      }
      if (!ctx.openIgnoringHoliday.get(processId)[weekday]) {
        dataWarnings.push(
          dataWarning(ctx, "OVERRIDE_ON_CLOSED_DAY", {
            process: processId,
            message: `Weekday override (${override.minStaff} on ${WEEKDAY_NAMES[weekday]}s) for ${processLabel(ctx, processId)} falls on a day the process never operates; it was ignored.`,
          })
        );
        continue;
      }
      const key = `${processId}|${weekday}`;
      if (weekdayOverrides.has(key)) {
        dataWarnings.push(
          dataWarning(ctx, "DUPLICATE_COVERAGE_OVERRIDE", {
            process: processId,
            message: `${processLabel(ctx, processId)} has more than one override for ${WEEKDAY_NAMES[weekday]}; the first one was used.`,
          })
        );
        continue;
      }
      weekdayOverrides.set(key, override.minStaff);
    }
  }

  // required[pid][index], precomputed once.
  ctx.required = new Map();
  for (const pid of ctx.processIds) {
    const process = ctx.processMap.get(pid);
    const open = ctx.operating.get(pid);
    ctx.required.set(
      pid,
      dates.map((date, index) => {
        if (!open[index]) return 0;
        const byDate = dateOverrides.get(`${pid}|${date}`);
        if (byDate !== undefined) return byDate;
        const byWeekday = weekdayOverrides.get(`${pid}|${weekdays[index]}`);
        if (byWeekday !== undefined) return byWeekday;
        return process.minStaff;
      })
    );
  }

  ctx.fullWeeks = getMonthWeeks(month).filter((week) => week.isFull);
  ctx.weeks = getMonthWeeks(month);

  return ctx;
};

// ---------------------------------------------------------------------------
// Issue factories
// ---------------------------------------------------------------------------

const brandNameOf = (ctx, brandId) => (brandId ? ctx.brandMap.get(brandId)?.name || "Unknown brand" : "Unknown brand");

export const processLabel = (ctx, processId) => {
  const process = ctx.processMap.get(processId);
  if (!process) return `Unknown process (${processId})`;
  return `${process.type} (${brandNameOf(ctx, process.brand)})`;
};

function makeIssue(ctx, { type, severity, category, stage = null, date = null, process = null, employee = null, message, ...rest }) {
  const processDoc = process ? ctx.processMap.get(process) : null;
  return {
    type,
    severity,
    category,
    stage,
    date,
    process: process || null,
    processType: processDoc?.type ?? null,
    brand: processDoc?.brand ?? null,
    brandName: processDoc ? brandNameOf(ctx, processDoc.brand) : null,
    employee: employee || null,
    employeeName: employee ? ctx.employeeName(employee) : null,
    message,
    ...rest,
  };
}

function dataWarning(ctx, code, fields) {
  return makeIssue(ctx, {
    type: "DATA_WARNING",
    severity: SEVERITY.WARNING,
    category: CATEGORY.DATA,
    code,
    ...fields,
  });
}

const withStage = (issues, stage) => issues.map((issue) => ({ ...issue, stage }));

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------
// grid: Map<employeeId, cell[]>, one cell per date index.
// cell = { status, processes: string[] (counted processes), locked, source,
//          rawProcesses?: string[] }
// source: MANUAL | LEAVE | FIXED | RULE | GENERATED | REPAIR | SAVED | MISSING

const isWorking = (cell) => cell?.status === "WORKING";

const buildCoverageCounts = (ctx, grid) => {
  const counts = new Map(ctx.processIds.map((pid) => [pid, new Array(ctx.dates.length).fill(0)]));
  for (const cells of grid.values()) {
    cells.forEach((cell, index) => {
      if (!isWorking(cell)) return;
      for (const pid of cell.processes) {
        const row = counts.get(pid);
        if (row) row[index] += 1;
      }
    });
  }
  return counts;
};

// Would the employee's processes stay covered without them on this day?
const removalShortage = (ctx, counts, cell, index) => {
  let shortage = 0;
  const blocking = [];
  let minSpare = Infinity;
  for (const pid of cell.processes) {
    const required = ctx.required.get(pid)?.[index] ?? 0;
    const remaining = (counts.get(pid)?.[index] ?? 0) - 1;
    const spare = remaining - required;
    if (spare < minSpare) minSpare = spare;
    if (spare < 0) {
      shortage += -spare;
      blocking.push(pid);
    }
  }
  return { shortage, blocking, minSpare: minSpare === Infinity ? 99 : minSpare };
};

// Is a HOLIDAY a real rest day for this employee? Only when their processes
// would be closed on that weekday anyway (e.g. Sunday for NO_SUN_NO_HOLIDAY).
const holidayIsRest = (ctx, employeeId, index) => {
  const processes = ctx.processesOf(employeeId);
  if (!processes.length) return false;
  const weekday = ctx.weekdays[index];
  return processes.every((pid) => !ctx.openIgnoringHoliday.get(pid)[weekday]);
};

const isRestDay = (ctx, employeeId, cell, index) => {
  if (!cell) return false;
  if (REST_STATUSES.has(cell.status)) return true;
  if (cell.status === "HOLIDAY") return holidayIsRest(ctx, employeeId, index);
  return false;
};

const runLengthBefore = (cells, index) => {
  let count = 0;
  for (let i = index - 1; i >= 0 && isWorking(cells[i]); i -= 1) count += 1;
  return count;
};

const runLengthAfter = (cells, index) => {
  let count = 0;
  for (let i = index + 1; i < cells.length && isWorking(cells[i]); i += 1) count += 1;
  return count;
};

export const findWorkingRuns = (cells, minLength = MAX_CONSECUTIVE_WORKING_DAYS + 1) => {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= cells.length; i += 1) {
    if (i < cells.length && isWorking(cells[i])) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start >= minLength) runs.push({ start, end: i - 1, length: i - start });
      start = -1;
    }
  }
  return runs;
};

// ---------------------------------------------------------------------------
// Manual entries
// ---------------------------------------------------------------------------

const indexManualEntries = (ctx, manualEntries) => {
  const manual = new Map(); // `${employeeId}|${date}` -> entry
  for (const entry of manualEntries) {
    const employeeId = toId(entry.employee);
    const date = entry.date;

    if (!ctx.employeeMap.has(employeeId)) {
      ctx.dataWarnings.push(
        dataWarning(ctx, "MANUAL_ENTRY_EMPLOYEE_MISSING", {
          date,
          message: `A manual roster entry on ${date} belongs to an employee that no longer exists; it was kept but ignored for scheduling.`,
        })
      );
      continue;
    }
    if (!ctx.activeEmployeeSet.has(employeeId)) {
      ctx.dataWarnings.push(
        dataWarning(ctx, "MANUAL_ENTRY_INACTIVE_EMPLOYEE", {
          date,
          employee: employeeId,
          message: `${ctx.employeeName(employeeId)} is inactive but has a manual entry on ${date}; it was kept but not counted.`,
        })
      );
      continue;
    }
    if (!ctx.dateIndex.has(date)) {
      ctx.dataWarnings.push(
        dataWarning(ctx, "MANUAL_ENTRY_OUTSIDE_MONTH", {
          date,
          employee: employeeId,
          message: `${ctx.employeeName(employeeId)} has a manual entry dated ${date}, outside ${ctx.month}; it was ignored.`,
        })
      );
      continue;
    }
    const key = `${employeeId}|${date}`;
    if (manual.has(key)) {
      ctx.dataWarnings.push(
        dataWarning(ctx, "DUPLICATE_MANUAL_ENTRY", {
          date,
          employee: employeeId,
          message: `${ctx.employeeName(employeeId)} has more than one manual entry on ${date}; only the first was used.`,
        })
      );
      continue;
    }
    manual.set(key, entry);
  }
  return manual;
};

// Which processes of a manual WORKING entry may count towards coverage.
const countableManualProcesses = (ctx, employeeId, entry, index, reportStage) => {
  const date = ctx.dates[index];
  const permanentRaw = (entry.processes || []).map(toId).filter(Boolean);
  const temporaryRaw = (entry.temporaryProcesses || []).map(toId).filter(Boolean);
  const raw = uniqueSorted([...permanentRaw, ...temporaryRaw]);
  const temporarySet = new Set(temporaryRaw);
  const unavailable =
    ctx.leaveOn(employeeId, index) || (ctx.isFixedOff(employeeId, ctx.weekdays[index]) ? "FIXED_WEEKLY_OFF" : null);
  const counted = [];

  for (const pid of raw) {
    let problem = null;
    if (!ctx.processMap.has(pid)) problem = "points to a process that no longer exists";
    else if (!ctx.isAssigned(employeeId, pid) && !temporarySet.has(pid)) problem = `includes ${processLabel(ctx, pid)}, which is neither permanently assigned nor explicitly temporarily allocated`;
    else if (!ctx.operating.get(pid)[index]) problem = `includes ${processLabel(ctx, pid)}, which is closed that day`;
    else if (unavailable) problem = `marks them working although they are on ${unavailable}`;

    if (problem) {
      if (reportStage === STAGE.GENERATION) {
        ctx.dataWarnings.push(
          dataWarning(ctx, "MANUAL_ENTRY_NOT_COUNTED", {
            date,
            employee: employeeId,
            process: ctx.processMap.has(pid) ? pid : null,
            message: `Manual entry for ${ctx.employeeName(employeeId)} on ${date} ${problem}; it was kept but not counted towards coverage.`,
          })
        );
      }
      continue;
    }
    counted.push(pid);
  }
  return { raw, counted };
};

// ---------------------------------------------------------------------------
// Initial grid (per-day status rules 1-7)
// ---------------------------------------------------------------------------

const buildInitialGrid = (ctx, manual) => {
  const grid = new Map();

  for (const employeeId of ctx.activeEmployeeIds) {
    const assigned = ctx.processesOf(employeeId);
    const cells = ctx.dates.map((date, index) => {
      // 1. Manual entries are locked and kept exactly as they are.
      const manualEntry = manual.get(`${employeeId}|${date}`);
      if (manualEntry) {
        const status = ROSTER_STATUSES.includes(manualEntry.status) ? manualEntry.status : "INVALID";
        if (status === "INVALID") {
          ctx.dataWarnings.push(
            dataWarning(ctx, "MANUAL_ENTRY_INVALID_STATUS", {
              date,
              employee: employeeId,
              message: `Manual entry for ${ctx.employeeName(employeeId)} on ${date} has an unknown status "${manualEntry.status}"; it was kept but treated as not working.`,
            })
          );
        }
        const { raw, counted } =
          status === "WORKING"
            ? countableManualProcesses(ctx, employeeId, manualEntry, index, STAGE.GENERATION)
            : { raw: [], counted: [] };
        return { status, processes: counted, rawProcesses: raw, locked: true, source: "MANUAL" };
      }

      // 2. Approved leave / comp-off beats weekly off and holiday.
      const leave = ctx.leaveOn(employeeId, index);
      if (leave) return { status: leave, processes: [], locked: false, source: "LEAVE" };

      // 3. FIXED weekly off (only for employees who have assignments).
      if (assigned.length && ctx.isFixedOff(employeeId, ctx.weekdays[index])) {
        return { status: "WEEKLY_OFF", processes: [], locked: false, source: "FIXED" };
      }

      // 4. Work every assigned process that operates today.
      const open = assigned.filter((pid) => ctx.operating.get(pid)[index]);
      if (open.length) return { status: "WORKING", processes: open, locked: false, source: "RULE" };

      // 5. Company holiday.
      if (ctx.isHolidayIdx[index]) return { status: "HOLIDAY", processes: [], locked: false, source: "RULE" };

      // 6. No assignments at all.
      if (!assigned.length) return { status: "UNASSIGNED", processes: [], locked: false, source: "RULE" };

      // 7. All their processes are closed today.
      return { status: "NON_WORKING_DAY", processes: [], locked: false, source: "RULE" };
    });
    grid.set(employeeId, cells);
  }

  return grid;
};

// ---------------------------------------------------------------------------
// Replacement suggestions
// ---------------------------------------------------------------------------

const TIER_LABELS = {
  1: "Assigned to this process (swap their weekly off)",
  2: "Works another process of the same brand",
  3: "Same pod",
  4: "Available elsewhere",
};

export const suggestReplacements = (ctx, grid, counts, processId, index, { exclude = new Set(), limit = 5 } = {}) => {
  const process = ctx.processMap.get(processId);
  if (!process) return [];

  const date = ctx.dates[index];
  const weekday = ctx.weekdays[index];
  const assignees = new Set(ctx.assigneesOf(processId));
  const brandProcesses = new Set((ctx.processesByBrand.get(process.brand) || []).filter((pid) => pid !== processId));
  const pods = new Set(
    [...assignees, ...(ctx.inactiveAssigneesByProcess.get(processId) || [])]
      .map((id) => ctx.employeeMap.get(id)?.pod)
      .filter(Boolean)
  );
  const label = processLabel(ctx, processId);
  const candidates = [];

  for (const employeeId of ctx.activeEmployeeIds) {
    if (exclude.has(employeeId)) continue;
    const cells = grid.get(employeeId);
    const cell = cells?.[index];
    if (!cell) continue;

    // Never suggest someone on leave, comp-off or a FIXED off.
    if (ctx.leaveOn(employeeId, index) || cell.status === "LEAVE" || cell.status === "COMP_OFF") continue;
    if (ctx.isFixedOff(employeeId, weekday)) continue;
    if (!["WORKING", "WEEKLY_OFF", "UNASSIGNED", "NON_WORKING_DAY"].includes(cell.status)) continue;
    if (cell.locked && cell.status !== "WORKING") continue; // respect manual decisions
    if (isWorking(cell) && cell.processes.includes(processId)) continue; // already covering

    // A working candidate is only useful if their own processes keep cover.
    if (isWorking(cell) && removalShortage(ctx, counts, cell, index).shortage > 0) continue;

    const employee = ctx.employeeMap.get(employeeId);
    const isAssignee = assignees.has(employeeId);
    const sameBrand = ctx.processesOf(employeeId).some((pid) => brandProcesses.has(pid));
    let tier = 4;
    if (isAssignee) tier = 1;
    else if (sameBrand) tier = 2;
    else if (employee.pod && pods.has(employee.pod)) tier = 3;

    const wouldExceedMaxConsecutive =
      !isWorking(cell) && runLengthBefore(cells, index) + runLengthAfter(cells, index) + 1 > MAX_CONSECUTIVE_WORKING_DAYS;

    let action;
    let message;
    const name = employee.name;
    if (isAssignee && cell.status === "WEEKLY_OFF") {
      action = "SWAP_WEEKLY_OFF";
      message = `Move ${name}'s weekly off on ${date} to another day in the week; they are already assigned to ${label}.`;
    } else if (isAssignee) {
      action = "ADD_PROCESS_FOR_DAY";
      message = `${name} is assigned to ${label}; add it to their entry on ${date}.`;
    } else {
      action = "CREATE_ASSIGNMENT";
      const where = isWorking(cell)
        ? `currently on ${listNames(cell.processes.map((pid) => processLabel(ctx, pid)))} with spare cover`
        : `free on ${date} (${cell.status})`;
      message = `${name} is ${where}. Create an assignment for ${label} to authorise the cover.`;
    }
    if (wouldExceedMaxConsecutive) message += ` Note: this would exceed ${MAX_CONSECUTIVE_WORKING_DAYS} consecutive working days.`;

    candidates.push({
      employee: employeeId,
      employeeName: name,
      pod: employee.pod,
      podName: ctx.podName(employee.pod),
      currentStatus: cell.status,
      tier,
      tierLabel: TIER_LABELS[tier],
      action,
      requiresNewAssignment: !isAssignee,
      wouldExceedMaxConsecutive,
      message,
    });
  }

  candidates.sort(
    (a, b) =>
      a.tier - b.tier ||
      Number(a.currentStatus === "WORKING") - Number(b.currentStatus === "WORKING") ||
      Number(a.wouldExceedMaxConsecutive) - Number(b.wouldExceedMaxConsecutive) ||
      compareStrings(a.employee, b.employee)
  );

  return candidates.slice(0, limit);
};

// ---------------------------------------------------------------------------
// Weekly-off allocation
// ---------------------------------------------------------------------------

const allocateWeeklyOffs = (ctx, grid, counts, issues) => {
  const sharesBrand = new Map(); // employeeId -> Set of colleagues sharing a brand
  for (const employeeId of ctx.activeEmployeeIds) {
    const brands = new Set(ctx.brandsOf(employeeId));
    const colleagues = new Set();
    for (const other of ctx.activeEmployeeIds) {
      if (other !== employeeId && ctx.brandsOf(other).some((brand) => brands.has(brand))) colleagues.add(other);
    }
    sharesBrand.set(employeeId, colleagues);
  }

  const lastFullWeekIndex = ctx.fullWeeks.length ? ctx.fullWeeks[ctx.fullWeeks.length - 1].index : -1;

  for (const week of ctx.fullWeeks) {
    const indices = week.dates.map((date) => ctx.dateIndex.get(date));
    const hasLaterFullWeek = week.index < lastFullWeekIndex;

    let needing = ctx.activeEmployeeIds.filter((employeeId) => {
      if (!ctx.processesOf(employeeId).length) return false;
      const cells = grid.get(employeeId);
      return !indices.some((index) => isRestDay(ctx, employeeId, cells[index], index));
    });

    const validDaysFor = (employeeId) => {
      const cells = grid.get(employeeId);
      return indices.filter(
        (index) =>
          isWorking(cells[index]) &&
          !cells[index].locked &&
          removalShortage(ctx, counts, cells[index], index).shortage === 0
      );
    };

    while (needing.length) {
      // Most-constrained employee first (fewest valid days, ties by id).
      let chosen = null;
      let chosenDays = null;
      for (const employeeId of needing) {
        const days = validDaysFor(employeeId);
        if (
          chosen === null ||
          days.length < chosenDays.length ||
          (days.length === chosenDays.length && employeeId < chosen)
        ) {
          chosen = employeeId;
          chosenDays = days;
        }
      }
      needing = needing.filter((employeeId) => employeeId !== chosen);
      const cells = grid.get(chosen);

      if (!chosenDays.length) {
        issues.push(weeklyOffNotPossible(ctx, grid, counts, chosen, week, indices));
        continue;
      }

      const score = (index) => {
        const left = runLengthBefore(cells, index);
        const right = runLengthAfter(cells, index);
        const runPenalty =
          Math.max(0, left - MAX_CONSECUTIVE_WORKING_DAYS) +
          (hasLaterFullWeek ? 0 : Math.max(0, right - MAX_CONSECUTIVE_WORKING_DAYS));
        const preferred = ctx.isPreferredOff(chosen, ctx.weekdays[index]) ? 0 : 1;
        const adjacentRest = (index === 0 && ctx.priorRestDay.get(chosen)) ||
          (index > 0 && isRestDay(ctx, chosen, cells[index - 1], index - 1)) ||
          (index + 1 < cells.length && isRestDay(ctx, chosen, cells[index + 1], index + 1)) ? 1 : 0;
        const spare = removalShortage(ctx, counts, cells[index], index).minSpare;
        let colleaguesOff = 0;
        for (const other of sharesBrand.get(chosen)) {
          const otherCell = grid.get(other)[index];
          if (otherCell.status === "WEEKLY_OFF") colleaguesOff += 1;
        }
        // (a) run <= 6, (b) preferred, (c) latest, (d) spare, (e) colleagues off, (f) earliest
        return [runPenalty, adjacentRest, preferred, -index, -spare, colleaguesOff, index];
      };

      const best = chosenDays
        .map((index) => ({ index, key: score(index) }))
        .sort((a, b) => {
          for (let i = 0; i < a.key.length; i += 1) {
            if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
          }
          return 0;
        })[0].index;

      for (const pid of cells[best].processes) counts.get(pid)[best] -= 1;
      cells[best] = { status: "WEEKLY_OFF", processes: [], locked: false, source: "GENERATED", week: week.start };
    }
  }
};

function weeklyOffNotPossible(ctx, grid, counts, employeeId, week, indices) {
  const cells = grid.get(employeeId);
  const name = ctx.employeeName(employeeId);
  const candidates = indices.filter((index) => isWorking(cells[index]) && !cells[index].locked);
  const blocking = new Set();
  let least = null;

  for (const index of candidates) {
    const result = removalShortage(ctx, counts, cells[index], index);
    result.blocking.forEach((pid) => blocking.add(pid));
    const key = [result.shortage, ctx.isPreferredOff(employeeId, ctx.weekdays[index]) ? 0 : 1, -index];
    if (!least || key[0] < least.key[0] || (key[0] === least.key[0] && (key[1] < least.key[1] || (key[1] === least.key[1] && key[2] < least.key[2])))) {
      least = { index, key, result };
    }
  }

  const blockingProcesses = [...blocking].sort();
  const leastDamagingDay = least ? ctx.dates[least.index] : null;
  const replacements = least
    ? least.result.blocking.map((pid) => ({
        process: pid,
        processType: ctx.processMap.get(pid).type,
        brandName: brandNameOf(ctx, ctx.processMap.get(pid).brand),
        date: leastDamagingDay,
        suggestions: suggestReplacements(ctx, grid, counts, pid, least.index, { exclude: new Set([employeeId]) }),
      }))
    : [];

  const firstSuggestion = replacements.flatMap((r) => r.suggestions)[0];
  const reason = candidates.length
    ? `every day would leave ${listNames(blockingProcesses.map((pid) => processLabel(ctx, pid)))} below minimum staff`
    : "every working day that week is locked by a manual entry";

  return makeIssue(ctx, {
    type: "WEEKLY_OFF_NOT_POSSIBLE",
    severity: SEVERITY.WARNING,
    category: CATEGORY.WELLBEING,
    date: leastDamagingDay || week.start,
    process: blockingProcesses[0] || null,
    employee: employeeId,
    weekStart: week.start,
    weekEnd: week.end,
    blockingProcesses: blockingProcesses.map((pid) => ({ process: pid, label: processLabel(ctx, pid) })),
    leastDamagingDay,
    replacements,
    message:
      `${name} cannot get a weekly off in the week ${week.start} to ${week.end}: ${reason}, so they work all 7 days (coverage wins over weekly off).` +
      (leastDamagingDay ? ` Least damaging day to give an off: ${leastDamagingDay} (${WEEKDAY_NAMES[ctx.weekdays[least.index]]}).` : "") +
      (firstSuggestion ? ` Possible cover: ${firstSuggestion.employeeName} (${firstSuggestion.tierLabel.toLowerCase()}).` : " No eligible cover found; consider assigning a backup to this brand."),
  });
}

// Repair pass: split any run of more than 6 working days, if coverage allows.
const repairLongRuns = (ctx, grid, counts, issues, extraWeeklyOffs) => {
  for (const employeeId of ctx.activeEmployeeIds) {
    if (!ctx.processesOf(employeeId).length) continue;
    const cells = grid.get(employeeId);
    const flagged = new Set();

    for (let guard = 0; guard < ctx.dates.length * 2; guard += 1) {
      const priorCount = ctx.priorWorkingRun.get(employeeId) || 0;
      const run = findWorkingRuns(cells, 1).find((r) =>
        !flagged.has(`${r.start}|${r.end}`) &&
        r.length + (r.start === 0 ? priorCount : 0) > MAX_CONSECUTIVE_WORKING_DAYS
      );
      if (!run) break;
      const priorRun = run.start === 0 ? priorCount : 0;
      const effectiveRunLength = priorRun + run.length;
      const effectiveRunStart = priorRun ? (ctx.priorWorkingRunStart.get(employeeId) || ctx.dates[run.start]) : ctx.dates[run.start];

      const options = [];
      for (let index = run.start; index <= run.end; index += 1) {
        const cell = cells[index];
        if (cell.locked) continue;
        const result = removalShortage(ctx, counts, cell, index);
        if (result.shortage > 0) continue;
        const left = index - run.start;
const right = run.end - index;
// Prefer a day that fully fixes the run, and prefer a day outside any full week that
// already has a rest day, so an employee does not get two offs in one full week
// unless there is no other way to keep the run at 6 days or fewer.
const fixesRun = Math.max(left, right) <= MAX_CONSECUTIVE_WORKING_DAYS ? 0 : 1;
const week = ctx.weeks.find((w) => w.dates.includes(ctx.dates[index]));
const weekIndices = week ? week.dates.map((d) => ctx.dateIndex.get(d)) : [];
const doublesFullWeek =
  week && week.isFull && weekIndices.some((i) => i !== index && isRestDay(ctx, employeeId, cells[i], i)) ? 1 : 0;
const adjacentRest =
  (index === 0 && ctx.priorRestDay.get(employeeId)) ||
  (index > 0 && isRestDay(ctx, employeeId, cells[index - 1], index - 1)) ||
  (index + 1 < cells.length && isRestDay(ctx, employeeId, cells[index + 1], index + 1)) ? 1 : 0;
options.push({
  index,
  key: [
    fixesRun,
    doublesFullWeek,
    adjacentRest,
    Math.max(left, right),
    ctx.isPreferredOff(employeeId, ctx.weekdays[index]) ? 0 : 1,
    -result.minSpare,
    index,
  ],
});
      }

      if (!options.length) {
        flagged.add(`${run.start}|${run.end}`);
        const blocking = new Set();
        for (let index = run.start; index <= run.end; index += 1) {
          if (!cells[index].locked) removalShortage(ctx, counts, cells[index], index).blocking.forEach((pid) => blocking.add(pid));
        }
        const blockingList = [...blocking].sort();
        issues.push(
          makeIssue(ctx, {
            type: "MAX_CONSECUTIVE_DAYS_EXCEEDED",
            severity: SEVERITY.WARNING,
            category: CATEGORY.WELLBEING,
            date: ctx.dates[run.start],
            process: blockingList[0] || null,
            employee: employeeId,
            runStart: effectiveRunStart,
            runEnd: ctx.dates[run.end],
            runLength: effectiveRunLength,
            blockingProcesses: blockingList.map((pid) => ({ process: pid, label: processLabel(ctx, pid) })),
            message: `${ctx.employeeName(employeeId)} works ${effectiveRunLength} consecutive days (${effectiveRunStart} to ${ctx.dates[run.end]}), more than the maximum of ${MAX_CONSECUTIVE_WORKING_DAYS}. No day in that run can be given off without breaking coverage${blockingList.length ? ` for ${listNames(blockingList.map((pid) => processLabel(ctx, pid)))}` : " (days are locked by manual entries)"}.`,
          })
        );
        continue;
      }

      options.sort((a, b) => {
        for (let i = 0; i < a.key.length; i += 1) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
        return 0;
      });
      const index = options[0].index;
      for (const pid of cells[index].processes) counts.get(pid)[index] -= 1;
      cells[index] = { status: "WEEKLY_OFF", processes: [], locked: false, source: "REPAIR" };
      extraWeeklyOffs.push({
        employee: employeeId,
        employeeName: ctx.employeeName(employeeId),
        date: ctx.dates[index],
        reason: `Extra weekly off added to break a run of ${effectiveRunLength} consecutive working days (${effectiveRunStart} to ${ctx.dates[run.end]}).`,
      });
    }
  }
};

// ---------------------------------------------------------------------------
// Coverage / overlap detection (shared by generation and validation)
// ---------------------------------------------------------------------------

const unavailableReason = (ctx, employeeId, cell) => {
  if (!cell) return { reason: "MISSING_ENTRY" };
  if (cell.status === "WEEKLY_OFF") {
    const offType = cell.source === "FIXED" ? "FIXED" : cell.source === "MANUAL" ? "MANUAL" : "GENERATED";
    return { reason: "WEEKLY_OFF", offType };
  }
  if (cell.status === "WORKING") return { reason: "WORKING_ON_OTHER_PROCESS" };
  if (cell.status === "MISSING") return { reason: "MISSING_ENTRY" };
  return { reason: cell.status };
};

const describeUnavailable = (entry) => {
  if (entry.reason === "WEEKLY_OFF" && entry.offType === "FIXED") return `${entry.name} (WEEKLY_OFF, fixed)`;
  if (entry.reason === "WEEKLY_OFF") return `${entry.name} (WEEKLY_OFF)`;
  return `${entry.name} (${entry.reason})`;
};

export const detectCoverageIssues = (ctx, grid, counts, stage) => {
  const issues = [];
  const gapsByAbsentee = new Map(); // `${date}|${employeeId}` -> Set(brandName)

  for (const pid of ctx.processIds) {
    const process = ctx.processMap.get(pid);
    if (!process.supported) continue;
    const required = ctx.required.get(pid);
    const working = counts.get(pid);
    const assignees = ctx.assigneesOf(pid);
    const label = processLabel(ctx, pid);

    ctx.dates.forEach((date, index) => {
      if (!ctx.operating.get(pid)[index] || required[index] <= 0) return;

      if (!assignees.length) {
        const inactive = ctx.inactiveAssigneesByProcess.get(pid) || [];
        issues.push(
          makeIssue(ctx, {
            type: "NO_ASSIGNED_EMPLOYEE",
            severity: SEVERITY.ERROR,
            category: CATEGORY.MANDATORY,
            stage,
            date,
            process: pid,
            required: required[index],
            available: 0,
            shortage: required[index],
            inactiveAssignees: inactive.map((id) => ({ employee: id, name: ctx.employeeName(id) })),
            replacements: suggestReplacements(ctx, grid, counts, pid, index),
            message: `${label} needs ${required[index]} on ${date} but has no active assigned employee${inactive.length ? ` (only inactive: ${listNames(inactive.map((id) => ctx.employeeName(id)))})` : ""}. Create an assignment for this process.`,
          })
        );
        return;
      }

      if (working[index] >= required[index]) return;

      const unavailable = assignees
        .map((employeeId) => {
          const cell = grid.get(employeeId)?.[index];
          if (isWorking(cell) && cell.processes.includes(pid)) return null;
          return { employee: employeeId, name: ctx.employeeName(employeeId), ...unavailableReason(ctx, employeeId, cell) };
        })
        .filter(Boolean);

      for (const entry of unavailable) {
        const key = `${date}|${entry.employee}`;
        if (!gapsByAbsentee.has(key)) gapsByAbsentee.set(key, { reason: entry, brands: new Set(), processes: [] });
        gapsByAbsentee.get(key).brands.add(brandNameOf(ctx, process.brand));
        gapsByAbsentee.get(key).processes.push(pid);
      }

      const shortage = required[index] - working[index];
      const replacements = suggestReplacements(ctx, grid, counts, pid, index);
      issues.push(
        makeIssue(ctx, {
          type: "INSUFFICIENT_STAFF",
          severity: SEVERITY.ERROR,
          category: CATEGORY.MANDATORY,
          stage,
          date,
          process: pid,
          required: required[index],
          available: working[index],
          shortage,
          unavailableEmployees: unavailable,
          replacements,
          message:
            `${label} needs ${required[index]} on ${date} but only ${working[index]} working.` +
            (unavailable.length
              ? ` Unavailable: ${unavailable.map(describeUnavailable).join(", ")}.`
              : ` All ${assignees.length} assigned employee(s) are already working; more people must be assigned to this process.`) +
            (replacements[0] ? ` Suggested cover: ${replacements[0].employeeName}.` : ""),
        })
      );
    });
  }

  // Overlapping responsibilities: sole cover (no slack) for 2+ different brands.
  for (const employeeId of ctx.activeEmployeeIds) {
    const cells = grid.get(employeeId);
    cells.forEach((cell, index) => {
      if (!isWorking(cell) || cell.processes.length < 2) return;
      const critical = cell.processes.filter((pid) => {
        const required = ctx.required.get(pid)?.[index] ?? 0;
        return required > 0 && counts.get(pid)[index] - 1 < required;
      });
      const brands = uniqueSorted(critical.map((pid) => ctx.processMap.get(pid).brand));
      if (brands.length < 2) return;
      issues.push(
        makeIssue(ctx, {
          type: "OVERLAPPING_RESPONSIBILITIES",
          severity: SEVERITY.WARNING,
          category: CATEGORY.MANDATORY,
          stage,
          date: ctx.dates[index],
          process: critical[0],
          employee: employeeId,
          processes: critical.map((pid) => ({ process: pid, label: processLabel(ctx, pid) })),
          brands: brands.map((brand) => ({ brand, brandName: brandNameOf(ctx, brand) })),
          message: `${ctx.employeeName(employeeId)} is the only cover for ${listNames(critical.map((pid) => processLabel(ctx, pid)))} on ${ctx.dates[index]} across ${brands.length} different brands. Any absence leaves all of them uncovered.`,
        })
      );
    });
  }

  // One absence creating gaps in several brands on the same day.
  for (const [key, value] of [...gapsByAbsentee.entries()].sort((a, b) => compareStrings(a[0], b[0]))) {
    if (value.brands.size < 2) continue;
    const [date, employeeId] = key.split("|");
    const brandNames = [...value.brands].sort();
    issues.push(
      makeIssue(ctx, {
        type: "MULTI_BRAND_GAP",
        severity: SEVERITY.WARNING,
        category: CATEGORY.MANDATORY,
        stage,
        date,
        process: value.processes[0],
        employee: employeeId,
        reason: value.reason.reason,
        affectedBrands: brandNames,
        affectedProcesses: value.processes.map((pid) => ({ process: pid, label: processLabel(ctx, pid) })),
        message: `${ctx.employeeName(employeeId)}'s absence (${value.reason.reason}) on ${date} leaves ${brandNames.length} brands short: ${listNames(brandNames)}.`,
      })
    );
  }

  return issues;
};

const detectPreferredOffUsed = (ctx, grid, stage) => {
  const issues = [];
  for (const employeeId of ctx.activeEmployeeIds) {
    grid.get(employeeId).forEach((cell, index) => {
      if (!isWorking(cell) || !ctx.isPreferredOff(employeeId, ctx.weekdays[index])) return;
      issues.push(
        makeIssue(ctx, {
          type: "PREFERRED_OFF_USED",
          severity: SEVERITY.WARNING,
          category: CATEGORY.PREFERENCE,
          stage,
          date: ctx.dates[index],
          process: cell.processes[0] || null,
          employee: employeeId,
          message: `${ctx.employeeName(employeeId)} works on ${ctx.dates[index]}, their preferred off day (${WEEKDAY_NAMES[ctx.weekdays[index]]}). Preferences give way to client coverage and rest-day rules.`,
        })
      );
    });
  }
  return issues;
};

// ---------------------------------------------------------------------------
// Views and summaries (company / pod / brand / process / employee)
// ---------------------------------------------------------------------------

export const buildRosterViews = (ctx, grid, counts) => {
  const days = ctx.dates.map((date, index) => ({
    date,
    weekday: ctx.weekdays[index],
    weekdayName: WEEKDAY_NAMES[ctx.weekdays[index]],
    isHoliday: ctx.isHolidayIdx[index],
    holidayName: ctx.holidayNames.get(date) || null,
  }));

  const processes = ctx.processIds.map((pid) => {
    const process = ctx.processMap.get(pid);
    const required = ctx.required.get(pid);
    const daily = ctx.dates.map((date, index) => {
      const operating = ctx.operating.get(pid)[index];
      const workingEmployees = ctx.activeEmployeeIds.filter((employeeId) => {
        const cell = grid.get(employeeId)[index];
        return isWorking(cell) && cell.processes.includes(pid);
      });
      let status = "CLOSED";
      if (operating) {
        if (required[index] > 0 && !ctx.assigneesOf(pid).length) status = "NO_ASSIGNEE";
        else if (counts.get(pid)[index] < required[index]) status = "SHORT";
        else status = "OK";
      }
      return {
        date,
        operating,
        required: required[index],
        working: counts.get(pid)[index],
        workingEmployees: workingEmployees.map((id) => ({ employee: id, name: ctx.employeeName(id) })),
        status,
      };
    });
    return {
      process: pid,
      processType: process.type,
      brand: process.brand,
      brandName: brandNameOf(ctx, process.brand),
      calendarType: process.calendarType,
      supported: process.supported,
      defaultMinStaff: process.minStaff,
      assignees: ctx.assigneesOf(pid).map((id) => ({
        employee: id,
        name: ctx.employeeName(id),
        isPrimary: ctx.primaryKeys.has(`${id}|${pid}`),
      })),
      operatingDays: daily.filter((day) => day.operating).length,
      gapDays: daily.filter((day) => day.status === "SHORT" || day.status === "NO_ASSIGNEE").map((day) => day.date),
      days: daily,
    };
  });

  const brandIds = uniqueSorted(ctx.processIds.map((pid) => ctx.processMap.get(pid).brand).filter(Boolean)).sort((a, b) =>
    compareStrings(brandNameOf(ctx, a), brandNameOf(ctx, b))
  );
  const brands = brandIds.map((brandId) => {
    const brandProcesses = processes.filter((process) => process.brand === brandId);
    const employees = uniqueSorted(brandProcesses.flatMap((process) => process.assignees.map((a) => a.employee)));
    const gapDays = uniqueSorted(brandProcesses.flatMap((process) => process.gapDays));
    return {
      brand: brandId,
      brandName: brandNameOf(ctx, brandId),
      resourcePattern: employees.length <= 1 ? "SINGLE_RESOURCE" : "MULTI_RESOURCE",
      employees: employees.map((id) => ({ employee: id, name: ctx.employeeName(id) })),
      processes: brandProcesses.map((process) => ({
        process: process.process,
        processType: process.processType,
        calendarType: process.calendarType,
        gapDays: process.gapDays,
      })),
      gapDays,
      fullyCovered: gapDays.length === 0,
    };
  });

  const employees = ctx.activeEmployeeIds.map((employeeId) => {
    const employee = ctx.employeeMap.get(employeeId);
    const cells = grid.get(employeeId);
    const tally = {};
    let preferredGranted = 0;
    let preferredMissed = 0;
    cells.forEach((cell, index) => {
      tally[cell.status] = (tally[cell.status] || 0) + 1;
      if (ctx.isPreferredOff(employeeId, ctx.weekdays[index])) {
        if (isWorking(cell)) preferredMissed += 1;
        else preferredGranted += 1;
      }
    });
    const runs = findWorkingRuns(cells, 1);
    return {
      employee: employeeId,
      name: employee.name,
      pod: employee.pod,
      podName: ctx.podName(employee.pod),
      role: employee.role,
      brands: ctx.brandsOf(employeeId).map((brand) => brandNameOf(ctx, brand)),
      processes: ctx.processesOf(employeeId).map((pid) => processLabel(ctx, pid)),
      workingDays: tally.WORKING || 0,
      weeklyOffs: tally.WEEKLY_OFF || 0,
      generatedWeeklyOffs: cells.filter((c) => c.status === "WEEKLY_OFF" && (c.source === "GENERATED" || c.source === "REPAIR")).length,
      leaveDays: tally.LEAVE || 0,
      compOffDays: tally.COMP_OFF || 0,
      holidays: tally.HOLIDAY || 0,
      nonWorkingDays: tally.NON_WORKING_DAY || 0,
      restDays: cells.filter((cell, index) => isRestDay(ctx, employeeId, cell, index)).length,
      longestWorkingRun: runs.reduce((max, run) => Math.max(max, run.length), 0),
      preferredOffsGranted: preferredGranted,
      preferredOffsMissed: preferredMissed,
      days: cells.map((cell, index) => ({
        date: ctx.dates[index],
        status: cell.status,
        processes: cell.processes,
        isManual: cell.source === "MANUAL",
      })),
    };
  });

  const pods = [...ctx.podMap.values()]
    .sort((a, b) => compareStrings(a.name, b.name))
    .map((pod) => ({
      pod: pod._id,
      podName: pod.name,
      lead: pod.lead,
      leadName: pod.lead ? ctx.employeeName(pod.lead) : null,
      employees: employees.filter((employee) => employee.pod === pod._id).map((employee) => employee.employee),
    }));
  const unpodded = employees.filter((employee) => !employee.pod || !ctx.podMap.has(employee.pod));
  if (unpodded.length) {
    pods.push({ pod: null, podName: "No pod", lead: null, leadName: null, employees: unpodded.map((e) => e.employee) });
  }

  // Fairness of rest days among employees who share a brand with someone.
  const sharedStaff = employees.filter((employee) => {
    const brandSet = new Set(ctx.brandsOf(employee.employee));
    return brands.some((brand) => brandSet.has(brand.brand) && brand.resourcePattern === "MULTI_RESOURCE");
  });
  const restCounts = sharedStaff.map((employee) => employee.restDays);
  const fairness = {
    scope: "Employees on multi-resource brands",
    employees: sharedStaff.length,
    minRestDays: restCounts.length ? Math.min(...restCounts) : 0,
    maxRestDays: restCounts.length ? Math.max(...restCounts) : 0,
    averageRestDays: restCounts.length ? Number((restCounts.reduce((a, b) => a + b, 0) / restCounts.length).toFixed(2)) : 0,
  };

  const operatingSlots = processes.reduce((sum, process) => sum + process.days.filter((d) => d.operating && d.required > 0).length, 0);
  const gapSlots = processes.reduce((sum, process) => sum + process.gapDays.length, 0);

  return {
    days,
    processes,
    brands,
    pods,
    employees,
    fairness,
    totals: {
      employees: employees.length,
      brands: brands.length,
      processes: processes.length,
      singleResourceBrands: brands.filter((b) => b.resourcePattern === "SINGLE_RESOURCE").length,
      multiResourceBrands: brands.filter((b) => b.resourcePattern === "MULTI_RESOURCE").length,
      requiredProcessDays: operatingSlots,
      processDaysWithGaps: gapSlots,
      coveragePercent: operatingSlots ? Number((((operatingSlots - gapSlots) / operatingSlots) * 100).toFixed(1)) : 100,
    },
  };
};

const splitBySeverity = (issues) => ({
  errors: issues.filter((issue) => issue.severity === SEVERITY.ERROR),
  warnings: issues.filter((issue) => issue.severity !== SEVERITY.ERROR),
});

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Generate a monthly roster.
 * input: { month, employees, pods, brands, processes, assignments, weeklyOffRules,
 *          leaves, holidays, coverageOverrides, manualEntries | entries }
 * Returns entries to save (generated only, never over a manual entry), the
 * errors (conflicts) and warnings, extra repair offs, and views.
 */
export const generateRosterPlan = (input, { includeViews = true } = {}) => {
  const ctx = buildContext(input);
  const manualSource = input.manualEntries || (input.entries || []).filter((entry) => entry.isManual);
  const manual = indexManualEntries(ctx, manualSource);

  const grid = buildInitialGrid(ctx, manual);
  const counts = buildCoverageCounts(ctx, grid);
  const generationIssues = [];
  const extraWeeklyOffs = [];

  allocateWeeklyOffs(ctx, grid, counts, generationIssues);
  repairLongRuns(ctx, grid, counts, generationIssues, extraWeeklyOffs);

  const issues = [
    ...ctx.errors,
    ...detectCoverageIssues(ctx, grid, counts, STAGE.GENERATION),
    ...generationIssues,
    ...detectPreferredOffUsed(ctx, grid, STAGE.GENERATION),
  ];
  // Surface adjacent rest days (fixed/preferred/holiday/leave) for human review.
  for (const employeeId of ctx.activeEmployeeIds) {
    const cells = grid.get(employeeId);
    if (cells.length && ctx.priorRestDay.get(employeeId) && isRestDay(ctx, employeeId, cells[0], 0)) {
      issues.push(makeIssue(ctx, {
        type: "CONSECUTIVE_REST_DAYS",
        severity: SEVERITY.WARNING,
        category: CATEGORY.WELLBEING,
        date: ctx.dates[0],
        employee: employeeId,
        message: `${ctx.employeeName(employeeId)} has a rest day immediately before ${ctx.dates[0]} and another on ${ctx.dates[0]}. Review whether this is intentional.`,
      }));
    }
    for (let index = 1; index < cells.length; index += 1) {
      if (isRestDay(ctx, employeeId, cells[index - 1], index - 1) && isRestDay(ctx, employeeId, cells[index], index)) {
        issues.push(makeIssue(ctx, {
          type: "CONSECUTIVE_REST_DAYS",
          severity: SEVERITY.WARNING,
          category: CATEGORY.WELLBEING,
          date: ctx.dates[index],
          employee: employeeId,
          message: `${ctx.employeeName(employeeId)} has consecutive rest days on ${ctx.dates[index - 1]} and ${ctx.dates[index]}. Review whether this is intentional.`,
        }));
      }
    }
  }

  for (const employeeId of ctx.activeEmployeeIds) {
    if (ctx.processesOf(employeeId).length) continue;
    issues.push(
      makeIssue(ctx, {
        type: "UNASSIGNED_EMPLOYEE",
        severity: SEVERITY.WARNING,
        category: CATEGORY.DATA,
        employee: employeeId,
        message: `${ctx.employeeName(employeeId)} is active but has no process assignments, so they are marked UNASSIGNED for ${ctx.month}.`,
      })
    );
  }

  issues.push(...ctx.dataWarnings);
  const staged = withStage(issues, STAGE.GENERATION);
  const { errors, warnings } = splitBySeverity(staged);

  const entries = [];
  for (const employeeId of ctx.activeEmployeeIds) {
    grid.get(employeeId).forEach((cell, index) => {
      if (cell.source === "MANUAL") return;
      entries.push({
        rosterMonth: ctx.month,
        employee: employeeId,
        date: ctx.dates[index],
        status: cell.status,
        processes: cell.processes,
        isManual: false,
      });
    });
  }

  return {
    month: ctx.month,
    entries,
    manualEntriesPreserved: manual.size,
    conflicts: errors,
    warnings,
    extraWeeklyOffs,
    isValid: errors.length === 0,
    summary: summariseIssues(staged),
    views: includeViews ? buildRosterViews(ctx, grid, counts) : undefined,
    _ctx: ctx,
    _grid: grid,
    _counts: counts,
  };
};

const summariseIssues = (issues) => {
  const byType = {};
  for (const issue of issues) byType[issue.type] = (byType[issue.type] || 0) + 1;
  return {
    errors: issues.filter((issue) => issue.severity === SEVERITY.ERROR).length,
    warnings: issues.filter((issue) => issue.severity !== SEVERITY.ERROR).length,
    byType,
  };
};

/** Strip internal fields before returning a plan from an API. */
export const publicPlan = (plan) => {
  // eslint-disable-next-line no-unused-vars
  const { _ctx, _grid, _counts, ...rest } = plan;
  return rest;
};

// ---------------------------------------------------------------------------
// Validation of a saved roster
// ---------------------------------------------------------------------------

/**
 * Validate saved roster entries for a month.
 * input: same shape as generation plus `entries` (all RosterEntry rows of the month).
 * Errors block publishing; warnings never do.
 */
export const validateRosterPlan = (input, { includeViews = false } = {}) => {
  const ctx = buildContext(input);
  const issues = [...ctx.errors];
  const issue = (fields) =>
    makeIssue(ctx, { severity: SEVERITY.ERROR, category: CATEGORY.ROSTER_INTEGRITY, stage: STAGE.VALIDATION, ...fields });

  const entryMap = new Map();

  for (const entry of input.entries || []) {
    const employeeId = toId(entry.employee);
    const date = entry.date;

    if (!ctx.employeeMap.has(employeeId)) {
      issues.push(
        issue({
          type: "EMPLOYEE_NOT_FOUND",
          date,
          entry: toId(entry._id),
          message: `A roster entry on ${date} refers to an employee who no longer exists.`,
        })
      );
      continue;
    }
    const name = ctx.employeeName(employeeId);

    if ((entry.rosterMonth && entry.rosterMonth !== ctx.month) || !ctx.dateIndex.has(date)) {
      issues.push(
        issue({
          type: "ENTRY_OUTSIDE_ROSTER_MONTH",
          date,
          employee: employeeId,
          message: `${name} has a roster entry dated ${date}, which does not belong to roster month ${ctx.month}.`,
        })
      );
      continue;
    }
    if (!ctx.activeEmployeeSet.has(employeeId)) {
      issues.push(
        issue({
          type: "INACTIVE_EMPLOYEE",
          date,
          employee: employeeId,
          message: `${name} is inactive but has a roster entry on ${date}.`,
        })
      );
      continue;
    }
    const key = `${employeeId}|${date}`;
    if (entryMap.has(key)) {
      issues.push(
        issue({
          type: "DUPLICATE_ROSTER_ENTRY",
          date,
          employee: employeeId,
          message: `${name} has more than one roster entry on ${date}.`,
        })
      );
      continue;
    }
    entryMap.set(key, entry);
  }

  // Build the grid from saved entries and check each entry.
  const grid = new Map();
  for (const employeeId of ctx.activeEmployeeIds) {
    const name = ctx.employeeName(employeeId);
    const assigned = ctx.processesOf(employeeId);

    const cells = ctx.dates.map((date, index) => {
      const entry = entryMap.get(`${employeeId}|${date}`);
      if (!entry) {
        issues.push(
          issue({
            type: "MISSING_ROSTER_ENTRY",
            date,
            employee: employeeId,
            message: `${name} has no roster entry for ${date}.`,
          })
        );
        return { status: "MISSING", processes: [], locked: true, source: "MISSING" };
      }

      const source = entry.isManual ? "MANUAL" : "SAVED";
      if (!ROSTER_STATUSES.includes(entry.status)) {
        issues.push(
          issue({
            type: "INVALID_STATUS",
            date,
            employee: employeeId,
            message: `${name} has an invalid roster status "${entry.status}" on ${date}.`,
          })
        );
        return { status: "INVALID", processes: [], locked: true, source };
      }

      const weekday = ctx.weekdays[index];
      const leave = ctx.leaveOn(employeeId, index);
      const fixedOff = ctx.isFixedOff(employeeId, weekday);
      const permanentRawIds = (entry.processes || []).map(toId).filter(Boolean);
      const temporaryRawIds = (entry.temporaryProcesses || []).map(toId).filter(Boolean);
      const rawIds = [...permanentRawIds, ...temporaryRawIds];
      const temporarySet = new Set(temporaryRawIds);
      const unique = uniqueSorted(rawIds);
      const anyAssignedOpen = assigned.some((pid) => ctx.operating.get(pid)[index]);

      if (unique.length !== rawIds.length) {
        issues.push(issue({ type: "DUPLICATE_PROCESS", date, employee: employeeId, message: `${name} has the same process listed more than once on ${date}.` }));
      }
      if (temporaryRawIds.some((pid) => !ctx.processMap.has(pid))) {
        issues.push(issue({ type: "TEMPORARY_PROCESS_NOT_FOUND", date, employee: employeeId, message: `${name} has a temporary allocation to a process that does not exist on ${date}.` }));
      }
      if (entry.status === "WORKING" && unique.length === 0) {
        issues.push(issue({ type: "WORKING_WITHOUT_PROCESS", date, employee: employeeId, message: `${name} is marked WORKING on ${date} but has no process.` }));
      }
      if (entry.status !== "WORKING" && unique.length > 0) {
        issues.push(
          issue({
            type: "PROCESS_ON_NON_WORKING_DAY",
            date,
            employee: employeeId,
            message: `${name} is marked ${entry.status} on ${date} but still has process allocations.`,
          })
        );
      }

      // Availability (mandatory) vs preference.
      const unavailableReason = leave || (fixedOff ? "FIXED_WEEKLY_OFF" : null);
      if (entry.status === "WORKING" && unavailableReason) {
        issues.push(
          issue({
            type: "EMPLOYEE_UNAVAILABLE",
            category: CATEGORY.MANDATORY,
            date,
            employee: employeeId,
            reason: unavailableReason,
            message: `${name} is marked WORKING on ${date} but is unavailable (${unavailableReason}).`,
          })
        );
      }

      // Status-specific checks.
      if (entry.status === "LEAVE" && leave !== "LEAVE") {
        issues.push(issue({ type: "INVALID_LEAVE_STATUS", date, employee: employeeId, message: `${name} is marked LEAVE on ${date} without an approved leave.` }));
      }
      if (entry.status === "COMP_OFF" && leave !== "COMP_OFF") {
        issues.push(issue({ type: "INVALID_COMP_OFF_STATUS", date, employee: employeeId, message: `${name} is marked COMP_OFF on ${date} without an approved comp-off.` }));
      }
      if (entry.status === "HOLIDAY" && !ctx.isHolidayIdx[index]) {
        issues.push(issue({ type: "INVALID_HOLIDAY_STATUS", date, employee: employeeId, message: `${name} is marked HOLIDAY on ${date}, which is not in the holiday calendar.` }));
      }
      if (entry.status === "UNASSIGNED" && assigned.length) {
        issues.push(
          issue({
            type: "INVALID_UNASSIGNED_STATUS",
            date,
            employee: employeeId,
            message: `${name} is marked UNASSIGNED on ${date} but is assigned to ${listNames(assigned.map((pid) => processLabel(ctx, pid)))}.`,
          })
        );
      }
      if (entry.status === "NON_WORKING_DAY" && (!assigned.length || anyAssignedOpen)) {
        issues.push(
          issue({
            type: "INVALID_NON_WORKING_DAY_STATUS",
            date,
            employee: employeeId,
            message: assigned.length
              ? `${name} is marked NON_WORKING_DAY on ${date} but at least one of their processes operates that day.`
              : `${name} is marked NON_WORKING_DAY on ${date} but has no assignments (should be UNASSIGNED).`,
          })
        );
      }
      if (entry.status === "NOT_SCHEDULED" && (leave || !assigned.length || !anyAssignedOpen)) {
        issues.push(
          issue({
            type: "INVALID_NOT_SCHEDULED_STATUS",
            date,
            employee: employeeId,
            message: leave
              ? `${name} is marked NOT_SCHEDULED on ${date} but has approved ${leave}.`
              : !assigned.length
                ? `${name} is marked NOT_SCHEDULED on ${date} but has no assignments (should be UNASSIGNED).`
                : `${name} is marked NOT_SCHEDULED on ${date} but none of their processes operate that day (should be NON_WORKING_DAY or HOLIDAY).`,
          })
        );
      }

      // Process-level checks; only valid allocations count for coverage.
      const counted = [];
      for (const pid of unique) {
        if (!ctx.processMap.has(pid)) {
          issues.push(issue({ type: "PROCESS_NOT_FOUND", date, employee: employeeId, missingProcess: pid, message: `${name} is allocated on ${date} to a process that does not exist (${pid}).` }));
          continue;
        }
        if (entry.status !== "WORKING") continue;
        if (!ctx.isAssigned(employeeId, pid) && !temporarySet.has(pid)) {
          issues.push(
            issue({
              type: "UNAUTHORISED_PROCESS_ASSIGNMENT",
              date,
              process: pid,
              employee: employeeId,
              message: `${name} works ${processLabel(ctx, pid)} on ${date} but has neither a permanent assignment nor a date-specific temporary allocation.`,
            })
          );
          continue;
        }
        if (!ctx.operating.get(pid)[index]) {
          issues.push(
            issue({
              type: "PROCESS_NOT_OPERATING",
              date,
              process: pid,
              employee: employeeId,
              message: `${processLabel(ctx, pid)} does not operate on ${date}, but ${name} is allocated to it.`,
            })
          );
          continue;
        }
        if (unavailableReason) continue;
        counted.push(pid);
      }

      return { status: entry.status, processes: counted, locked: true, source };
    });
    grid.set(employeeId, cells);
  }

  const counts = buildCoverageCounts(ctx, grid);
  issues.push(...detectCoverageIssues(ctx, grid, counts, STAGE.VALIDATION));
  issues.push(...detectPreferredOffUsed(ctx, grid, STAGE.VALIDATION));

  // Rest-day checks (warnings, never block publishing).
  for (const employeeId of ctx.activeEmployeeIds) {
    const cells = grid.get(employeeId);
    for (const run of findWorkingRuns(cells, 1)) {
      const priorRun = run.start === 0 ? (ctx.priorWorkingRun.get(employeeId) || 0) : 0;
      const effectiveRunLength = priorRun + run.length;
      const effectiveRunStart = priorRun ? (ctx.priorWorkingRunStart.get(employeeId) || ctx.dates[run.start]) : ctx.dates[run.start];
      if (effectiveRunLength <= MAX_CONSECUTIVE_WORKING_DAYS) continue;
      issues.push(
        makeIssue(ctx, {
          type: "MAX_CONSECUTIVE_DAYS_EXCEEDED",
          severity: SEVERITY.WARNING,
          category: CATEGORY.WELLBEING,
          stage: STAGE.VALIDATION,
          date: ctx.dates[run.start],
          employee: employeeId,
          runStart: effectiveRunStart,
          runEnd: ctx.dates[run.end],
          runLength: effectiveRunLength,
          message: `${ctx.employeeName(employeeId)} works ${effectiveRunLength} consecutive days (${effectiveRunStart} to ${ctx.dates[run.end]}), more than the maximum of ${MAX_CONSECUTIVE_WORKING_DAYS}.`,
        })
      );
    }
    if (cells.length && ctx.priorRestDay.get(employeeId) && isRestDay(ctx, employeeId, cells[0], 0)) {
      issues.push(makeIssue(ctx, {
        type: "CONSECUTIVE_REST_DAYS",
        severity: SEVERITY.WARNING,
        category: CATEGORY.WELLBEING,
        stage: STAGE.VALIDATION,
        date: ctx.dates[0],
        employee: employeeId,
        message: `${ctx.employeeName(employeeId)} has a rest day immediately before ${ctx.dates[0]} and another on ${ctx.dates[0]}. Review whether this is intentional.`,
      }));
    }
    for (let index = 1; index < cells.length; index += 1) {
      if (isRestDay(ctx, employeeId, cells[index - 1], index - 1) && isRestDay(ctx, employeeId, cells[index], index)) {
        issues.push(makeIssue(ctx, {
          type: "CONSECUTIVE_REST_DAYS",
          severity: SEVERITY.WARNING,
          category: CATEGORY.WELLBEING,
          stage: STAGE.VALIDATION,
          date: ctx.dates[index],
          employee: employeeId,
          message: `${ctx.employeeName(employeeId)} has consecutive rest days on ${ctx.dates[index - 1]} and ${ctx.dates[index]}. Review whether this is intentional.`,
        }));
      }
    }
    for (const week of ctx.fullWeeks) {
      const allWorking = week.dates.every((date) => isWorking(cells[ctx.dateIndex.get(date)]));
      if (!allWorking) continue;
      issues.push(
        makeIssue(ctx, {
          type: "WEEKLY_OFF_MISSING",
          severity: SEVERITY.WARNING,
          category: CATEGORY.WELLBEING,
          stage: STAGE.VALIDATION,
          date: week.start,
          employee: employeeId,
          weekStart: week.start,
          weekEnd: week.end,
          message: `${ctx.employeeName(employeeId)} works all 7 days in the week ${week.start} to ${week.end} with no weekly off.`,
        })
      );
    }
  }

  issues.push(...ctx.dataWarnings);
  const staged = withStage(issues, STAGE.VALIDATION);
  const { errors, warnings } = splitBySeverity(staged);

  return {
    month: ctx.month,
    isValid: errors.length === 0,
    totalErrors: errors.length,
    totalWarnings: warnings.length,
    errors,
    warnings,
    summary: summariseIssues(staged),
    views: includeViews ? buildRosterViews(ctx, grid, counts) : undefined,
  };
};

// ---------------------------------------------------------------------------
// Change handling: what would a new leave do?
// ---------------------------------------------------------------------------

const issueKey = (issue) =>
  [issue.type, issue.date || "", issue.process || "", issue.employee || "", issue.code || "", issue.weekStart || "", issue.runStart || ""].join("|");

const GAP_TYPES = new Set(["INSUFFICIENT_STAFF", "NO_ASSIGNED_EMPLOYEE"]);

/**
 * Generate with and without the leave and return only what changes.
 * Saves nothing. Manual entries stay locked in both runs.
 */
export const analyzeLeaveImpact = (input, newLeave = {}) => {
  const employeeId = toId(newLeave.employee);
  const ctxCheck = buildContext({ ...input, coverageOverrides: [], leaves: [] });
  if (!employeeId || !ctxCheck.employeeMap.has(employeeId)) throw new Error("Employee not found.");
  if (!ctxCheck.activeEmployeeSet.has(employeeId)) throw new Error("Employee is inactive.");
  if (!isValidDate(newLeave.startDate) || !isValidDate(newLeave.endDate)) {
    throw new Error("startDate and endDate must be valid dates in YYYY-MM-DD format.");
  }
  if (newLeave.endDate < newLeave.startDate) throw new Error("endDate cannot be before startDate.");

  const type = LEAVE_TYPES.includes(newLeave.type) ? newLeave.type : "LEAVE";
  const leave = { employee: employeeId, startDate: newLeave.startDate, endDate: newLeave.endDate, type, status: "APPROVED" };

  const before = generateRosterPlan(input, { includeViews: false });
  const after = generateRosterPlan({ ...input, leaves: [...(input.leaves || []), leave] }, { includeViews: false });

  const beforeAll = [...before.conflicts, ...before.warnings];
  const afterAll = [...after.conflicts, ...after.warnings];
  const beforeMap = new Map(beforeAll.map((issue) => [issueKey(issue), issue]));
  const afterKeys = new Set(afterAll.map(issueKey));

  const newIssues = afterAll.filter((issue) => !beforeMap.has(issueKey(issue)));
  const worsened = afterAll.filter((issue) => {
    const previous = beforeMap.get(issueKey(issue));
    return previous && issue.type === "INSUFFICIENT_STAFF" && issue.shortage > previous.shortage;
  });
  const resolved = beforeAll.filter((issue) => !afterKeys.has(issueKey(issue)));

  const newConflicts = newIssues.filter((issue) => issue.severity === SEVERITY.ERROR);
  const newWarnings = newIssues.filter((issue) => issue.severity !== SEVERITY.ERROR);
  const gaps = [...newConflicts, ...worsened].filter((issue) => GAP_TYPES.has(issue.type));

  const ctx = after._ctx;
  const leaveDays = ctx.dates.filter((date) => date >= leave.startDate && date <= leave.endDate);
  const coverageEvaluation = [];
  for (const date of leaveDays) {
    const index = ctx.dateIndex.get(date);
    for (const pid of ctx.processesOf(employeeId)) {
      if (!ctx.operating.get(pid)[index]) continue;
      const required = ctx.required.get(pid)[index];
      const working = after._counts.get(pid)[index];
      const coveredBy = ctx.activeEmployeeIds.filter((id) => {
        const cell = after._grid.get(id)[index];
        return isWorking(cell) && cell.processes.includes(pid);
      });
      coverageEvaluation.push({
        date,
        process: pid,
        processType: ctx.processMap.get(pid).type,
        brandName: brandNameOf(ctx, ctx.processMap.get(pid).brand),
        required,
        remainingWorking: working,
        canMaintain: working >= required,
        coveredBy: coveredBy.map((id) => ({ employee: id, name: ctx.employeeName(id) })),
      });
    }
  }

  const affectedBrands = uniqueSorted(gaps.map((gap) => gap.brandName).filter(Boolean));
  const name = ctx.employeeName(employeeId);
  let message;
  if (!leaveDays.length) message = `${name}'s ${type} (${leave.startDate} to ${leave.endDate}) does not fall in ${ctx.month}; no impact on this roster.`;
  else if (!gaps.length) message = `${name}'s ${type} can be absorbed: the remaining team keeps every required process covered.`;
  else
    message = `${name}'s ${type} creates ${gaps.length} coverage gap(s) across ${affectedBrands.length} brand(s): ${listNames(affectedBrands)}. See replacements for suggested cover.`;

  return {
    month: ctx.month,
    leave: { ...leave, employeeName: name },
    leaveDaysInMonth: leaveDays,
    coverageGapCreated: gaps.length > 0,
    affectedBrands,
    multiBrandImpact: affectedBrands.length > 1,
    newConflicts,
    newWarnings,
    worsenedConflicts: worsened,
    resolvedIssues: resolved,
    coverageEvaluation,
    replacements: gaps.map((gap) => ({
      date: gap.date,
      process: gap.process,
      processType: gap.processType,
      brandName: gap.brandName,
      shortage: gap.shortage,
      suggestions: gap.replacements || [],
    })),
    message,
  };
};

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

const csvCell = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csvRow = (values) => values.map(csvCell).join(",");

/**
 * CSV export built from roster views.
 * view = "employees" (one row per employee) or "coverage" (one row per process).
 */
export const buildRosterCsv = (views, { view = "employees", employeeIds = null } = {}) => {
  const header = view === "coverage" ? ["Brand", "Process", "Calendar"] : ["Employee", "Pod", "Role", "Brands"];
  const lines = [csvRow([...header, ...views.days.map((day) => `${day.date} ${day.weekdayName.slice(0, 3)}`)])];

  if (view === "coverage") {
    for (const process of views.processes) {
      lines.push(
        csvRow([
          process.brandName,
          process.processType,
          process.calendarType,
          ...process.days.map((day) => (day.operating ? `${day.working}/${day.required}${day.status === "OK" ? "" : ` ${day.status}`}` : "CLOSED")),
        ])
      );
    }
    return lines.join("\n");
  }

  const allowed = employeeIds ? new Set(employeeIds) : null;
  const processLabels = new Map(views.processes.map((p) => [p.process, `${p.brandName} ${p.processType}`]));
  for (const employee of views.employees) {
    if (allowed && !allowed.has(employee.employee)) continue;
    lines.push(
      csvRow([
        employee.name,
        employee.podName || "",
        employee.role,
        employee.brands.join(" | "),
        ...employee.days.map((day) =>
          day.status === "WORKING" ? `WORKING: ${day.processes.map((pid) => processLabels.get(pid) || pid).join(" + ")}` : day.status
        ),
      ])
    );
  }
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Single-day coverage (used by the legacy per-day helpers)
// ---------------------------------------------------------------------------

/**
 * Coverage for one process on one date without weekly-off allocation:
 * every available assigned employee counts. blockedEmployeeIds are treated
 * as unavailable (reason MAX_CONSECUTIVE_WORK_DAYS).
 */
export const computeDayProcessCoverage = (input, processId, date, blockedEmployeeIds = new Set()) => {
  const ctx = buildContext({ ...input, month: date.slice(0, 7) });
  const index = ctx.dateIndex.get(date);
  const process = ctx.processMap.get(processId);
  if (!process || !ctx.operating.get(processId)[index]) {
    return { operating: false, required: 0, available: 0, shortage: 0, candidates: [], unavailableCandidates: [] };
  }

  const required = ctx.required.get(processId)[index];
  const candidates = [];
  const unavailableCandidates = [];
  const assignees = ctx.assigneesOf(processId).sort((a, b) => {
    const primaryA = ctx.primaryKeys.has(`${a}|${processId}`);
    const primaryB = ctx.primaryKeys.has(`${b}|${processId}`);
    return Number(primaryB) - Number(primaryA) || compareStrings(a, b);
  });

  for (const employeeId of assignees) {
    const employee = ctx.employeeMap.get(employeeId);
    const leave = ctx.leaveOn(employeeId, index);
    const fixed = ctx.isFixedOff(employeeId, ctx.weekdays[index]);
    const blocked = blockedEmployeeIds.has(employeeId);
    if (leave || fixed || blocked) {
      unavailableCandidates.push({
        employee: employeeId,
        name: employee.name,
        reason: blocked ? "MAX_CONSECUTIVE_WORK_DAYS" : leave || "FIXED_WEEKLY_OFF",
      });
      continue;
    }
    candidates.push({
      employee: { _id: employeeId, name: employee.name, pod: employee.pod, role: employee.role, active: true },
      isPrimary: ctx.primaryKeys.has(`${employeeId}|${processId}`),
      preferredOff: ctx.isPreferredOff(employeeId, ctx.weekdays[index]),
    });
  }
  candidates.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || Number(a.preferredOff) - Number(b.preferredOff));

  return {
    operating: true,
    required,
    available: candidates.length,
    shortage: Math.max(0, required - candidates.length),
    candidates,
    unavailableCandidates,
  };
};

export { addDays };
