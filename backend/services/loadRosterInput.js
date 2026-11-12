// Loads everything the roster engine needs for one month in a single batch of
// parallel queries (.lean(), no per-employee or per-day queries), and converts
// ObjectIds to strings so the engine only sees plain objects.

import Roster from "../models/Roster.js";
import Employee from "../models/Employee.js";
import Pod from "../models/Pod.js";
import Brand from "../models/Brand.js";
import Process from "../models/Process.js";
import Assignment from "../models/Assignment.js";
import WeeklyOffRule from "../models/WeeklyOffRule.js";
import Leave from "../models/Leave.js";
import Holiday from "../models/Holiday.js";
import CoverageOverride from "../models/CoverageOverride.js";
import RosterEntry from "../models/RosterEntry.js";

import { getMonthDates, addDays } from "../engine/dates.js";

const str = (value) => (value === null || value === undefined ? null : String(value));

export const loadRosterInput = async (month, { includeEntries = true } = {}) => {
  const dates = getMonthDates(month); // throws on invalid month
  const start = dates[0];
  const end = dates[dates.length - 1];
  const priorStart = addDays(start, -6);
  const priorEnd = addDays(start, -1);

  const [
    roster,
    employees,
    pods,
    brands,
    processes,
    assignments,
    weeklyOffRules,
    leaves,
    holidays,
    coverageOverrides,
    entries,
    priorEntries,
  ] = await Promise.all([
    Roster.findOne({ month }).lean(),
    // All employees (including inactive) so entries for inactive people can be named.
    Employee.find().select("_id name pod role active preferredOffDay").lean(),
    Pod.find().select("_id name lead").lean(),
    Brand.find().select("_id name").lean(),
    Process.find().select("_id brand type calendarType minStaff").lean(),
    Assignment.find().select("_id employee process isPrimary").lean(),
    WeeklyOffRule.find().select("_id employee weekday type updatedAt").sort({ updatedAt: -1, createdAt: -1 }).lean(),
    Leave.find({ status: "APPROVED", startDate: { $lte: end }, endDate: { $gte: start } })
      .select("_id employee startDate endDate type status")
      .lean(),
    Holiday.find({ date: { $gte: start, $lte: end } }).select("_id date name").lean(),
    CoverageOverride.find({
      $or: [{ date: { $gte: start, $lte: end } }, { weekday: { $type: "number" } }],
    })
      .select("_id process date weekday minStaff")
      .lean(),
    includeEntries
      ? RosterEntry.find({ rosterMonth: month }).select("_id rosterMonth employee date status processes temporaryProcesses isManual").lean()
      : Promise.resolve([]),
    RosterEntry.find({ date: { $gte: priorStart, $lte: priorEnd } }).select("employee date status").lean(),
  ]);

  return {
    month,
    roster: roster ? { _id: str(roster._id), month: roster.month, status: roster.status } : null,
    employees: employees.map((e) => ({
      _id: str(e._id),
      name: e.name,
      pod: str(e.pod),
      role: e.role,
      active: e.active !== false,
      preferredOffDay: e.preferredOffDay ?? null,
    })),
    pods: pods.map((p) => ({ _id: str(p._id), name: p.name, lead: str(p.lead) })),
    brands: brands.map((b) => ({ _id: str(b._id), name: b.name })),
    processes: processes.map((p) => ({
      _id: str(p._id),
      brand: str(p.brand),
      type: p.type,
      calendarType: p.calendarType,
      minStaff: p.minStaff,
    })),
    assignments: assignments.map((a) => ({
      _id: str(a._id),
      employee: str(a.employee),
      process: str(a.process),
      isPrimary: Boolean(a.isPrimary),
    })),
    weeklyOffRules: weeklyOffRules.map((r) => ({ employee: str(r.employee), weekday: r.weekday, type: r.type, updatedAt: r.updatedAt })),
    leaves: leaves.map((l) => ({
      _id: str(l._id),
      employee: str(l.employee),
      startDate: l.startDate,
      endDate: l.endDate,
      type: l.type,
      status: l.status,
    })),
    holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
    coverageOverrides: coverageOverrides.map((o) => ({
      process: str(o.process),
      date: o.date || null,
      weekday: o.weekday ?? null,
      minStaff: o.minStaff,
    })),
    priorEntries: priorEntries.map((entry) => ({ employee: str(entry.employee), date: entry.date, status: entry.status })),
    entries: entries.map((entry) => ({
      _id: str(entry._id),
      rosterMonth: entry.rosterMonth,
      employee: str(entry.employee),
      date: entry.date,
      status: entry.status,
      processes: (entry.processes || []).map(str),
      temporaryProcesses: (entry.temporaryProcesses || []).map(str),
      isManual: Boolean(entry.isManual),
    })),
  };
};
