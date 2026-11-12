import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCheck,
  Download,
  Lock,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import api, { getErrorMessage, idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { RosterResult } from "@/components/roster/RosterResult";
import {
  EditEntryDialog,
  type CellTarget,
} from "@/components/roster/EditEntryDialog";
import { Button } from "@/components/ui/button";
import { ROSTER_STATUSES } from "@/lib/options";
import {
  processLabel,
  refLabel,
  useList,
  WEEKDAYS,
  type Rec,
} from "@/lib/resources";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/roster")({
  head: () => ({
    meta: [
      { title: "Monthly Roster | Smart Roster" },
      {
        name: "description",
        content: "Generate, edit, validate and publish monthly rosters.",
      },
      { property: "og:title", content: "Monthly Roster | Smart Roster" },
      {
        property: "og:description",
        content: "Generate, edit, validate and publish monthly rosters.",
      },
    ],
  }),
  component: RosterPage,
});

const SHORT: Record<string, string> = {
  WORKING: "W",
  WEEKLY_OFF: "WO",
  HOLIDAY: "H",
  LEAVE: "L",
  COMP_OFF: "CO",
  UNASSIGNED: "UA",
  NON_WORKING_DAY: "NWD",
  NOT_SCHEDULED: "NS",
};

const CELL: Record<string, string> = {
  WORKING: "bg-status-working text-status-working-foreground",
  WEEKLY_OFF: "bg-status-off text-status-off-foreground",
  HOLIDAY: "bg-status-holiday text-status-holiday-foreground",
  LEAVE: "bg-status-leave text-status-leave-foreground",
  COMP_OFF: "bg-status-compoff text-status-compoff-foreground",
  UNASSIGNED: "bg-muted text-muted-foreground",
  NON_WORKING_DAY: "bg-muted text-muted-foreground",
  NOT_SCHEDULED: "bg-muted text-muted-foreground",
};

const DISPLAY_STATUSES = Array.from(
  new Set([
    ...ROSTER_STATUSES,
    "UNASSIGNED",
    "NON_WORKING_DAY",
    "NOT_SCHEDULED",
  ]),
);

type View = "company" | "pod" | "brand" | "process" | "employee";

function daysOf(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();

  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1, i + 1));

    return {
      key: d.toISOString().slice(0, 10),
      day: i + 1,
      wd: d.getUTCDay(),
    };
  });
}

