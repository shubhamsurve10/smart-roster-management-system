// Run with: npm test   (node --test)
// Reference month 2026-11: 1 Nov is a Sunday; full Monday-Sunday weeks are
// 2-8, 9-15, 16-22 and 23-29. 30 Nov (Monday) is a partial week.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getMonthDates,
  getWeekday,
  addDays,
  getMonthWeeks,
  isValidDate,
} from "../engine/dates.js";
import {
  generateRosterPlan,
  validateRosterPlan,
  analyzeLeaveImpact,
  isProcessOperating,
  resolveAvailability,
  resolveRequiredStaff,
  buildRosterCsv,
  publicPlan,
  findWorkingRuns,
} from "../engine/rosterEngine.js";
import { seedInput } from "./helpers/seedInput.js";

const M = "2026-11";
const NOV = getMonthDates(M);
const FULL_WEEKS = getMonthWeeks(M).filter((w) => w.isFull);
const SUNDAYS = NOV.filter((d) => getWeekday(d) === 0);

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const emp = (id, extra = {}) => ({ _id: id, name: `Emp ${id}`, pod: "POD1", role: "agent", active: true, preferredOffDay: null, ...extra });
const proc = (id, brand, calendarType = "ALL_365", minStaff = 1, type = "CS") => ({ _id: id, brand, type, calendarType, minStaff });

const scenario = ({
  month = M,
  employees = [],
  processes = [],
  assign = [],
  rules = [],
  leaves = [],
  holidays = [],
  overrides = [],
  manual = [],
  priorEntries = [],
  brands,
  pods = [{ _id: "POD1", name: "Pod One", lead: null }, { _id: "POD2", name: "Pod Two", lead: null }],
} = {}) => ({
  month,
  employees,
  processes,
  brands: brands || [...new Set(processes.map((p) => p.brand))].map((b) => ({ _id: b, name: `Brand ${b}` })),
  pods,
  assignments: assign.map(([employee, process, isPrimary = false]) => ({ employee, process, isPrimary })),
  weeklyOffRules: rules.map(([employee, weekday, type]) => ({ employee, weekday, type })),
  leaves: leaves.map(([employee, startDate, endDate, type = "LEAVE", status = "APPROVED"]) => ({ employee, startDate, endDate, type, status })),
  holidays: holidays.map((date) => ({ date, name: `Holiday ${date}` })),
  coverageOverrides: overrides,
  manualEntries: manual.map(([employee, date, status, processes = [], temporaryProcesses = []]) => ({ employee, date, status, processes, temporaryProcesses, isManual: true })),
  priorEntries,
});

const cell = (plan, employee, date) => plan._grid.get(employee)[plan._ctx.dateIndex.get(date)];
const status = (plan, employee, date) => cell(plan, employee, date).status;
const working = (plan, process, date) => plan._counts.get(process)[plan._ctx.dateIndex.get(date)];
const all = (plan) => [...plan.conflicts, ...plan.warnings];
const ofType = (plan, type) => all(plan).filter((issue) => issue.type === type);
const vIssues = (result, type) => [...result.errors, ...result.warnings].filter((issue) => issue.type === type);
const generatedOffsInWeek = (plan, employee, week) =>
  week.dates.filter((d) => cell(plan, employee, d).status === "WEEKLY_OFF" && cell(plan, employee, d).source === "GENERATED").length;
const offsInWeek = (plan, employee, week) => week.dates.filter((d) => status(plan, employee, d) === "WEEKLY_OFF").length;

// Saved entries = generated entries + manual entries (what the DB would hold).
const savedEntries = (input, plan) => [
  ...plan.entries,
  ...(input.manualEntries || []),
];

const threeStaffMinTwo = (extra = {}) =>
  scenario({
    employees: [emp("E1"), emp("E2"), emp("E3")],
    processes: [proc("P1", "B1", "ALL_365", 2)],
    assign: [["E1", "P1"], ["E2", "P1"], ["E3", "P1"]],
    ...extra,
  });

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

