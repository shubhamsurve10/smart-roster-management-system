
import { createFileRoute } from "@tanstack/react-router";
import { idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { CrudPage } from "@/components/CrudPage";
import { useAuth } from "@/context/AuthContext";
import { refLabel, useList, WEEKDAYS } from "@/lib/resources";

export const Route = createFileRoute("/weekly-off-rules")({
  head: () => ({
    meta: [
      { title: "Weekly Off Rules | Smart Roster" },
      {
        name: "description",
        content: "Fixed and preferred weekly offs per employee.",
      },
      { property: "og:title", content: "Weekly Off Rules | Smart Roster" },
      {
        property: "og:description",
        content: "Fixed and preferred weekly offs per employee.",
      },
    ],
  }),
  component: WeeklyOffPage,
});

const ADMIN_TYPES = [
  { value: "FIXED", label: "Fixed" },
  { value: "PREFERRED", label: "Preferred" },
];

const POD_LEAD_TYPES = [
  { value: "PREFERRED", label: "Preferred" },
];

function WeeklyOffPage() {
  const { user } = useAuth();

  const isAdmin = user?.role === "admin";
  const isPodLead = user?.role === "pod_lead";

  // Backend returns only employees belonging to the Pod Lead's pod.
  const emps = useList(ENDPOINTS.employees, undefined, isAdmin || isPodLead);

  const empOpts = emps.items.map((e) => ({
    value: e._id,
    label: e.name,
  }));

  return (
    <CrudPage
      title="Weekly Off Rules"
      singular="Rule"
      endpoint={ENDPOINTS.weeklyOffRules}
      canCreate={isAdmin || isPodLead}
      description={
        isPodLead
          ? "Add or change preferred weekly offs for employees in your pod. Fixed weekly offs are controlled by Admin."
          : "Fixed offs are never worked; preferred offs are honoured when staffing allows."
      }
      fields={[
        {
          name: "employee",
          label: "Employee",
          type: "select",
          options: empOpts,
          required: true,
        },
        {
          name: "weekday",
          label: "Weekday",
          type: "select",
          options: WEEKDAYS.map((d, i) => ({
            value: String(i),
            label: d,
          })),
          required: true,
        },
        {
          name: "type",
          label: "Type",
          type: "select",
          options: isPodLead ? POD_LEAD_TYPES : ADMIN_TYPES,
          required: true,
        },
      ]}
      toForm={(r) => ({
        employee: idOf(r?.employee),
        weekday: r?.weekday == null ? "" : String(r.weekday),
        type: r?.type ?? (isPodLead ? "PREFERRED" : "FIXED"),
      })}
      toPayload={(f) => ({
        employee: f.employee,
        weekday: Number(f.weekday),
        type: isPodLead ? "PREFERRED" : f.type,
      })}
      searchText={(r) => refLabel(r.employee, emps.items)}
      filters={[
        {
          key: "employee",
          label: "Employees",
          options: empOpts,
          match: (r, v) => idOf(r.employee) === v,
        },
        {
          key: "type",
          label: "Types",
          options: isPodLead ? POD_LEAD_TYPES : ADMIN_TYPES,
          match: (r, v) => r.type === v,
        },
      ]}
      columns={[
        {
          header: "Employee",
          render: (r) => (
            <span className="font-medium">
              {refLabel(r.employee, emps.items)}
            </span>
          ),
        },
        {
          header: "Weekday",
          render: (r) => WEEKDAYS[r.weekday] ?? "—",
        },
        {
          header: "Type",
          render: (r) => r.type,
        },
      ]}
    />
  );
}
