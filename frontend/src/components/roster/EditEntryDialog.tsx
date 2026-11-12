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
  processAssigned?: boolean;
};

const EDITABLE_STATUSES = Array.from(
  new Set([
    ...ROSTER_STATUSES,
    "UNASSIGNED",
    "NON_WORKING_DAY",
    "NOT_SCHEDULED",
  ]),
);

type ProcessOption = { value: string; label: string; assigned: boolean };

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
  const [temporaryProcesses, setTemporaryProcesses] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;

    setStatus(target.entry?.status ?? "WORKING");

    const existingProcesses = (target.entry?.processes ?? []).map(idOf);
    const existingTemporary = (target.entry?.temporaryProcesses ?? []).map(
      idOf,
    );
    setTemporaryProcesses(existingTemporary);
    const permanentExisting = existingProcesses.filter(
      (id: string) => !existingTemporary.includes(id),
    );
    if (permanentExisting.length || existingTemporary.length) {
      const nextPermanent = [...permanentExisting];
      const nextTemporary = [...existingTemporary];
      if (
        target.processId &&
        !nextPermanent.includes(target.processId) &&
        !nextTemporary.includes(target.processId)
      ) {
        if (target.processAssigned) nextPermanent.push(target.processId);
        else nextTemporary.push(target.processId);
      }
      setProcesses(nextPermanent);
      setTemporaryProcesses(nextTemporary);
    } else if (target.processId) {
      if (target.processAssigned) {
        setProcesses([target.processId]);
        setTemporaryProcesses([]);
      } else {
        setProcesses([]);
        setTemporaryProcesses([target.processId]);
      }
    } else {
      setProcesses([]);
      setTemporaryProcesses([]);
    }
  }, [target]);

  if (!target) return null;

  const options = processOptions(target.employee._id);
  const permanentOptions = options.filter((option) => option.assigned);
  const temporaryOptions = options.filter((option) => !option.assigned);

  async function save() {
    if (!target) return;

    if (
      status === "WORKING" &&
      processes.length + temporaryProcesses.length === 0
    ) {
      toast.error(
        "Select at least one permanent or temporary process for this day.",
      );
      return;
    }

    setSaving(true);
    const body = {
      status,
      processes: status === "WORKING" ? processes : [],
      temporaryProcesses: status === "WORKING" ? temporaryProcesses : [],
      isManual: true,
    };

    try {
      if (target.entry) {
        await api.patch(`${ENDPOINTS.rosterEntries}/${target.entry._id}`, body);
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
              Work allocation for this date
            </span>
            {options.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No process options available.
              </p>
            ) : (
              <div className="max-h-56 space-y-3 overflow-y-auto">
                {permanentOptions.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      Permanent assignments
                    </p>
                    {permanentOptions.map((option) => (
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
                {temporaryOptions.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      Temporary — this date only
                    </p>
                    {temporaryOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={temporaryProcesses.includes(option.value)}
                          onChange={(event) =>
                            setTemporaryProcesses((current) =>
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
                (options.length === 0 ||
                  processes.length + temporaryProcesses.length === 0))
            }
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