describe("dates", () => {
  it("returns the right number of days for 28/29/30/31-day months", () => {
    assert.equal(getMonthDates("2026-02").length, 28);
    assert.equal(getMonthDates("2026-04").length, 30);
    assert.equal(getMonthDates("2026-11").length, 30);
    assert.equal(getMonthDates("2026-12").length, 31);
  });

  it("handles leap years (2028-02 has 29 days, 2100-02 has 28)", () => {
    assert.equal(getMonthDates("2028-02").length, 29);
    assert.equal(getMonthDates("2028-02")[28], "2028-02-29");
    assert.equal(getMonthDates("2100-02").length, 28);
  });

  it("throws on invalid month formats", () => {
    for (const bad of ["2026-13", "2026-00", "26-11", "2026/11", "", undefined, null, "2026-1"]) {
      assert.throws(() => getMonthDates(bad), /Invalid month format/, `expected ${bad} to throw`);
    }
  });

  it("computes weekdays in UTC across the year boundary", () => {
    assert.equal(getWeekday("2026-11-01"), 0);
    assert.equal(getWeekday("2026-12-31"), 4);
    assert.equal(getWeekday("2027-01-01"), 5);
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  });

  it("splits November 2026 into the expected Monday-Sunday weeks", () => {
    assert.deepEqual(FULL_WEEKS.map((w) => w.start), ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
    const weeks = getMonthWeeks(M);
    assert.equal(weeks[0].dates.length, 1); // Sunday 1 Nov
    assert.equal(weeks[weeks.length - 1].dates.length, 1); // Monday 30 Nov
  });

  it("validates real calendar dates", () => {
    assert.equal(isValidDate("2026-02-29"), false);
    assert.equal(isValidDate("2028-02-29"), true);
    assert.equal(isValidDate("2026-11-31"), false);
    assert.equal(isValidDate("2026/11/01"), false);
  });
});

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

describe("calendars", () => {
  const holidays = new Set(["2026-11-11"]);
  it("ALL_365 operates on Sundays and holidays", () => {
    assert.equal(isProcessOperating({ calendarType: "ALL_365" }, "2026-11-01", holidays), true);
    assert.equal(isProcessOperating({ calendarType: "ALL_365" }, "2026-11-11", holidays), true);
  });
  it("EXCEPT_HOLIDAYS is open on Sunday and closed on holidays", () => {
    assert.equal(isProcessOperating({ calendarType: "EXCEPT_HOLIDAYS" }, "2026-11-01", holidays), true);
    assert.equal(isProcessOperating({ calendarType: "EXCEPT_HOLIDAYS" }, "2026-11-11", holidays), false);
  });
  it("NO_SUN_NO_HOLIDAY is closed on Sundays and holidays", () => {
    assert.equal(isProcessOperating({ calendarType: "NO_SUN_NO_HOLIDAY" }, "2026-11-01", holidays), false);
    assert.equal(isProcessOperating({ calendarType: "NO_SUN_NO_HOLIDAY" }, "2026-11-11", holidays), false);
    assert.equal(isProcessOperating({ calendarType: "NO_SUN_NO_HOLIDAY" }, "2026-11-12", holidays), true);
  });

  it("a Sunday holiday for a NO_SUN person gives one HOLIDAY and no weekly-off conflict", () => {
    const input = scenario({
      employees: [emp("E1")],
      processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY")],
      assign: [["E1", "P1"]],
      holidays: ["2026-11-08"],
    });
    const plan = generateRosterPlan(input);
    assert.equal(status(plan, "E1", "2026-11-08"), "HOLIDAY");
    assert.equal(ofType(plan, "WEEKLY_OFF_NOT_POSSIBLE").length, 0);
    assert.equal(plan.conflicts.length, 0);
    assert.equal(plan.entries.filter((e) => e.employee === "E1" && e.date === "2026-11-08").length, 1);
  });

  it("consecutive holidays do not replace the weekly off (EXCEPT_HOLIDAYS)", () => {
    const input = scenario({
      employees: [emp("E1"), emp("E2")],
      processes: [proc("P1", "B1", "EXCEPT_HOLIDAYS", 1)],
      assign: [["E1", "P1"], ["E2", "P1"]],
      holidays: ["2026-11-10", "2026-11-11"],
    });
    const plan = generateRosterPlan(input);
    assert.equal(status(plan, "E1", "2026-11-10"), "HOLIDAY");
    assert.equal(status(plan, "E2", "2026-11-11"), "HOLIDAY");
    const week = FULL_WEEKS[1];
    assert.equal(offsInWeek(plan, "E1", week), 1);
    assert.equal(offsInWeek(plan, "E2", week), 1);
    assert.equal(plan.conflicts.length, 0);
  });

  it("an unsupported calendar type does not crash and is reported", () => {
    const input = scenario({
      employees: [emp("E1")],
      processes: [proc("P1", "B1", "WEEKDAYS_ONLY")],
      assign: [["E1", "P1"]],
    });
    const plan = generateRosterPlan(input);
    assert.equal(ofType(plan, "UNSUPPORTED_CALENDAR_TYPE").length, 1);
    assert.equal(plan.isValid, false);
    assert.equal(status(plan, "E1", "2026-11-03"), "NON_WORKING_DAY");
    assert.equal(isProcessOperating({ calendarType: "WEEKDAYS_ONLY" }, "2026-11-03"), false);
  });
});

// ---------------------------------------------------------------------------
// Coverage requirements
// ---------------------------------------------------------------------------

describe("coverage requirements", () => {
  it("defaults minStaff to 1", () => {
    const process = { _id: "P1", calendarType: "ALL_365" };
    assert.equal(resolveRequiredStaff({ process, date: "2026-11-03" }), 1);
    const plan = generateRosterPlan(scenario({ employees: [emp("E1")], processes: [{ _id: "P1", brand: "B1", type: "CS", calendarType: "ALL_365" }], assign: [["E1", "P1"]] }));
    assert.equal(plan._ctx.required.get("P1")[3], 1);
  });

  it("minStaff 2 with 3 staff always keeps at least 2 working", () => {
    const plan = generateRosterPlan(threeStaffMinTwo());
    for (const date of NOV) assert.ok(working(plan, "P1", date) >= 2, date);
    assert.equal(plan.conflicts.length, 0);
  });

  it("applies weekday overrides, and date overrides beat weekday overrides", () => {
    const input = threeStaffMinTwo({
      processes: [proc("P1", "B1", "ALL_365", 1)],
      overrides: [
        { process: "P1", weekday: 5, minStaff: 2 },
        { process: "P1", date: "2026-11-13", minStaff: 3 },
      ],
    });
    const plan = generateRosterPlan(input);
    const req = (d) => plan._ctx.required.get("P1")[plan._ctx.dateIndex.get(d)];
    assert.equal(req("2026-11-06"), 2); // Friday
    assert.equal(req("2026-11-13"), 3); // date override
    assert.equal(req("2026-11-12"), 1);
    for (const date of NOV) assert.ok(working(plan, "P1", date) >= req(date), date);
  });

  it("an override above available staff gives INSUFFICIENT_STAFF only on that day", () => {
    const input = scenario({
      employees: [emp("E1"), emp("E2")],
      processes: [proc("P1", "B1", "ALL_365", 1)],
      assign: [["E1", "P1"], ["E2", "P1"]],
      overrides: [{ process: "P1", date: "2026-11-18", minStaff: 3 }],
    });
    const plan = generateRosterPlan(input);
    const gaps = ofType(plan, "INSUFFICIENT_STAFF");
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].date, "2026-11-18");
    assert.equal(gaps[0].required, 3);
    assert.equal(gaps[0].shortage, 1);
  });

  it("minStaff 0 gives no conflicts and no NaN", () => {
    const input = scenario({
      employees: [emp("E1")],
      processes: [proc("P1", "B1", "ALL_365", 0)],
      assign: [["E1", "P1"]],
    });
    const plan = generateRosterPlan(input);
    assert.equal(plan.conflicts.length, 0);
    assert.equal(ofType(plan, "WEEKLY_OFF_NOT_POSSIBLE").length, 0);
    assert.ok(!JSON.stringify(publicPlan(plan)).includes("NaN"));
    for (const week of FULL_WEEKS) assert.equal(offsInWeek(plan, "E1", week), 1);
  });

  it("ignores and reports overrides on closed days or outside the month", () => {
    const input = scenario({
      employees: [emp("E1")],
      processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY", 1)],
      assign: [["E1", "P1"]],
      overrides: [
        { process: "P1", date: "2026-11-08", minStaff: 3 }, // Sunday, closed
        { process: "P1", date: "2026-12-05", minStaff: 3 }, // other month
        { process: "P1", weekday: 0, minStaff: 2 }, // Sundays, never open
      ],
    });
    const plan = generateRosterPlan(input);
    const codes = ofType(plan, "DATA_WARNING").map((w) => w.code);
    assert.equal(codes.filter((c) => c === "OVERRIDE_ON_CLOSED_DAY").length, 2);
    assert.ok(codes.includes("OVERRIDE_OUTSIDE_MONTH"));
    assert.equal(plan.conflicts.length, 0);
  });

  it("a process needing 3 with only 2 assigned conflicts on every operating day", () => {
    const input = scenario({
      employees: [emp("E1"), emp("E2")],
      processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY", 3)],
      assign: [["E1", "P1"], ["E2", "P1"]],
    });
    const plan = generateRosterPlan(input);
    const operatingDays = NOV.filter((d) => getWeekday(d) !== 0);
    assert.equal(ofType(plan, "INSUFFICIENT_STAFF").length, operatingDays.length);
  });
});

// ---------------------------------------------------------------------------
// Weekly offs
// ---------------------------------------------------------------------------

