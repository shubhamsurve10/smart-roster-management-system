import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import api, { getErrorMessage, idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { CrudPage } from "@/components/CrudPage";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { refLabel, useList, WEEKDAYS } from "@/lib/resources";

export const Route = createFileRoute("/weekly-off-rules")({
  head: () => ({
    meta: [
      { title: "Weekly Off Rules | Smart Roster" },
      {
        name: "description",
        content: "Fixed and preferred weekly offs per employee.",
      },
    ],
  }),
  component: WeeklyOffPage,
});
const TYPES = [
  { value: "FIXED", label: "Fixed" },
  { value: "PREFERRED", label: "Preferred" },
];

function WeeklyOffPage() {
  const { user } = useAuth();
  const emps = useList(ENDPOINTS.employees);
  const rules = useList(ENDPOINTS.weeklyOffRules);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [weekday, setWeekday] = useState("");
  const [saving, setSaving] = useState(false);
  const empOpts = useMemo(
    () => emps.items.map((e) => ({ value: e._id, label: e.name })),
    [emps.items],
  );
  const employeeId =
    user?.role === "agent" ? user.employee || user.id : selectedEmployee;
  const selectedRules = rules.items.filter(
    (r) => idOf(r.employee) === employeeId,
  );
  const fixed = selectedRules.find((r) => r.type === "FIXED");
  const preferred = selectedRules.find((r) => r.type === "PREFERRED");

  async function savePreference() {
    if (!employeeId || weekday === "") {
      toast.error("Select an employee and preferred weekday");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`${ENDPOINTS.weeklyOffRules}/preferred`, {
        employee: employeeId,
        weekday: Number(weekday),
      });
      toast.success(
        "Preferred weekly off saved. It applies to future roster generation.",
      );
      setWeekday("");
      await rules.reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (user?.role === "admin") {
    return (
      <CrudPage
        title="Weekly Off Rules"
        singular="Rule"
        endpoint={ENDPOINTS.weeklyOffRules}
        description="Admin manages fixed weekly offs. Preferred weekly offs are replaceable and are used when staffing allows."
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
            options: WEEKDAYS.map((d, i) => ({ value: String(i), label: d })),
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
        toForm={(r) => ({
          employee: idOf(r?.employee),
          weekday: r?.weekday == null ? "" : String(r.weekday),
          type: r?.type ?? "FIXED",
        })}
        toPayload={(form) => ({
          employee: form.employee,
          weekday: Number(form.weekday),
          type: form.type,
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
            options: TYPES,
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
          { header: "Weekday", render: (r) => WEEKDAYS[r.weekday] ?? "—" },
          { header: "Type", render: (r) => r.type },
        ]}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Weekly Off Rules</h1>
        <p className="text-sm text-muted-foreground">
          Pod Leads can manage preferred days for their pod. Employees can
          change their own preference. Fixed weekly offs are Admin-controlled.
        </p>
      </div>
      {user?.role === "pod_lead" && (
        <label className="block max-w-md space-y-1">
          <span className="text-sm font-medium">Employee</span>
          <select
            className="field"
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
          >
            <option value="">Select employee</option>
            {empOpts.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {user?.role === "agent" || selectedEmployee ? (
        <div className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              Fixed weekly off
            </span>
            <strong>
              {fixed ? WEEKDAYS[fixed.weekday] : "Not set"} · Admin controlled
            </strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              Current preferred day
            </span>
            <strong>
              {preferred ? WEEKDAYS[preferred.weekday] : "Not set"}
            </strong>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              New preferred weekly off
            </span>
            <select
              className="field"
              value={weekday}
              onChange={(e) => setWeekday(e.target.value)}
            >
              <option value="">Choose a weekday</option>
              {WEEKDAYS.map((day, i) => (
                <option key={day} value={i} disabled={fixed?.weekday === i}>
                  {day}
                  {fixed?.weekday === i ? " (fixed)" : ""}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={savePreference}
            disabled={saving || !employeeId || weekday === ""}
          >
            {saving ? "Saving…" : "Save preferred day"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Saving replaces the previous preference. It does not modify an
            already generated or published roster.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select an employee to manage their preferred weekly off.
        </p>
      )}
    </div>
  );
}
