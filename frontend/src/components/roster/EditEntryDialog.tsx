import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { getErrorMessage, idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROSTER_STATUSES } from "@/lib/options";
import { fmtDate, type Rec } from "@/lib/resources";

export type CellTarget = {
  employee: Rec;
  date: string;
  entry?: Rec;
  processId?: string;
};

const EDITABLE_STATUSES = Array.from(new Set([
  ...ROSTER_STATUSES,
  "UNASSIGNED",
  "NON_WORKING_DAY",
  "NOT_SCHEDULED",
]));

type ProcessOption = {
  value: string;
  label: string;
  assigned: boolean;
};

export function EditEntryDialog({
  target,
  roster,
  processOptions,
  onClose,
  onSaved,
}: {
  target: CellTarget | null;
  roster: Rec;
  processOptions: (employeeId: string) => ProcessOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState("WORKING");
  const [processes, setProcesses] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;

    setStatus(target.entry?.status ?? "WORKING");

    const existingProcesses = (target.entry?.processes ?? []).map(idOf);
    setProcesses(
      existingProcesses.length > 0
        ? existingProcesses
        : target.processId
          ? [target.processId]
          : [],
    );
  }, [target]);

  if (!target) return null;

  // The backend rejects processes that are not assigned to this employee.
  const options = processOptions(target.employee._id).filter(
    (option) => option.assigned,
  );

  async function save() {
    if (!target) return;

    if (status === "WORKING" && processes.length === 0) {
      toast.error("Select at least one assigned process for a working day.");
      return;
    }

    setSaving(true);
    const body = {
      status,
      processes: status === "WORKING" ? processes : [],
      isManual: true,
    };

    try {
      if (target.entry) {
        await api.patch(
          `${ENDPOINTS.rosterEntries}/${target.entry._id}`,
          body,
        );
      } else {
        // RosterEntry.rosterMonth is YYYY-MM, not the Roster MongoDB ID.
        await api.post(ENDPOINTS.rosterEntries, {
          ...body,
          rosterMonth: roster.month,
          employee: target.employee._id,
          date: target.date,
        });
      }

      toast.success("Roster entry saved. Re-validate before publishing.");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target.employee.name} · {fmtDate(target.date)}
          </DialogTitle>
        </DialogHeader>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Status</span>
          <select
            className="field"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {EDITABLE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        {status === "WORKING" && (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Assigned processes
            </span>
            {options.length === 0 ? (
              <p className="text-sm text-destructive">
                This employee has no assigned processes. A WORKING entry cannot
                be saved until an assignment exists.
              </p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {options.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={processes.includes(option.value)}
                      onChange={(event) =>
                        setProcesses((current) =>
                          event.target.checked
                            ? [...current, option.value]
                            : current.filter((id) => id !== option.value),
                        )
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={
              saving ||
              (status === "WORKING" &&
                (options.length === 0 || processes.length === 0))
            }
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