describe("weekly offs", () => {
  it("single-person NO_SUN brand gets NON_WORKING_DAY on Sundays and no conflicts", () => {
    const plan = generateRosterPlan(scenario({ employees: [emp("E1")], processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY")], assign: [["E1", "P1"]] }));
    for (const sunday of SUNDAYS) assert.equal(status(plan, "E1", sunday), "NON_WORKING_DAY");
    assert.equal(NOV.filter((d) => status(plan, "E1", d) === "WEEKLY_OFF").length, 0);
    assert.equal(plan.conflicts.length, 0);
    assert.equal(plan.warnings.length, 0);
  });

  it("single-person ALL_365 works every day with one WEEKLY_OFF_NOT_POSSIBLE per full week and no INSUFFICIENT_STAFF", () => {
    const plan = generateRosterPlan(scenario({ employees: [emp("E1")], processes: [proc("P1", "B1", "ALL_365")], assign: [["E1", "P1"]] }));
    for (const date of NOV) assert.equal(status(plan, "E1", date), "WORKING");
    const notPossible = ofType(plan, "WEEKLY_OFF_NOT_POSSIBLE");
    assert.equal(notPossible.length, FULL_WEEKS.length);
    assert.deepEqual(notPossible.map((w) => w.weekStart), FULL_WEEKS.map((w) => w.start));
    assert.ok(notPossible.every((w) => w.severity === "WARNING" && w.stage === "GENERATION"));
    assert.ok(notPossible[0].leastDamagingDay);
    assert.equal(ofType(plan, "INSUFFICIENT_STAFF").length, 0);
    assert.ok(ofType(plan, "MAX_CONSECUTIVE_DAYS_EXCEEDED").length >= 1);
    assert.equal(plan.isValid, true);
  });

  it("3 staff, min 2, ALL_365: exactly one weekly off per full week each, coverage >= 2, no run over 6", () => {
    const plan = generateRosterPlan(threeStaffMinTwo());
    for (const employee of ["E1", "E2", "E3"]) {
      for (const week of FULL_WEEKS) assert.equal(offsInWeek(plan, employee, week), 1, `${employee} ${week.start}`);
      const runs = findWorkingRuns(plan._grid.get(employee), 7);
      assert.equal(runs.length, 0, `${employee} has a run over 6`);
    }
    for (const date of NOV) assert.ok(working(plan, "P1", date) >= 2);
    assert.equal(all(plan).length, 0);
  });

  it("2 staff, min 1: each gets one off per full week, never on the same day", () => {
    const plan = generateRosterPlan(scenario({ employees: [emp("E1"), emp("E2")], processes: [proc("P1", "B1")], assign: [["E1", "P1"], ["E2", "P1"]] }));
    for (const week of FULL_WEEKS) {
      assert.equal(offsInWeek(plan, "E1", week), 1);
      assert.equal(offsInWeek(plan, "E2", week), 1);
    }
    for (const date of NOV) {
      assert.ok(!(status(plan, "E1", date) === "WEEKLY_OFF" && status(plan, "E2", date) === "WEEKLY_OFF"), date);
    }
    assert.equal(plan.conflicts.length, 0);
  });

  it("2 staff, min 2: both are flagged every full week", () => {
    const plan = generateRosterPlan(scenario({ employees: [emp("E1"), emp("E2")], processes: [proc("P1", "B1", "ALL_365", 2)], assign: [["E1", "P1"], ["E2", "P1"]] }));
    const notPossible = ofType(plan, "WEEKLY_OFF_NOT_POSSIBLE");
    assert.equal(notPossible.length, FULL_WEEKS.length * 2);
    assert.equal(notPossible.filter((w) => w.employee === "E1").length, FULL_WEEKS.length);
    assert.equal(ofType(plan, "INSUFFICIENT_STAFF").length, 0);
  });

  it("a FIXED Sunday off on a Sunday-operating single-person process gives INSUFFICIENT_STAFF naming the person", () => {
    const plan = generateRosterPlan(
      scenario({ employees: [emp("E1", { name: "Riya" })], processes: [proc("P1", "B1", "ALL_365")], assign: [["E1", "P1"]], rules: [["E1", 0, "FIXED"]] })
    );
    for (const sunday of SUNDAYS) assert.equal(status(plan, "E1", sunday), "WEEKLY_OFF");
    const gaps = ofType(plan, "INSUFFICIENT_STAFF");
    assert.deepEqual(gaps.map((g) => g.date), SUNDAYS);
    assert.match(gaps[0].message, /Riya \(WEEKLY_OFF, fixed\)/);
    assert.equal(gaps[0].unavailableEmployees[0].offType, "FIXED");
    assert.equal(ofType(plan, "WEEKLY_OFF_NOT_POSSIBLE").length, 0);
  });

  it("a FIXED off with a backup gives no gap", () => {
    const plan = generateRosterPlan(
      scenario({ employees: [emp("E1"), emp("E2")], processes: [proc("P1", "B1")], assign: [["E1", "P1"], ["E2", "P1"]], rules: [["E1", 0, "FIXED"]] })
    );
    assert.equal(plan.conflicts.length, 0);
    for (const sunday of SUNDAYS) assert.equal(status(plan, "E2", sunday), "WORKING");
  });

  it("normalizes legacy duplicate FIXED rules to one fixed weekday and warns", () => {
    const plan = generateRosterPlan(
      scenario({
        employees: [emp("E1"), emp("E2")],
        processes: [proc("P1", "B1")],
        assign: [["E1", "P1"], ["E2", "P1"]],
        rules: [["E1", 6, "FIXED"], ["E1", 0, "FIXED"]],
      })
    );
    for (const week of FULL_WEEKS) {
      assert.equal(generatedOffsInWeek(plan, "E1", week), 0);
      assert.equal(offsInWeek(plan, "E1", week), 1);
    }
    assert.equal(plan.warnings.filter((issue) => issue.code === "MULTIPLE_FIXED_WEEKLY_OFF_RULES").length, 1);
  });

  it("a FIXED off on a closed day is harmless", () => {
    const plan = generateRosterPlan(
      scenario({ employees: [emp("E1")], processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY")], assign: [["E1", "P1"]], rules: [["E1", 0, "FIXED"]] })
    );
    for (const sunday of SUNDAYS) assert.equal(status(plan, "E1", sunday), "WEEKLY_OFF");
    assert.equal(all(plan).length, 0);
  });

  it("grants the preferred off when coverage allows", () => {
    const plan = generateRosterPlan(
      scenario({ employees: [emp("E1"), emp("E2")], processes: [proc("P1", "B1")], assign: [["E1", "P1"], ["E2", "P1"]], rules: [["E1", 3, "PREFERRED"]] })
    );
    for (const week of FULL_WEEKS) {
      const wednesday = week.dates.find((d) => getWeekday(d) === 3);
      assert.equal(status(plan, "E1", wednesday), "WEEKLY_OFF", wednesday);
    }
    assert.equal(ofType(plan, "PREFERRED_OFF_USED").filter((w) => w.employee === "E1" && FULL_WEEKS.some((wk) => wk.dates.includes(w.date))).length, 0);
  });

  it("uses employee.preferredOffDay when no rule exists, and warns when overridden", () => {
    const plan = generateRosterPlan(scenario({ employees: [emp("E1", { preferredOffDay: 3 })], processes: [proc("P1", "B1")], assign: [["E1", "P1"]] }));
    const used = ofType(plan, "PREFERRED_OFF_USED");
    assert.equal(used.length, NOV.filter((d) => getWeekday(d) === 3).length);
    assert.ok(used.every((w) => w.severity === "WARNING" && w.category === "PREFERENCE"));
  });

  it("three staff preferring the same day keep coverage", () => {
    const plan = generateRosterPlan(threeStaffMinTwo({ rules: [["E1", 3, "PREFERRED"], ["E2", 3, "PREFERRED"], ["E3", 3, "PREFERRED"]] }));
    for (const date of NOV) assert.ok(working(plan, "P1", date) >= 2, date);
    for (const employee of ["E1", "E2", "E3"]) for (const week of FULL_WEEKS) assert.equal(offsInWeek(plan, employee, week), 1);
    assert.equal(plan.conflicts.length, 0);
  });

  it("a weekly off for a person on two processes keeps both covered", () => {
    const plan = generateRosterPlan(
      scenario({
        employees: [emp("E1"), emp("E2"), emp("E3")],
        processes: [proc("P1", "B1", "ALL_365", 1, "CS"), proc("P2", "B1", "ALL_365", 1, "ACC")],
        assign: [["E1", "P1"], ["E1", "P2"], ["E2", "P1"], ["E3", "P2"]],
      })
    );
    for (const date of NOV) {
      assert.ok(working(plan, "P1", date) >= 1, `P1 ${date}`);
      assert.ok(working(plan, "P2", date) >= 1, `P2 ${date}`);
    }
    for (const week of FULL_WEEKS) assert.equal(offsInWeek(plan, "E1", week), 1);
    assert.equal(ofType(plan, "OVERLAPPING_RESPONSIBILITIES").length, 0);
  });

  it("never gives two generated offs in one full week (only the repair pass may add one)", () => {
    const inputs = [threeStaffMinTwo(), seedInput("2026-12"), seedInput("2026-11")];
    for (const input of inputs) {
      const plan = generateRosterPlan(input);
      for (const employee of plan._ctx.activeEmployeeIds) {
        for (const week of plan._ctx.fullWeeks) assert.ok(generatedOffsInWeek(plan, employee, week) <= 1);
      }
      const repairCells = [...plan._grid.values()].flat().filter((c) => c.source === "REPAIR").length;
      assert.equal(repairCells, plan.extraWeeklyOffs.length);
    }
  });

  it("the repair pass splits a long run when coverage allows and reports it", () => {
    // December 2026 starts on a Tuesday, so the partial first week plus a leave
    // in the first full week creates a run longer than 6 days.
    const input = scenario({
      month: "2026-12",
      employees: [emp("E1"), emp("E2"), emp("E3")],
      processes: [proc("P1", "B1", "ALL_365", 1)],
      assign: [["E1", "P1"], ["E2", "P1"], ["E3", "P1"]],
      leaves: [["E1", "2026-12-13", "2026-12-13"]],
    });
    const plan = generateRosterPlan(input);
    assert.ok(plan.extraWeeklyOffs.length > 0);
    for (const employee of ["E1", "E2", "E3"]) assert.equal(findWorkingRuns(plan._grid.get(employee), 7).length, 0);
  });
});

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

describe("leave", () => {
  const twoStaff = (leaves) =>
    scenario({ employees: [emp("E1"), emp("E2")], processes: [proc("P1", "B1")], assign: [["E1", "P1"], ["E2", "P1"]], leaves });

  it("leave on a day with backup creates no gap", () => {
    const plan = generateRosterPlan(twoStaff([["E1", "2026-11-11", "2026-11-11"]]));
    assert.equal(status(plan, "E1", "2026-11-11"), "LEAVE");
    assert.equal(status(plan, "E2", "2026-11-11"), "WORKING");
    assert.equal(plan.conflicts.length, 0);
  });

  it("leave of the only person creates a gap with replacements", () => {
    const input = scenario({
      employees: [emp("E1", { name: "Riya" }), emp("E2", { name: "Aman" }), emp("E3", { name: "Zoya", pod: "POD2" })],
      processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY"), proc("P2", "B2", "NO_SUN_NO_HOLIDAY", 0)],
      assign: [["E1", "P1"], ["E2", "P2"], ["E3", "P2"]],
      leaves: [["E1", "2026-11-11", "2026-11-11"]],
    });
    const plan = generateRosterPlan(input);
    const gaps = ofType(plan, "INSUFFICIENT_STAFF");
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].date, "2026-11-11");
    assert.match(gaps[0].message, /CS \(Brand B1\) needs 1 on 2026-11-11 but only 0 working\. Unavailable: Riya \(LEAVE\)\./);
    assert.ok(gaps[0].replacements.length >= 1);
    assert.equal(gaps[0].replacements[0].employeeName, "Aman"); // same pod ranks above other pod
    assert.equal(gaps[0].replacements[0].tier, 3);
    assert.ok(gaps[0].replacements.every((r) => r.employee !== "E1"));
  });

  it("leave spanning a weekly off or holiday stays LEAVE with no extra weekly-off conflict", () => {
    const input = scenario({
      employees: [emp("E1")],
      processes: [proc("P1", "B1", "ALL_365")],
      assign: [["E1", "P1"]],
      holidays: ["2026-11-08"],
      leaves: [["E1", "2026-11-07", "2026-11-09"]],
    });
    const plan = generateRosterPlan(input);
    for (const d of ["2026-11-07", "2026-11-08", "2026-11-09"]) assert.equal(status(plan, "E1", d), "LEAVE");
    const weeks = ofType(plan, "WEEKLY_OFF_NOT_POSSIBLE").map((w) => w.weekStart);
    assert.ok(!weeks.includes("2026-11-02"));
    assert.ok(!weeks.includes("2026-11-09"));
  });

  it("handles leave crossing the month boundary and leave outside the month", () => {
    const plan = generateRosterPlan(twoStaff([["E1", "2026-10-30", "2026-11-02"], ["E2", "2026-12-01", "2026-12-05"]]));
    assert.equal(status(plan, "E1", "2026-11-01"), "LEAVE");
    assert.equal(status(plan, "E1", "2026-11-02"), "LEAVE");
    assert.notEqual(status(plan, "E1", "2026-11-03"), "LEAVE");
    assert.equal(NOV.filter((d) => status(plan, "E2", d) === "LEAVE").length, 0);
  });

  it("comp-off gives COMP_OFF; unknown type is treated as LEAVE and reported", () => {
    const plan = generateRosterPlan(twoStaff([["E1", "2026-11-11", "2026-11-11", "COMP_OFF"], ["E2", "2026-11-12", "2026-11-12", "SICK"]]));
    assert.equal(status(plan, "E1", "2026-11-11"), "COMP_OFF");
    assert.equal(status(plan, "E2", "2026-11-12"), "LEAVE");
    assert.ok(ofType(plan, "DATA_WARNING").some((w) => w.code === "UNKNOWN_LEAVE_TYPE"));
  });

  it("overlapping leaves give one status per day and pending leave is ignored", () => {
    const input = twoStaff([
      ["E1", "2026-11-10", "2026-11-12", "COMP_OFF"],
      ["E1", "2026-11-11", "2026-11-13", "LEAVE"],
      ["E2", "2026-11-20", "2026-11-20", "LEAVE", "PENDING"],
    ]);
    const plan = generateRosterPlan(input);
    assert.equal(status(plan, "E1", "2026-11-10"), "COMP_OFF");
    assert.equal(status(plan, "E1", "2026-11-11"), "LEAVE");
    assert.equal(plan.entries.filter((e) => e.employee === "E1").length, NOV.length);
    assert.notEqual(status(plan, "E2", "2026-11-20"), "LEAVE");
  });

  it("one of three on leave with min 2: no gap; two of three: gap; everyone: gap", () => {
    const one = generateRosterPlan(threeStaffMinTwo({ leaves: [["E1", "2026-11-11", "2026-11-11"]] }));
    assert.equal(one.conflicts.length, 0);

    const two = generateRosterPlan(threeStaffMinTwo({ leaves: [["E1", "2026-11-11", "2026-11-11"], ["E2", "2026-11-11", "2026-11-11"]] }));
    const gap = ofType(two, "INSUFFICIENT_STAFF");
    assert.equal(gap.length, 1);
    assert.equal(gap[0].shortage, 1);

    const everyone = generateRosterPlan(
      threeStaffMinTwo({ leaves: [["E1", "2026-11-11", "2026-11-11"], ["E2", "2026-11-11", "2026-11-11"], ["E3", "2026-11-11", "2026-11-11"]] })
    );
    const full = ofType(everyone, "INSUFFICIENT_STAFF");
    assert.equal(full.length, 1);
    assert.equal(full[0].available, 0);
    assert.equal(full[0].unavailableEmployees.length, 3);
  });
});

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

describe("assignments", () => {
  it("one person on several processes of one brand is not flagged as overlapping", () => {
    const plan = generateRosterPlan(
      scenario({
        employees: [emp("E1")],
        processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY", 1, "CS"), proc("P2", "B1", "NO_SUN_NO_HOLIDAY", 1, "ACC")],
        assign: [["E1", "P1"], ["E1", "P2"]],
      })
    );
    assert.equal(ofType(plan, "OVERLAPPING_RESPONSIBILITIES").length, 0);
    assert.deepEqual(cell(plan, "E1", "2026-11-03").processes.sort(), ["P1", "P2"]);
  });

  it("one person covering two single-resource brands is flagged OVERLAPPING_RESPONSIBILITIES", () => {
    const plan = generateRosterPlan(
      scenario({
        employees: [emp("E1")],
        processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY"), proc("P2", "B2", "NO_SUN_NO_HOLIDAY")],
        assign: [["E1", "P1"], ["E1", "P2"]],
      })
    );
    const overlaps = ofType(plan, "OVERLAPPING_RESPONSIBILITIES");
    assert.equal(overlaps.length, NOV.filter((d) => getWeekday(d) !== 0).length);
    assert.equal(overlaps[0].brands.length, 2);
  });

  it("multi-employee brand with different processes", () => {
    const plan = generateRosterPlan(
      scenario({
        employees: [emp("E1"), emp("E2")],
        processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY", 1, "CS"), proc("P2", "B1", "NO_SUN_NO_HOLIDAY", 1, "NDR")],
        assign: [["E1", "P1"], ["E2", "P2"]],
      })
    );
    assert.deepEqual(cell(plan, "E1", "2026-11-03").processes, ["P1"]);
    assert.deepEqual(cell(plan, "E2", "2026-11-03").processes, ["P2"]);
    assert.equal(plan.views.brands[0].resourcePattern, "MULTI_RESOURCE");
    assert.equal(plan.conflicts.length, 0);
  });

  it("a process with nobody assigned gives NO_ASSIGNED_EMPLOYEE on every operating day", () => {
    const plan = generateRosterPlan(scenario({ employees: [emp("E1")], processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY")] }));
    assert.equal(ofType(plan, "NO_ASSIGNED_EMPLOYEE").length, NOV.filter((d) => getWeekday(d) !== 0).length);
    assert.equal(ofType(plan, "INSUFFICIENT_STAFF").length, 0);
  });

  it("an unassigned employee is UNASSIGNED (never WEEKLY_OFF), HOLIDAY on holidays, with one warning", () => {
    const plan = generateRosterPlan(scenario({ employees: [emp("E1")], processes: [], holidays: ["2026-11-11"], rules: [["E1", 0, "FIXED"]] }));
    assert.equal(status(plan, "E1", "2026-11-11"), "HOLIDAY");
    assert.equal(status(plan, "E1", "2026-11-01"), "UNASSIGNED");
    assert.equal(NOV.filter((d) => status(plan, "E1", d) === "WEEKLY_OFF").length, 0);
    assert.equal(ofType(plan, "UNASSIGNED_EMPLOYEE").length, 1);
  });

  it("inactive employees are excluded and not counted; an only-inactive assignee gives NO_ASSIGNED_EMPLOYEE", () => {
    const plan = generateRosterPlan(
      scenario({
        employees: [emp("E1"), emp("E2", { active: false }), emp("E3", { active: false })],
        processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY", 2), proc("P2", "B2", "NO_SUN_NO_HOLIDAY", 1)],
        assign: [["E1", "P1"], ["E2", "P1"], ["E3", "P2"]],
      })
    );
    assert.equal(plan.entries.filter((e) => e.employee === "E2" || e.employee === "E3").length, 0);
    assert.ok(ofType(plan, "INSUFFICIENT_STAFF").every((g) => g.process === "P1" && g.available === 1));
    const noOne = ofType(plan, "NO_ASSIGNED_EMPLOYEE");
    assert.ok(noOne.length > 0 && noOne.every((g) => g.process === "P2"));
    assert.match(noOne[0].message, /only inactive/);
  });

  it("assignments to missing records are ignored and reported", () => {
    const plan = generateRosterPlan(scenario({ employees: [emp("E1")], processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY")], assign: [["E1", "P1"], ["GHOST", "P1"], ["E1", "NOPE"]] }));
    const codes = ofType(plan, "DATA_WARNING").map((w) => w.code);
    assert.ok(codes.includes("ASSIGNMENT_EMPLOYEE_MISSING"));
    assert.ok(codes.includes("ASSIGNMENT_PROCESS_MISSING"));
    assert.equal(plan.conflicts.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Manual entries
// ---------------------------------------------------------------------------

describe("manual entries", () => {
  it("a manual LEAVE on one of three is kept and coverage maintained", () => {
    const input = threeStaffMinTwo({ manual: [["E1", "2026-11-11", "LEAVE"]] });
    const plan = generateRosterPlan(input);
    assert.equal(status(plan, "E1", "2026-11-11"), "LEAVE");
    assert.equal(plan.entries.some((e) => e.employee === "E1" && e.date === "2026-11-11"), false);
    for (const date of NOV) assert.ok(working(plan, "P1", date) >= 2, date);
    assert.equal(plan.manualEntriesPreserved, 1);
  });

  it("a manual entry that creates a gap is reported with a suggestion", () => {
    const input = scenario({
      employees: [emp("E1"), emp("E2")],
      processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY"), proc("P2", "B2", "NO_SUN_NO_HOLIDAY", 0)],
      assign: [["E1", "P1"], ["E2", "P2"]],
      manual: [["E1", "2026-11-11", "WEEKLY_OFF"]],
    });
    const plan = generateRosterPlan(input);
    const gaps = ofType(plan, "INSUFFICIENT_STAFF");
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].unavailableEmployees[0].offType, "MANUAL");
    assert.equal(gaps[0].replacements[0].employee, "E2");
  });

  it("regeneration succeeds with manual entries and never rewrites them", () => {
    const input = threeStaffMinTwo({
      manual: [["E1", "2026-11-03", "WORKING", ["P1"]], ["E2", "2026-11-04", "WEEKLY_OFF"], ["E3", "2026-11-05", "NOT_SCHEDULED"]],
    });
    const first = generateRosterPlan(input);
    const second = generateRosterPlan(input);
    assert.deepEqual(first.entries, second.entries);
    const manualKeys = new Set(input.manualEntries.map((m) => `${m.employee}|${m.date}`));
    assert.ok(first.entries.every((e) => !manualKeys.has(`${e.employee}|${e.date}`)));
    assert.equal(status(first, "E2", "2026-11-04"), "WEEKLY_OFF");
    assert.ok(working(first, "P1", "2026-11-03") >= 2);
  });
});



describe("cross-month working streaks", () => {
  it("uses the previous month's saved entries when repairing a streak at month start", () => {
    const priorEntries = Array.from({ length: 6 }, (_, index) => ({ employee: "E1", date: addDays("2026-11-01", -(index + 1)), status: "WORKING" }));
    const input = scenario({
      employees: [emp("E1"), emp("E2")],
      processes: [proc("P1", "B1", "ALL_365", 1)],
      assign: [["E1", "P1"], ["E2", "P1"]],
      priorEntries,
    });
    const plan = generateRosterPlan(input);
    assert.equal(status(plan, "E1", "2026-11-01"), "WEEKLY_OFF");
    const validation = validateRosterPlan({ ...input, entries: savedEntries(input, plan) });
    assert.equal(vIssues(validation, "MAX_CONSECUTIVE_DAYS_EXCEEDED").length, 0);
  });
});

describe("temporary date-specific coverage", () => {
  it("counts a manual temporary process for one date without creating a permanent assignment", () => {
    const input = scenario({
      employees: [emp("E1"), emp("E2")],
      processes: [proc("P1", "B1", "ALL_365", 1)],
      assign: [["E1", "P1"]],
      manual: [["E2", "2026-11-03", "WORKING", [], ["P1"]]],
    });
    const plan = generateRosterPlan(input);
    assert.equal(working(plan, "P1", "2026-11-03"), 1);
    assert.equal(status(plan, "E1", "2026-11-03"), "WEEKLY_OFF", "temporary cover lets the permanent assignee take the day off while keeping one-person minimum coverage");
    assert.equal(input.assignments.some((a) => a.employee === "E2" && a.process === "P1"), false);
    const validation = validateRosterPlan({ ...input, entries: savedEntries(input, plan) });
    assert.equal(vIssues(validation, "UNAUTHORISED_PROCESS_ASSIGNMENT").length, 0);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validation", () => {
  const base = () =>
    scenario({
      employees: [emp("E1"), emp("E2"), emp("E3"), emp("E4"), emp("E9", { active: false })],
      processes: [proc("P1", "B1", "ALL_365", 2), proc("P2", "B2", "NO_SUN_NO_HOLIDAY", 1)],
      assign: [["E1", "P1"], ["E2", "P1"], ["E3", "P1"], ["E4", "P2"]],
      holidays: ["2026-11-20"],
      leaves: [["E1", "2026-11-11", "2026-11-11"]],
    });
  const generated = () => {
    const input = base();
    const plan = generateRosterPlan(input);
    return { input, entries: savedEntries(input, plan).map((e) => ({ ...e })) };
  };
  const validate = (input, entries) => validateRosterPlan({ ...input, entries });
  const find = (entries, employee, date) => entries.find((e) => e.employee === employee && e.date === date);

  it("a freshly generated roster is valid", () => {
    const { input, entries } = generated();
    const result = validate(input, entries);
    assert.equal(result.isValid, true, JSON.stringify(result.errors.slice(0, 3)));
  });

  it("detects working on a leave day, missing entries and removed coverage", () => {
    const { input, entries } = generated();
    Object.assign(find(entries, "E1", "2026-11-11"), { status: "WORKING", processes: ["P1"] });
    const withoutMissing = entries.filter((e) => !(e.employee === "E2" && e.date === "2026-11-12"));
    Object.assign(find(withoutMissing, "E4", "2026-11-03"), { status: "NOT_SCHEDULED", processes: [] });
    const result = validate(input, withoutMissing);
    assert.equal(vIssues(result, "EMPLOYEE_UNAVAILABLE").length, 1);
    assert.equal(vIssues(result, "MISSING_ROSTER_ENTRY").length, 1);
    assert.ok(vIssues(result, "INSUFFICIENT_STAFF").some((g) => g.process === "P2" && g.date === "2026-11-03"));
    assert.equal(result.isValid, false);
  });

  it("detects invalid leave / comp-off / holiday / unassigned / non-working / not-scheduled statuses", () => {
    const { input, entries } = generated();
    Object.assign(find(entries, "E2", "2026-11-03"), { status: "LEAVE", processes: [] });
    Object.assign(find(entries, "E2", "2026-11-04"), { status: "COMP_OFF", processes: [] });
    Object.assign(find(entries, "E3", "2026-11-05"), { status: "HOLIDAY", processes: [] });
    Object.assign(find(entries, "E3", "2026-11-06"), { status: "UNASSIGNED", processes: [] });
    Object.assign(find(entries, "E4", "2026-11-09"), { status: "NON_WORKING_DAY", processes: [] });
    Object.assign(find(entries, "E4", "2026-11-08"), { status: "NOT_SCHEDULED", processes: [] }); // Sunday, P2 closed
    const result = validate(input, entries);
    for (const type of [
      "INVALID_LEAVE_STATUS",
      "INVALID_COMP_OFF_STATUS",
      "INVALID_HOLIDAY_STATUS",
      "INVALID_UNASSIGNED_STATUS",
      "INVALID_NON_WORKING_DAY_STATUS",
      "INVALID_NOT_SCHEDULED_STATUS",
    ]) {
      assert.equal(vIssues(result, type).length, 1, type);
    }
  });

  it("detects duplicate process, working without process, unauthorised process, closed process and process on non-working entry", () => {
    const { input, entries } = generated();
    Object.assign(find(entries, "E4", "2026-11-03"), { status: "WORKING", processes: ["P2", "P2"] });
    Object.assign(find(entries, "E4", "2026-11-04"), { status: "WORKING", processes: [] });
    Object.assign(find(entries, "E4", "2026-11-05"), { status: "WORKING", processes: ["P2", "P1"] });
    Object.assign(find(entries, "E4", "2026-11-08"), { status: "WORKING", processes: ["P2"] }); // Sunday
    Object.assign(find(entries, "E4", "2026-11-10"), { status: "WEEKLY_OFF", processes: ["P2"] });
    Object.assign(find(entries, "E4", "2026-11-12"), { status: "WORKING", processes: ["NOPE"] });
    const result = validate(input, entries);
    assert.equal(vIssues(result, "DUPLICATE_PROCESS").length, 1);
    assert.equal(vIssues(result, "WORKING_WITHOUT_PROCESS").length, 1);
    assert.equal(vIssues(result, "UNAUTHORISED_PROCESS_ASSIGNMENT").length, 1);
    assert.equal(vIssues(result, "PROCESS_NOT_OPERATING").length, 1);
    assert.equal(vIssues(result, "PROCESS_ON_NON_WORKING_DAY").length, 1);
    assert.equal(vIssues(result, "PROCESS_NOT_FOUND").length, 1);
  });

  it("detects duplicate entries, entries outside the month, bogus statuses, inactive and deleted employees", () => {
    const { input, entries } = generated();
    entries.push({ ...find(entries, "E2", "2026-11-03") });
    entries.push({ rosterMonth: M, employee: "E2", date: "2026-12-01", status: "WORKING", processes: ["P1"] });
    Object.assign(find(entries, "E3", "2026-11-07"), { status: "PARTY", processes: [] });
    entries.push({ rosterMonth: M, employee: "E9", date: "2026-11-03", status: "WORKING", processes: ["P1"] });
    entries.push({ rosterMonth: M, employee: "DELETED", date: "2026-11-03", status: "WORKING", processes: ["P1"] });
    const result = validate(input, entries);
    assert.equal(vIssues(result, "DUPLICATE_ROSTER_ENTRY").length, 1);
    assert.equal(vIssues(result, "ENTRY_OUTSIDE_ROSTER_MONTH").length, 1);
    assert.equal(vIssues(result, "INVALID_STATUS").length, 1);
    assert.equal(vIssues(result, "INACTIVE_EMPLOYEE").length, 1);
    assert.equal(vIssues(result, "EMPLOYEE_NOT_FOUND").length, 1);
  });

  it("warns (without blocking) about 7 working days in a week", () => {
    const input = scenario({ employees: [emp("E1")], processes: [proc("P1", "B1", "ALL_365")], assign: [["E1", "P1"]] });
    const plan = generateRosterPlan(input);
    const result = validateRosterPlan({ ...input, entries: plan.entries });
    assert.equal(vIssues(result, "WEEKLY_OFF_MISSING").length, FULL_WEEKS.length);
    assert.ok(vIssues(result, "MAX_CONSECUTIVE_DAYS_EXCEEDED").length >= 1);
    assert.equal(result.isValid, true);
    assert.ok(vIssues(result, "WEEKLY_OFF_MISSING").every((w) => w.stage === "VALIDATION"));
  });

  it("a generated WEEKLY_OFF does not need to match a FIXED rule", () => {
    const input = threeStaffMinTwo({ rules: [["E1", 0, "FIXED"]] });
    const plan = generateRosterPlan(input);
    const result = validateRosterPlan({ ...input, entries: plan.entries });
    assert.equal(result.isValid, true);
  });
});

// ---------------------------------------------------------------------------
// Change handling
// ---------------------------------------------------------------------------

describe("change handling (leave impact)", () => {
  it("a new leave on a single-person brand shows only the new gaps, with replacements", () => {
    const input = scenario({
      employees: [emp("E1"), emp("E2")],
      processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY"), proc("P2", "B2", "NO_SUN_NO_HOLIDAY", 0), proc("P3", "B3", "NO_SUN_NO_HOLIDAY")],
      assign: [["E1", "P1"], ["E2", "P2"]],
    });
    const result = analyzeLeaveImpact(input, { employee: "E1", startDate: "2026-11-10", endDate: "2026-11-11", type: "LEAVE" });
    assert.equal(result.coverageGapCreated, true);
    assert.deepEqual(result.newConflicts.map((c) => c.date), ["2026-11-10", "2026-11-11"]);
    assert.ok(result.newConflicts.every((c) => c.type === "INSUFFICIENT_STAFF" && c.process === "P1"));
    // existing NO_ASSIGNED_EMPLOYEE for P3 is not re-reported
    assert.equal(result.newConflicts.filter((c) => c.type === "NO_ASSIGNED_EMPLOYEE").length, 0);
    assert.ok(result.replacements.length === 2 && result.replacements[0].suggestions.length >= 1);
    assert.equal(result.coverageEvaluation.every((e) => e.canMaintain === false), true);
  });

  it("a leave absorbed by a 3-person team shows no gap", () => {
    const result = analyzeLeaveImpact(threeStaffMinTwo(), { employee: "E2", startDate: "2026-11-17", endDate: "2026-11-18", type: "COMP_OFF" });
    assert.equal(result.coverageGapCreated, false);
    assert.equal(result.newConflicts.length, 0);
    assert.ok(result.coverageEvaluation.length === 2 && result.coverageEvaluation.every((e) => e.canMaintain));
  });

  it("flags a leave that creates gaps across multiple brands", () => {
    const input = scenario({
      employees: [emp("E1"), emp("E2")],
      processes: [proc("P1", "B1", "NO_SUN_NO_HOLIDAY"), proc("P2", "B2", "NO_SUN_NO_HOLIDAY"), proc("P3", "B3", "NO_SUN_NO_HOLIDAY", 0)],
      assign: [["E1", "P1"], ["E1", "P2"], ["E2", "P3"]],
    });
    const result = analyzeLeaveImpact(input, { employee: "E1", startDate: "2026-11-12", endDate: "2026-11-12" });
    assert.equal(result.multiBrandImpact, true);
    assert.deepEqual(result.affectedBrands, ["Brand B1", "Brand B2"]);
    assert.equal(result.newWarnings.filter((w) => w.type === "MULTI_BRAND_GAP").length, 1);
  });

  it("rejects invalid leave input", () => {
    const input = threeStaffMinTwo();
    assert.throws(() => analyzeLeaveImpact(input, { employee: "NOPE", startDate: "2026-11-01", endDate: "2026-11-01" }), /not found/);
    assert.throws(() => analyzeLeaveImpact(input, { employee: "E1", startDate: "2026-11-05", endDate: "2026-11-01" }), /before/);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers kept for the legacy service API
// ---------------------------------------------------------------------------

describe("availability and required-staff helpers", () => {
  const employee = { _id: "E1", active: true, preferredOffDay: 3 };
  it("applies inactive > leave > FIXED off > available", () => {
    assert.equal(resolveAvailability({ employee: { ...employee, active: false }, date: "2026-11-04" }).reason, "INACTIVE_EMPLOYEE");
    const leaves = [{ employee: "E1", startDate: "2026-11-01", endDate: "2026-11-30", type: "COMP_OFF", status: "APPROVED" }];
    const rules = [{ employee: "E1", weekday: 3, type: "FIXED" }];
    assert.equal(resolveAvailability({ employee, date: "2026-11-04", leaves, weeklyOffRules: rules }).reason, "COMP_OFF");
    assert.equal(resolveAvailability({ employee, date: "2026-11-04", weeklyOffRules: rules }).reason, "FIXED_WEEKLY_OFF");
    const preferred = resolveAvailability({ employee, date: "2026-11-04" });
    assert.equal(preferred.available, true);
    assert.equal(preferred.preferredOff, true);
  });
  it("returns 0 required on closed days", () => {
    assert.equal(resolveRequiredStaff({ process: { _id: "P1", calendarType: "NO_SUN_NO_HOLIDAY", minStaff: 2 }, date: "2026-11-01" }), 0);
  });
});

// ---------------------------------------------------------------------------
// Views and export (assessment: company/pod/brand/process/employee views, CSV)
// ---------------------------------------------------------------------------

describe("views and export", () => {
  it("builds views for every level and a CSV export", () => {
    const plan = generateRosterPlan(seedInput("2026-12"));
    const views = plan.views;
    assert.equal(views.employees.length, plan._ctx.activeEmployeeIds.length);
    assert.ok(views.pods.length >= 5);
    assert.ok(views.brands.some((b) => b.resourcePattern === "SINGLE_RESOURCE"));
    assert.ok(views.brands.some((b) => b.resourcePattern === "MULTI_RESOURCE"));
    assert.equal(views.processes[0].days.length, 31);
    const csv = buildRosterCsv(views);
    assert.equal(csv.split("\n").length, views.employees.length + 1);
    const coverageCsv = buildRosterCsv(views, { view: "coverage" });
    assert.equal(coverageCsv.split("\n").length, views.processes.length + 1);
  });
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------

const syntheticInput = (employeeCount, processCount, month = "2026-11") => {
  const employees = Array.from({ length: employeeCount }, (_, i) => emp(`E${String(i).padStart(3, "0")}`, { pod: `POD${i % 5}`, preferredOffDay: i % 7 }));
  const calendars = ["ALL_365", "EXCEPT_HOLIDAYS", "NO_SUN_NO_HOLIDAY"];
  const processes = Array.from({ length: processCount }, (_, i) =>
    proc(`P${String(i).padStart(3, "0")}`, `B${Math.floor(i / 2)}`, calendars[i % 3], i % 7 === 0 ? 2 : 1, i % 2 ? "ACC" : "CS")
  );
  const assign = [];
  processes.forEach((p, i) => {
    assign.push([employees[i % employeeCount]._id, p._id]);
    if (i % 3 === 0) assign.push([employees[(i + 1) % employeeCount]._id, p._id]);
    if (i % 7 === 0) assign.push([employees[(i + 2) % employeeCount]._id, p._id]);
  });
  return scenario({
    month,
    employees,
    processes,
    assign,
    holidays: [`${month}-11`],
    leaves: [[employees[1]._id, `${month}-05`, `${month}-07`]],
    pods: Array.from({ length: 5 }, (_, i) => ({ _id: `POD${i}`, name: `Pod ${i}` })),
  });
};

describe("robustness", () => {
  it("same input gives identical output", () => {
    const input = seedInput("2026-12");
    assert.equal(JSON.stringify(publicPlan(generateRosterPlan(input))), JSON.stringify(publicPlan(generateRosterPlan(input))));
  });

  it("empty data does not crash", () => {
    const plan = generateRosterPlan({ month: M });
    assert.equal(plan.entries.length, 0);
    const result = validateRosterPlan({ month: M, entries: [] });
    assert.equal(result.isValid, true);
  });

  it("40 employees x 30 processes and 100 employees x 60 processes generate and validate quickly", () => {
    for (const [e, p] of [[40, 30], [100, 60]]) {
      const input = syntheticInput(e, p);
      const started = performance.now();
      const plan = generateRosterPlan(input);
      const result = validateRosterPlan({ ...input, entries: plan.entries });
      const elapsed = performance.now() - started;
      assert.ok(elapsed < 5000, `${e}x${p} took ${elapsed}ms`);
      assert.equal(plan.entries.length, e * 30);
      // Generation and validation agree on coverage errors.
      const gen = plan.conflicts.filter((c) => c.type === "INSUFFICIENT_STAFF").length;
      const val = result.errors.filter((c) => c.type === "INSUFFICIENT_STAFF").length;
      assert.equal(gen, val);
    }
  });

  it("seed dataset: several months generate, validate consistently, and every run over 6 days is reported", () => {
    for (const month of ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]) {
      const input = seedInput(month);
      const plan = generateRosterPlan(input);
      const result = validateRosterPlan({ ...input, entries: plan.entries });
      const genGaps = plan.conflicts.filter((c) => c.type === "INSUFFICIENT_STAFF" || c.type === "NO_ASSIGNED_EMPLOYEE").length;
      const valGaps = result.errors.filter((c) => c.type === "INSUFFICIENT_STAFF" || c.type === "NO_ASSIGNED_EMPLOYEE").length;
      assert.equal(genGaps, valGaps, month);
      const integrityErrors = result.errors.filter((c) => !["INSUFFICIENT_STAFF", "NO_ASSIGNED_EMPLOYEE", "UNSUPPORTED_CALENDAR_TYPE"].includes(c.type));
      assert.equal(integrityErrors.length, 0, `${month}: ${JSON.stringify(integrityErrors.slice(0, 2))}`);
      for (const employee of plan._ctx.activeEmployeeIds) {
        const longRuns = findWorkingRuns(plan._grid.get(employee), 7);
        if (!longRuns.length) continue;
        const reported = ofType(plan, "MAX_CONSECUTIVE_DAYS_EXCEEDED").filter((w) => w.employee === employee);
        assert.equal(reported.length, longRuns.length, `${month} ${employee}`);
      }
    }
  });
});