function RosterPage() {
  // Authentication hooks must be inside the component.
  const { user } = useAuth();

  const isAdmin = user?.role === "admin";
  const canEditRoster = user?.role === "admin" || user?.role === "pod_lead";

  const isAgent = user?.role === "agent";
  const canLoadDirectory = !isAgent;

  const rosters = useList(ENDPOINTS.rosters);

  const emps = useList(ENDPOINTS.employees, undefined, canLoadDirectory);

  const pods = useList(ENDPOINTS.pods, undefined, canLoadDirectory);

  const brands = useList(ENDPOINTS.brands, undefined, canLoadDirectory);

  const procs = useList(ENDPOINTS.processes, undefined, canLoadDirectory);

  const assigns = useList(ENDPOINTS.assignments, undefined, canLoadDirectory);

  const [selectedId, setSelectedId] = useState("");
  const [newMonth, setNewMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [busy, setBusy] = useState<string>("");

  const [result, setResult] = useState<{
    kind: "generate" | "validate" | "publish";
    data: any;
  } | null>(null);

  const [toDelete, setToDelete] = useState(false);
  const [impactEmployee, setImpactEmployee] = useState("");
  const [impactStart, setImpactStart] = useState("");
  const [impactEnd, setImpactEnd] = useState("");
  const [impactType, setImpactType] = useState<"LEAVE" | "COMP_OFF">("LEAVE");
  const [impactBusy, setImpactBusy] = useState(false);
  const [impactResult, setImpactResult] = useState<any>(null);

  const sorted = [...rosters.items].sort((a, b) =>
    String(b.month).localeCompare(String(a.month)),
  );

  const roster = rosters.items.find((r) => r._id === selectedId) ?? sorted[0];

  const entries = useList(
    ENDPOINTS.rosterEntries,
    roster ? { rosterMonth: roster.month } : undefined,
  );

  const agentEmployees = useMemo(() => {
    if (!isAgent) return [];

    const uniqueEmployees = new Map<string, Rec>();

    for (const entry of entries.items) {
      const employee =
        typeof entry.employee === "object" ? entry.employee : null;

      if (employee?._id) {
        uniqueEmployees.set(employee._id, employee);
      }
    }

    return Array.from(uniqueEmployees.values());
  }, [isAgent, entries.items]);

  const published = roster?.status === "PUBLISHED";

  async function run(kind: "generate" | "validate" | "publish") {
    if (!roster) return;

    setBusy(kind);

    try {
      const url =
        kind === "generate"
          ? ENDPOINTS.rosterGenerate(roster._id)
          : kind === "validate"
            ? ENDPOINTS.rosterValidate(roster._id)
            : ENDPOINTS.rosterPublish(roster._id);

      const res = await api.post(url);

      setResult({ kind, data: res.data });

      toast.success(
        kind === "generate"
          ? "Roster generated"
          : kind === "validate"
            ? "Validation finished"
            : "Roster published",
      );

      await Promise.all([entries.reload(), rosters.reload()]);
    } catch (e: any) {
      const body = e?.response?.data;

      if (body && typeof body === "object") {
        setResult({ kind, data: { ...body, valid: false } });
      }

      toast.error(getErrorMessage(e));
    } finally {
      setBusy("");
    }
  }

  async function createRoster() {
    if (rosters.items.some((r) => r.month === newMonth)) {
      toast.error(`A roster for ${newMonth} already exists`);
      return;
    }

    setBusy("create");

    try {
      const res = await api.post(ENDPOINTS.rosters, {
        month: newMonth,
        status: "DRAFT",
      });

      toast.success(`Roster ${newMonth} created`);

      await rosters.reload();

      const created = (res.data?.data ?? res.data) as Rec;

      if (created?._id) {
        setSelectedId(created._id);
      }

      setResult(null);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy("");
    }
  }

  async function deleteRoster() {
    if (!roster) return;

    try {
      await api.delete(`${ENDPOINTS.rosters}/${roster._id}`);

      toast.success("Roster deleted");

      setSelectedId("");
      setResult(null);

      await rosters.reload();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }

    setToDelete(false);
  }

  async function exportRoster(view: "employees" | "coverage") {
    if (!roster) return;

    try {
      const response = await api.get(ENDPOINTS.rosterExport(roster._id, view), {
        responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(
        new Blob([response.data], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `roster-${roster.month}-${view}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success("CSV export downloaded");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function previewLeaveImpact() {
    if (!roster || !impactEmployee || !impactStart || !impactEnd) {
      toast.error("Select an employee and both dates first.");
      return;
    }
    if (impactEnd < impactStart) {
      toast.error("End date must be on or after start date.");
      return;
    }

    setImpactBusy(true);
    setImpactResult(null);
    try {
      const response = await api.post(ENDPOINTS.rosterLeaveImpact(roster._id), {
        employee: impactEmployee,
        startDate: impactStart,
        endDate: impactEnd,
        type: impactType,
      });
      setImpactResult(response.data?.data ?? response.data);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setImpactBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Monthly Roster"
        description="Generate, review, edit, validate and publish the month's roster."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
        <label className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">
            Roster
          </span>

          <select
            className="field w-56"
            value={roster?._id ?? ""}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setResult(null);
            }}
          >
            {sorted.length === 0 && <option value="">No rosters yet</option>}

            {sorted.map((r) => (
              <option key={r._id} value={r._id}>
                {r.month} · {r.status}
              </option>
            ))}
          </select>
        </label>

        {isAdmin && (
          <>
            <div className="mx-2 hidden h-9 w-px bg-border sm:block" />

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">
                New roster month
              </span>

              <input
                type="month"
                className="field w-44"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
              />
            </label>

            <Button
              variant="outline"
              onClick={createRoster}
              disabled={!newMonth || busy !== ""}
            >
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </>
        )}

        {roster && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <StatusBadge value={roster.status} />

            {published ? (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                Read-only
              </span>
            ) : isAdmin ? (
              <>
                <Button onClick={() => run("generate")} disabled={busy !== ""}>
                  <Sparkles className="h-4 w-4" />
                  {busy === "generate" ? "Generating…" : "Generate"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => run("validate")}
                  disabled={busy !== ""}
                >
                  <CheckCheck className="h-4 w-4" />
                  {busy === "validate" ? "Validating…" : "Validate"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => run("publish")}
                  disabled={busy !== ""}
                >
                  <Send className="h-4 w-4" />
                  {busy === "publish" ? "Publishing…" : "Publish"}
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete roster"
                  onClick={() => setToDelete(true)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            ) : null}

            {(isAdmin || user?.role === "pod_lead") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportRoster("employees")}
              >
                <Download className="h-4 w-4" />
                Employee CSV
              </Button>
            )}
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportRoster("coverage")}
              >
                <Download className="h-4 w-4" />
                Coverage CSV
              </Button>
            )}
          </div>
        )}
      </div>

      {rosters.error && (
        <ErrorState message={rosters.error} onRetry={rosters.reload} />
      )}

      {result && (
        <div className="mb-4">
          <RosterResult kind={result.kind} data={result.data} />
        </div>
      )}

      {roster && isAdmin && roster.status !== "PUBLISHED" && (
        <section className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4 shadow-card">
          <div>
            <h3 className="font-semibold text-foreground">
              Preview leave impact
            </h3>
            <p className="text-sm text-muted-foreground">
              Check possible coverage gaps before creating or approving a leave.
              This preview does not save a leave or change the roster.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">
                Employee
              </span>
              <select
                className="field min-w-48"
                value={impactEmployee}
                onChange={(e) => setImpactEmployee(e.target.value)}
              >
                <option value="">Select employee</option>
                {emps.items
                  .filter((employee) => employee.active !== false)
                  .map((employee) => (
                    <option key={employee._id} value={employee._id}>
                      {employee.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">
                Start date
              </span>
              <input
                className="field"
                type="date"
                value={impactStart}
                onChange={(e) => setImpactStart(e.target.value)}
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">
                End date
              </span>
              <input
                className="field"
                type="date"
                value={impactEnd}
                onChange={(e) => setImpactEnd(e.target.value)}
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">
                Type
              </span>
              <select
                className="field"
                value={impactType}
                onChange={(e) =>
                  setImpactType(e.target.value as "LEAVE" | "COMP_OFF")
                }
              >
                <option value="LEAVE">Leave</option>
                <option value="COMP_OFF">Comp-off</option>
              </select>
            </label>
            <Button onClick={previewLeaveImpact} disabled={impactBusy}>
              {impactBusy ? "Checking…" : "Preview impact"}
            </Button>
          </div>
          {impactResult && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <p className="text-sm font-medium">{impactResult.message}</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>
                  Coverage gap:{" "}
                  <strong>
                    {impactResult.coverageGapCreated ? "Yes" : "No"}
                  </strong>
                </span>
                <span>
                  Affected brands:{" "}
                  <strong>{impactResult.affectedBrands?.length ?? 0}</strong>
                </span>
                <span>
                  Multiple brands affected:{" "}
                  <strong>
                    {impactResult.multiBrandImpact ? "Yes" : "No"}
                  </strong>
                </span>
              </div>
              {impactResult.replacements?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">
                    Coverage gaps and suggested replacements
                  </h4>
                  {impactResult.replacements.map((gap: any, index: number) => (
                    <div
                      key={`${gap.date}-${gap.process}-${index}`}
                      className="rounded-md bg-muted/50 p-2 text-sm"
                    >
                      <p className="font-medium">
                        {gap.date} · {gap.brandName ?? "Unknown brand"} ·{" "}
                        {gap.processType ?? "Process"}
                      </p>
                      <p className="text-muted-foreground">
                        Shortage: {gap.shortage ?? 0}
                      </p>
                      <p className="text-muted-foreground">
                        Suggested cover:{" "}
                        {gap.suggestions
                          ?.map(
                            (person: any) =>
                              person.employeeName ??
                              person.name ??
                              person.employee,
                          )
                          .join(", ") || "No replacement suggested"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {rosters.loading ? (
        <Loading />
      ) : !roster ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            title="No rosters yet"
            hint={
              isAdmin
                ? "Pick a month above and create your first roster."
                : "No roster has been created yet."
            }
          />
        </div>
      ) : (
        <RosterGrid
          roster={roster}
          entries={entries.items}
          loading={entries.loading}
          error={entries.error}
          emps={isAgent ? agentEmployees : emps.items}
          pods={pods.items}
          brands={brands.items}
          procs={procs.items}
          assigns={assigns.items}
          isAgent={isAgent}
          onSaved={entries.reload}
          canEditRoster={canEditRoster}
          isAdmin={isAdmin}
        />
      )}

      <ConfirmDialog
        open={toDelete}
        onOpenChange={setToDelete}
        title={`Delete roster ${roster?.month}?`}
        description="The roster record will be deleted on the server."
        onConfirm={deleteRoster}
      />
    </>
  );
}

function RosterGrid({
  roster,
  entries,
  loading,
  error,
  emps,
  pods,
  brands,
  procs,
  assigns,
  canEditRoster,
  isAdmin,
  isAgent,
  onSaved,
}: {
  roster: Rec;
  entries: Rec[];
  loading: boolean;
  error: string;
  emps: Rec[];
  pods: Rec[];
  brands: Rec[];
  procs: Rec[];
  assigns: Rec[];
  canEditRoster: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  onSaved: () => void;
}) {
  const [view, setView] = useState<View>(isAgent ? "employee" : "company");

  const [f, setF] = useState({
    pod: "",
    employee: "",
    brand: "",
    process: "",
    status: "",
  });

  const [target, setTarget] = useState<CellTarget | null>(null);

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedProcess, setSelectedProcess] = useState("");
  const [availableEmployees, setAvailableEmployees] = useState<any[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  async function loadAvailableEmployees() {
    if (!selectedDate || !selectedProcess) {
      toast.error("Select a date and process first");
      return;
    }

    setLoadingAvailable(true);
    setAvailableEmployees([]);

    try {
      const res = await api.get(ENDPOINTS.staffingRecommendations, {
        params: {
          processId: selectedProcess,
          date: selectedDate,
        },
      });

      const responseData = res.data?.data ?? res.data;

      setAvailableEmployees(
        Array.isArray(responseData?.recommendations)
          ? responseData.recommendations
          : [],
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoadingAvailable(false);
    }
  }

  const days = daysOf(String(roster.month));

  const editable = canEditRoster && roster.status !== "PUBLISHED";

  const mine = useMemo(
    () =>
      entries.filter((e) => {
        const rm = e.rosterMonth;

        return !rm || idOf(rm) === roster._id || rm === roster.month;
      }),
    [entries, roster],
  );

  const byCell = useMemo(() => {
    const m = new Map<string, Rec>();

    for (const e of mine) {
      m.set(`${idOf(e.employee)}|${String(e.date).slice(0, 10)}`, e);
    }

    return m;
  }, [mine]);

  const procBrand = (pid: string) =>
    idOf(procs.find((p) => p._id === pid)?.brand);

  const empProcs = (eid: string) =>
    assigns.filter((a) => idOf(a.employee) === eid).map((a) => idOf(a.process));

  const empEntries = (eid: string) =>
    mine.filter((e) => idOf(e.employee) === eid);

  const shortProc = (pid: string) => {
    const p =
      procs.find((x) => x._id === pid) ??
      mine
        .flatMap((e) => [
          ...(e.processes ?? []),
          ...(e.temporaryProcesses ?? []),
        ])
        .find((x: unknown) => idOf(x) === pid);

    if (!p) return "Unknown process";

    const brandName =
      typeof p.brand === "object" ? p.brand.name : refLabel(p.brand, brands);

    return `${brandName || "Unknown brand"} · ${p.type || "Process"}`;
  };

  const rows = emps.filter((e) => {
    if (f.pod && idOf(e.pod) !== f.pod) return false;

    if (f.employee && e._id !== f.employee) return false;

    const ps = new Set([
      ...empProcs(e._id),
      ...empEntries(e._id).flatMap((x) =>
        [...(x.processes ?? []), ...(x.temporaryProcesses ?? [])].map(idOf),
      ),
    ]);

    if (f.process && !ps.has(f.process)) return false;

    if (f.brand && ![...ps].some((p) => procBrand(p) === f.brand)) {
      return false;
    }

    if (f.status && !empEntries(e._id).some((x) => x.status === f.status)) {
      return false;
    }

    return true;
  });

  const groups: {
    key: string;
    label: string;
    rows: Rec[];
  }[] = useMemo(() => {
    if (view === "company" || view === "employee") {
      return [{ key: "all", label: "", rows }];
    }

    if (view === "pod") {
      return [...pods, { _id: "", name: "No pod" }]
        .map((p) => ({
          key: p._id || "none",
          label: p.name,
          rows: rows.filter((e) => idOf(e.pod) === p._id),
        }))
        .filter((g) => g.rows.length);
    }

    if (view === "brand") {
      return brands
        .map((b) => ({
          key: b._id,
          label: b.name,
          rows: rows.filter((e) =>
            empProcs(e._id).some((p) => procBrand(p) === b._id),
          ),
        }))
        .filter((g) => g.rows.length);
    }

    return procs
      .map((p) => ({
        key: p._id,
        label: processLabel(p, procs, brands),
        rows: rows.filter((e) => empProcs(e._id).includes(p._id)),
      }))
      .filter((g) => g.rows.length);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rows, pods, brands, procs, assigns]);

  const staffOn = (day: string) =>
    mine.filter(
      (e) => String(e.date).slice(0, 10) === day && e.status === "WORKING",
    ).length;

  const sel = (
    key: keyof typeof f,
    label: string,
    opts: { value: string; label: string }[],
  ) => (
    <select
      className="field w-auto"
      value={f[key]}
      onChange={(e) => setF({ ...f, [key]: e.target.value })}
    >
      <option value="">All {label}</option>

      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="rounded-lg border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        {!isAgent && (
          <>
            <div className="flex rounded-md border border-border p-0.5">
              {(
                ["company", "pod", "brand", "process", "employee"] as View[]
              ).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded px-3 py-1 text-sm capitalize ${
                    view === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            {sel(
              "pod",
              "pods",
              pods.map((p) => ({
                value: p._id,
                label: p.name,
              })),
            )}

            {sel(
              "employee",
              "employees",
              emps.map((e) => ({
                value: e._id,
                label: e.name,
              })),
            )}

            {sel(
              "brand",
              "brands",
              brands.map((b) => ({
                value: b._id,
                label: b.name,
              })),
            )}

            {sel(
              "process",
              "processes",
              procs.map((p) => ({
                value: p._id,
                label: processLabel(p, procs, brands),
              })),
            )}

            {sel(
              "status",
              "statuses",
              DISPLAY_STATUSES.map((s) => ({
                value: s,
                label: s.replace("_", " "),
              })),
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        {DISPLAY_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 font-semibold ${CELL[s]}`}>
              {SHORT[s]}
            </span>

            {s.replace("_", " ")}
          </span>
        ))}

        <span className="ml-auto">
          {editable ? "Click a cell to edit." : "Read-only roster."}
        </span>
      </div>

      {editable && isAdmin && (
        <div className="border-b border-border p-4 space-y-3">
          <h3 className="font-semibold text-foreground">
            Find available employees
          </h3>

          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-xs text-muted-foreground">Date</span>
              <input
                type="date"
                className="field"
                min={`${roster.month}-01`}
                max={days[days.length - 1]?.key}
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setAvailableEmployees([]);
                }}
              />
            </label>

            <label className="space-y-1">
              <span className="block text-xs text-muted-foreground">
                Process
              </span>
              <select
                className="field"
                value={selectedProcess}
                onChange={(e) => {
                  setSelectedProcess(e.target.value);
                  setAvailableEmployees([]);
                }}
              >
                <option value="">Select process</option>
                {procs.map((p) => (
                  <option key={p._id} value={p._id}>
                    {processLabel(p, procs, brands)}
                  </option>
                ))}
              </select>
            </label>

            <Button
              onClick={loadAvailableEmployees}
              disabled={loadingAvailable || !selectedDate || !selectedProcess}
            >
              {loadingAvailable ? "Checking…" : "Find employees"}
            </Button>
          </div>

          {availableEmployees.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Recommended employees ({availableEmployees.length})
              </p>

              {availableEmployees.map((item) => (
                <div
                  key={item.employee?._id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {item.employee?.name}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Permanent assignments: {item.assignmentCount}
                      {" · "}
                      Consecutive working days: {item.consecutiveWorkDays}
                      {item.alreadyWorking
                        ? " · Has spare coverage in current work"
                        : " · Free on this date"}
                    </p>

                    {item.preferredOff && (
                      <p className="text-xs text-warning">
                        Preferred off day — review before assigning
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Type: {item.recommendedAssignmentType}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => {
                      const employee = item.employee;

                      if (!employee?._id) {
                        toast.error("Invalid employee data");
                        return;
                      }

                      const entry = byCell.get(
                        `${employee._id}|${selectedDate}`,
                      );

                      setTarget({
                        employee,
                        date: selectedDate,
                        entry,
                        processId: selectedProcess,
                        processAssigned: empProcs(employee._id).includes(
                          selectedProcess,
                        ),
                      });
                    }}
                  >
                    Assign
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!loadingAvailable &&
            selectedDate &&
            selectedProcess &&
            availableEmployees.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No recommendations loaded. Click Find employees to check
                availability.
              </p>
            )}
        </div>
      )}

      {error && (
        <div className="p-3">
          <ErrorState message={error} onRetry={onSaved} />
        </div>
      )}

      {loading ? (
        <Loading label="Loading roster entries…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No employees match"
          hint="Change the filters or add employees."
        />
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-20 bg-card">
              <tr>
                <th className="sticky left-0 z-30 min-w-44 border-b border-r border-border bg-card px-3 py-2 text-left font-medium text-muted-foreground">
                  Employee
                </th>

                {days.map((d) => (
                  <th
                    key={d.key}
                    className={`min-w-14 border-b border-border px-1 py-1 text-center font-medium ${
                      d.wd === 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    <div>{d.day}</div>
                    <div className="font-normal">
                      {WEEKDAYS[d.wd]!.slice(0, 2)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {groups.map((g) => (
                <GroupRows
                  key={g.key}
                  label={g.label}
                  rows={g.rows}
                  days={days}
                  byCell={byCell}
                  pods={pods}
                  shortProc={shortProc}
                  editable={editable}
                  onCell={(employee, date, entry) =>
                    setTarget({ employee, date, entry })
                  }
                />
              ))}

              <tr>
                <td className="sticky left-0 z-10 border-t border-r border-border bg-muted px-3 py-1.5 font-medium text-foreground">
                  Working staff
                </td>

                {days.map((d) => (
                  <td
                    key={d.key}
                    className="border-t border-border bg-muted text-center font-medium text-foreground"
                  >
                    {staffOn(d.key)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {editable && (
        <EditEntryDialog
          target={target}
          roster={roster}
          onClose={() => setTarget(null)}
          onSaved={() => {
            onSaved();

            if (selectedDate && selectedProcess) {
              void loadAvailableEmployees();
            }
          }}
          processOptions={(eid) => {
            const assigned = new Set(empProcs(eid));

            return procs
              .map((p) => ({
                value: p._id,
                label: processLabel(p, procs, brands),
                assigned: assigned.has(p._id),
              }))
              .sort((a, b) => Number(b.assigned) - Number(a.assigned));
          }}
        />
      )}
    </div>
  );
}

function GroupRows({
  label,
  rows,
  days,
  byCell,
  pods,
  shortProc,
  editable,
  onCell,
}: {
  label: string;
  rows: Rec[];
  days: ReturnType<typeof daysOf>;
  byCell: Map<string, Rec>;
  pods: Rec[];
  shortProc: (pid: string) => string;
  editable: boolean;
  onCell: (e: Rec, date: string, entry?: Rec) => void;
}) {
  return (
    <>
      {label && (
        <tr>
          <td
            colSpan={days.length + 1}
            className="sticky left-0 border-b border-border bg-secondary px-3 py-1.5 text-sm font-semibold text-foreground"
          >
            {label}
          </td>
        </tr>
      )}

      {rows.map((emp) => (
        <tr key={emp._id}>
          <td className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-1.5">
            <div className="font-medium text-foreground">{emp.name}</div>

            <div className="text-muted-foreground">
              {refLabel(emp.pod, pods)}
            </div>
          </td>

          {days.map((d) => {
            const entry = byCell.get(`${emp._id}|${d.key}`);

            const s = entry?.status as string | undefined;

            return (
              <td key={d.key} className="border-b border-border p-0.5">
                <button
                  disabled={!editable}
                  onClick={() => onCell(emp, d.key, entry)}
                  title={
                    entry
                      ? `${s}${
                          entry.processes?.length ||
                          entry.temporaryProcesses?.length
                            ? ` — ${[...(entry.processes ?? []).map((p: unknown) => shortProc(idOf(p))), ...(entry.temporaryProcesses ?? []).map((p: unknown) => `${shortProc(idOf(p))} (temporary)`)].join(", ")}`
                            : ""
                        }${entry.isManual ? " (manual)" : ""}`
                      : "No entry"
                  }
                  className={`flex h-10 w-full flex-col items-center justify-center rounded ${
                    s
                      ? CELL[s]
                      : "border border-dashed border-border text-muted-foreground"
                  } ${
                    editable ? "hover:ring-2 hover:ring-ring" : "cursor-default"
                  } ${entry?.isManual ? "ring-1 ring-primary" : ""}`}
                >
                  <span className="font-semibold">{s ? SHORT[s] : "—"}</span>

                  {s === "WORKING" &&
                    (entry?.processes?.length ?? 0) +
                      (entry?.temporaryProcesses?.length ?? 0) >
                      0 && (
                      <span className="max-w-28 truncate px-0.5 text-[10px] leading-tight">
                        {[
                          ...(entry.processes ?? []).map((p: unknown) => ({
                            process: p,
                            temporary: false,
                          })),
                          ...(entry.temporaryProcesses ?? []).map(
                            (p: unknown) => ({ process: p, temporary: true }),
                          ),
                        ]
                          .map(({ process: p, temporary }) => {
                            if (typeof p === "object" && p !== null) {
                              const process = p as Rec;
                              const brand =
                                typeof process.brand === "object"
                                  ? process.brand?.name
                                  : "";

                              return `${brand || "Brand"} · ${process.type || "Process"}${temporary ? " (temp)" : ""}`;
                            }

                            return `${shortProc(idOf(p))}${temporary ? " (temp)" : ""}`;
                          })
                          .join(", ")}
                      </span>
                    )}
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
