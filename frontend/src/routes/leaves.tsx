
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import api, { getErrorMessage, idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { CrudPage } from "@/components/CrudPage";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, refLabel, toDateInput, useList } from "@/lib/resources";

export const Route = createFileRoute("/leaves")({
  head: () => ({
    meta: [
      { title: "Leaves | Smart Roster" },
      { name: "description", content: "Leave and comp-off requests." },
      { property: "og:title", content: "Leaves | Smart Roster" },
      { property: "og:description", content: "Leave and comp-off requests." },
    ],
  }),
  component: LeavesPage,
});

const TYPES = [
  { value: "LEAVE", label: "Leave" },
  { value: "COMP_OFF", label: "Comp-off" },
];

const STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

function LeavesPage() {
  const { user } = useAuth();

  const isAdmin = user?.role === "admin";

  // Only admins need the employee directory.
  // Agents and pod leads submit requests for themselves.
  const emps = useList(ENDPOINTS.employees, undefined, isAdmin);

  const empOpts = emps.items.map((e) => ({
    value: e._id,
    label: e.name,
  }));

  async function reviewRequest(
    id: string,
    status: "APPROVED" | "REJECTED",
    reload: () => void,
  ) {
    try {
      await api.patch(`${ENDPOINTS.leaves}/${id}/status`, { status });

      toast.success(
        status === "APPROVED"
          ? "Leave request approved"
          : "Leave request rejected",
      );

      reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <CrudPage
      title="Leaves"
      singular="Leave request"
      endpoint={ENDPOINTS.leaves}
      canCreate={true}
      description="Submit leave and comp-off requests. Only approved requests affect roster generation."
      fields={[
        ...(isAdmin
          ? [
              {
                name: "employee",
                label: "Employee",
                type: "select" as const,
                options: empOpts,
                required: true,
              },
            ]
          : []),

        {
          name: "startDate",
          label: "Start date",
          type: "date",
          required: true,
        },
        {
          name: "endDate",
          label: "End date",
          type: "date",
          required: true,
        },
        {
          name: "type",
          label: "Type",
          type: "select",
          options: TYPES,
          required: true,
        },
      ]}
      validate={(f) =>
        f.endDate < f.startDate
          ? "End date must be on or after start date"
          : null
      }
      toForm={(r) => ({
        employee: idOf(r?.employee),
        startDate: toDateInput(r?.startDate),
        endDate: toDateInput(r?.endDate),
        type: r?.type ?? "LEAVE",
      })}
      toPayload={(f) => ({
        ...(isAdmin ? { employee: f.employee } : {}),
        startDate: f.startDate,
        endDate: f.endDate,
        type: f.type,
      })}
      searchText={(r) =>
        isAdmin ? refLabel(r.employee, emps.items) : `${r.type ?? ""}`
      }
      filters={[
        ...(isAdmin
          ? [
              {
                key: "employee",
                label: "Employees",
                options: empOpts,
                match: (r: any, v: string) => idOf(r.employee) === v,
              },
            ]
          : []),
        {
          key: "status",
          label: "Statuses",
          options: STATUSES,
          match: (r: any, v: string) => r.status === v,
        },
      ]}
      columns={[
        ...(isAdmin
          ? [
              {
                header: "Employee",
                render: (r: any) => (
                  <span className="font-medium">
                    {refLabel(r.employee, emps.items)}
                  </span>
                ),
              },
            ]
          : []),
        {
          header: "From",
          render: (r: any) => fmtDate(r.startDate),
        },
        {
          header: "To",
          render: (r: any) => fmtDate(r.endDate),
        },
        {
          header: "Type",
          render: (r: any) => <StatusBadge value={r.type} />,
        },
        {
          header: "Status",
          render: (r: any) => <StatusBadge value={r.status} />,
        },
      ]}
      rowActions={(r, reload) =>
  isAdmin && r.status === "PENDING" ? (
    <div className="inline-flex items-center gap-2">
      <Button
        size="sm"
        onClick={() => reviewRequest(r._id, "APPROVED", reload)}
      >
        Approve
      </Button>

      <Button
        size="sm"
        variant="destructive"
        onClick={() => reviewRequest(r._id, "REJECTED", reload)}
      >
        Reject
      </Button>
    </div>
  ) : null
}
    />
  );
}
