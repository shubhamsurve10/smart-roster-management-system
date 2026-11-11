import { createFileRoute } from "@tanstack/react-router";
import { idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { CrudPage } from "@/components/CrudPage";
import { refLabel, useList, WEEKDAYS } from "@/lib/resources";

export const Route = createFileRoute("/weekly-off-rules")({
  head: () => ({
    meta: [
      { title: "Weekly Off Rules | Smart Roster" },
      { name: "description", content: "Fixed and preferred weekly offs per employee." },
      { property: "og:title", content: "Weekly Off Rules | Smart Roster" },
      { property: "og:description", content: "Fixed and preferred weekly offs per employee." },
    ],
  }),
  component: WeeklyOffPage,
});

const TYPES = [{ value: "FIXED", label: "Fixed" }, { value: "PREFERRED", label: "Preferred" }];

function WeeklyOffPage() {
  const emps = useList(ENDPOINTS.employees);
  const empOpts = emps.items.map((e) => ({ value: e._id, label: e.name }));
  return (
    <CrudPage
      title="Weekly Off Rules" singular="Rule" endpoint={ENDPOINTS.weeklyOffRules}
      description="Fixed offs are never worked; preferred offs are honoured when staffing allows."
      fields={[
        { name: "employee", label: "Employee", type: "select", options: empOpts, required: true },
        { name: "weekday", label: "Weekday", type: "select", options: WEEKDAYS.map((d, i) => ({ value: String(i), label: d })), required: true },
        { name: "type", label: "Type", type: "select", options: TYPES, required: true },
      ]}
      toForm={(r) => ({ employee: idOf(r?.employee), weekday: r?.weekday == null ? "" : String(r.weekday), type: r?.type ?? "FIXED" })}
      toPayload={(f) => ({ employee: f.employee, weekday: Number(f.weekday), type: f.type })}
      searchText={(r) => refLabel(r.employee, emps.items)}
      filters={[
        { key: "employee", label: "Employees", options: empOpts, match: (r, v) => idOf(r.employee) === v },
        { key: "type", label: "Types", options: TYPES, match: (r, v) => r.type === v },
      ]}
      columns={[
        { header: "Employee", render: (r) => <span className="font-medium">{refLabel(r.employee, emps.items)}</span> },
        { header: "Weekday", render: (r) => WEEKDAYS[r.weekday] ?? "—" },
        { header: "Type", render: (r) => r.type },
      ]}
    />
  );
}
