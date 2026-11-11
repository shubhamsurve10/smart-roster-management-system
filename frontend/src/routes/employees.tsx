
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Power } from "lucide-react";
import api, { getErrorMessage, idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { CrudPage } from "@/components/CrudPage";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { refLabel, useList, WEEKDAYS } from "@/lib/resources";

export const Route = createFileRoute("/employees")({
  head: () => ({
    meta: [
      { title: "Employees | Smart Roster" },
      {
        name: "description",
        content: "Manage employees, pods, roles and preferred off-days.",
      },
      { property: "og:title", content: "Employees | Smart Roster" },
      {
        property: "og:description",
        content: "Manage employees, pods, roles and preferred off-days.",
      },
    ],
  }),
  component: EmployeesPage,
});

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "agent", label: "Agent" },
  { value: "pod_lead", label: "Pod lead" },
];

const dayOpts = WEEKDAYS.map((d, i) => ({
  value: String(i),
  label: d,
}));

function EmployeesPage() {
  const pods = useList(ENDPOINTS.pods);

  const podOpts = pods.items.map((p) => ({
    value: p._id,
    label: p.name,
  }));

  return (
    <CrudPage
      title="Employees"
      singular="Employee"
      endpoint={ENDPOINTS.employees}
      description="Manage employees, pods, roles and preferred off-days."
      fields={[
        {
          name: "name",
          label: "Name",
          type: "text",
          required: true,
        },
        {
          name: "email",
          label: "Email",
          type: "email",
          required: true,
          createOnly: true,
          placeholder: "employee@example.com",
        },
        {
          name: "password",
          label: "Temporary Password",
          type: "password",
          required: true,
          createOnly: true,
          hint: "Provide a temporary password for the employee to log in.",
        },
        {
          name: "pod",
          label: "Pod",
          type: "select",
          options: podOpts,
          placeholder: "— No pod —",
        },
        {
          name: "role",
          label: "Role",
          type: "select",
          options: ROLES,
          required: true,
        },
        {
          name: "preferredOffDay",
          label: "Preferred off-day",
          type: "select",
          options: dayOpts,
          placeholder: "— None —",
        },
        {
          name: "active",
          label: "Active",
          type: "checkbox",
        },
      ]}
      toForm={(r) => ({
        name: r?.name ?? "",
        email: "",
        password: "",
        pod: idOf(r?.pod),
        role: r?.role ?? "agent",
        preferredOffDay:
          r?.preferredOffDay == null
            ? ""
            : String(r.preferredOffDay),
        active: r?.active ?? true,
      })}
      toPayload={(f) => ({
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        password: f.password,
        pod: f.pod || null,
        role: f.role,
        active: !!f.active,
        preferredOffDay:
          f.preferredOffDay === ""
            ? null
            : Number(f.preferredOffDay),
      })}
      searchText={(r) => r.name ?? ""}
      filters={[
        {
          key: "pod",
          label: "Pods",
          options: podOpts,
          match: (r, v) => idOf(r.pod) === v,
        },
        {
          key: "active",
          label: "Statuses",
          options: [
            { value: "1", label: "Active" },
            { value: "0", label: "Inactive" },
          ],
          match: (r, v) =>
            (r.active !== false) === (v === "1"),
        },
      ]}
      columns={[
        {
          header: "Name",
          render: (r) => (
            <span className="font-medium">{r.name}</span>
          ),
        },
        {
          header: "Pod",
          render: (r) => refLabel(r.pod, pods.items),
        },
        {
          header: "Role",
          render: (r) =>
            r.role === "admin"
              ? "Admin"
              : r.role === "pod_lead"
                ? "Pod lead"
                : "Agent",
        },
        {
          header: "Preferred off",
          render: (r) =>
            r.preferredOffDay == null
              ? "—"
              : WEEKDAYS[r.preferredOffDay],
        },
        {
          header: "Status",
          render: (r) => (
            <StatusBadge
              value={r.active === false ? "INACTIVE" : "ACTIVE"}
            />
          ),
        },
      ]}
      rowActions={(r, reload) => (
        <Button
          size="icon"
          variant="ghost"
          aria-label={
            r.active === false ? "Activate" : "Deactivate"
          }
          title={
            r.active === false ? "Activate" : "Deactivate"
          }
          onClick={async () => {
            try {
              await api.put(
                `${ENDPOINTS.employees}/${r._id}`,
                { active: r.active === false }
              );

              toast.success(
                r.active === false
                  ? "Employee activated"
                  : "Employee deactivated"
              );

              reload();
            } catch (e) {
              toast.error(getErrorMessage(e));
            }
          }}
        >
          <Power className="h-4 w-4" />
        </Button>
      )}
    />
  );
}
