// Builds a plain engine input from the sample dataset embedded in
// scripts/seedSampleData.js, without connecting to MongoDB.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export const loadSeedData = () => {
  const source = readFileSync(path.join(here, "../../scripts/seedSampleData.js"), "utf8");
  const match = source.match(/const sampleData = (\{[\s\S]*?\n\});/);
  if (!match) throw new Error("sampleData block not found in seedSampleData.js");
  return JSON.parse(match[1].replace(/;$/, ""));
};

export const seedInput = (month) => {
  const data = loadSeedData();
  const podIdByName = new Map(data.pods.map((pod) => [pod.pod_name, `POD:${pod.pod_name}`]));
  return {
    month,
    pods: data.pods.map((pod) => ({ _id: podIdByName.get(pod.pod_name), name: pod.pod_name, lead: pod.pod_lead_employee_code })),
    employees: data.employees.map((e) => ({
      _id: e.employee_code,
      name: e.name,
      pod: podIdByName.get(e.pod_name) || null,
      role: e.role,
      active: e.active,
      preferredOffDay: e.preferredOffDay_number,
    })),
    brands: data.brands.map((b) => ({ _id: b.brand_code, name: b.brand_name })),
    processes: data.processes.map((p) => ({
      _id: p.process_code,
      brand: p.brand_code,
      type: p.process_type,
      calendarType: p.calendarType,
      minStaff: p.minStaff,
    })),
    assignments: data.assignments.map((a) => ({ employee: a.employee_code, process: a.process_code, isPrimary: a.isPrimary })),
    weeklyOffRules: data.weeklyOffRules.map((r) => ({ employee: r.employee_code, weekday: r.weekday, type: r.type })),
    holidays: data.holidays,
    leaves: data.leaves.map((l) => ({ ...l, employee: l.employee_code })),
    coverageOverrides: data.coverageOverrides.map((o) => ({
      process: o.process_code,
      date: o.date || undefined,
      weekday: o.weekday ?? undefined,
      minStaff: o.minStaff,
    })),
    manualEntries: [],
  };
};
