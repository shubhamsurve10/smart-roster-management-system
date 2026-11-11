import { createFileRoute } from "@tanstack/react-router";
import { idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { CrudPage } from "@/components/CrudPage";
import { fmtDate, processLabel, toDateInput, useList, WEEKDAYS } from "@/lib/resources";

export const Route = createFileRoute("/coverage-overrides")({
  head: () => ({
    meta: [
      { title: "Coverage Overrides | Smart Roster" },
      { name: "description", content: "Date or weekday specific minimum staffing." },
      { property: "og:title", content: "Coverage Overrides | Smart Roster" },
      { property: "og:description", content: "Date or weekday specific minimum staffing." },
    ],
  }),
  component: OverridesPage,
});

function OverridesPage() {
  const procs = useList(ENDPOINTS.processes);
  const brands = useList(ENDPOINTS.brands);
  const procOpts = procs.items.map((p) => ({ value: p._id, label: processLabel(p, procs.items, brands.items) }));
  return (
    <CrudPage
      title="Coverage Overrides" singular="Override" endpoint={ENDPOINTS.coverageOverrides}
      description="A date-specific override takes priority over a weekday override."
      fields={[
        { name: "process", label: "Process", type: "select", options: procOpts, required: true },
        { name: "date", label: "Specific date", type: "date", hint: "Fill either a date or a weekday, not both." },
        { name: "weekday", label: "Weekday", type: "select", placeholder: "— None —",
          options: WEEKDAYS.map((d, i) => ({ value: String(i), label: d })) },
        { name: "minStaff", label: "Minimum staff", type: "number", required: true },
      ]}
      validate={(f) => {
        if (!f.date && f.weekday === "") return "Choose a specific date or a weekday";
        if (f.date && f.weekday !== "") return "Choose either a date or a weekday, not both";
        return null;
      }}
      toForm={(r) => ({
        process: idOf(r?.process), date: toDateInput(r?.date),
        weekday: r?.weekday == null ? "" : String(r.weekday), minStaff: r?.minStaff ?? 1,
      })}
      toPayload={(f) => ({
        process: f.process, minStaff: Number(f.minStaff),
        date: f.date || null, weekday: f.weekday === "" ? null : Number(f.weekday),
      })}
      filters={[{ key: "process", label: "Processes", options: procOpts, match: (r, v) => idOf(r.process) === v }]}
      columns={[
        { header: "Process", render: (r) => <span className="font-medium">{processLabel(r.process, procs.items, brands.items)}</span> },
        { header: "Applies to", render: (r) => (r.date ? fmtDate(r.date) : r.weekday != null ? `Every ${WEEKDAYS[r.weekday]}` : "—") },
        { header: "Min staff", render: (r) => r.minStaff },
      ]}
    />
  );
}
