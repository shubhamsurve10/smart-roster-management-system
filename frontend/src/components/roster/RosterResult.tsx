import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

type AnyRecord = Record<string, any>;

type Issue = {
  type?: string;
  message?: string;
  date?: string;
  brandName?: string | null;
  employeeName?: string | null;
  processType?: string | null;
  severity?: string;
  category?: string;
  stage?: string;
  replacements?: Array<{
    employeeName?: string;
    name?: string;
    reason?: string;
  }>;
};

function asMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const issue = value as Issue;
    if (issue.message) return issue.message;
    return JSON.stringify(value);
  }
  return String(value ?? "Unknown issue");
}

function unwrap(data: AnyRecord): AnyRecord {
  const nested = data?.data;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? { ...data, ...nested }
    : data ?? {};
}

export function RosterResult({
  kind,
  data,
}: {
  kind: "generate" | "validate" | "publish";
  data: AnyRecord;
}) {
  const result = unwrap(data);
  const errors: Issue[] = Array.isArray(result.errors)
    ? result.errors
    : Array.isArray(result.conflicts)
      ? result.conflicts
      : [];
  const warnings: Issue[] = Array.isArray(result.warnings)
    ? result.warnings
    : [];
  const totalErrors = result.totalErrors ?? errors.length;
  const totalWarnings = result.totalWarnings ?? warnings.length;
  const entriesCount = Array.isArray(result.entries)
    ? result.entries.length
    : result.totalEntries ?? result.entriesCreated;
  const valid =
    typeof result.isValid === "boolean"
      ? result.isValid
      : typeof result.valid === "boolean"
        ? result.valid
        : errors.length === 0;

  const title =
    kind === "generate"
      ? "Generation result"
      : kind === "validate"
        ? "Validation result"
        : "Publish result";

  const totals = result.coverageTotals ?? result.views?.totals;
  const summary = result.summary;
  const fairness = result.fairness ?? result.views?.fairness;
  const extraWeeklyOffs = Array.isArray(result.extraWeeklyOffs)
    ? result.extraWeeklyOffs
    : [];

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        {valid ? (
          <CheckCircle2 className="h-5 w-5 text-success" />
        ) : (
          <XCircle className="h-5 w-5 text-destructive" />
        )}
        <h3 className="font-semibold text-foreground">
          {title}: {valid ? "no blocking errors" : "has blocking errors"}
        </h3>
        {data?.message && (
          <span className="text-sm text-muted-foreground">{data.message}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        {entriesCount !== undefined && (
          <Stat label="Generated entries" value={entriesCount} />
        )}
        <Stat label="Errors" value={totalErrors} tone="text-destructive" />
        <Stat label="Warnings" value={totalWarnings} tone="text-warning" />
        {typeof result.manualEntriesPreserved === "number" && (
          <Stat
            label="Manual entries preserved"
            value={result.manualEntriesPreserved}
          />
        )}
        {typeof result.saveMode === "string" && (
          <div>
            <div className="text-muted-foreground">Save mode</div>
            <div className="font-semibold text-foreground">
              {result.saveMode}
            </div>
          </div>
        )}
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-4">
          <Stat label="Employees" value={totals.employees ?? 0} />
          <Stat label="Brands" value={totals.brands ?? 0} />
          <Stat label="Processes" value={totals.processes ?? 0} />
          <Stat
            label="Coverage"
            value={`${totals.coveragePercent ?? 0}%`}
          />
        </div>
      )}

      {summary?.byType && Object.keys(summary.byType).length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Issue summary</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.byType).map(([type, count]) => (
              <span
                key={type}
                className="rounded-md border border-border px-2 py-1 text-xs"
              >
                {type.replaceAll("_", " ")}: {String(count)}
              </span>
            ))}
          </div>
        </div>
      )}

      {fairness && (
        <div className="text-sm text-muted-foreground">
          Weekly-rest fairness · {fairness.employees ?? 0} employees · min{" "}
          {fairness.minRestDays ?? 0} · max {fairness.maxRestDays ?? 0} · avg{" "}
          {fairness.averageRestDays ?? 0} rest days
        </div>
      )}

      {extraWeeklyOffs.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">
            Additional weekly offs added to prevent long working runs
          </h4>
          <ul className="space-y-1 text-sm">
            {extraWeeklyOffs.map((item: AnyRecord, index: number) => (
              <li key={`${item.employee ?? item.employeeName}-${item.date}-${index}`}>
                {item.employeeName ?? item.employee ?? "Employee"} · {item.date}
                {item.reason ? ` · ${item.reason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <IssueList title="Errors" issues={errors} error />
      <IssueList title="Warnings" issues={warnings} />
    </section>
  );
}

function IssueList({
  title,
  issues,
  error = false,
}: {
  title: string;
  issues: Issue[];
  error?: boolean;
}) {
  if (!issues.length) return null;

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">
        {title} ({issues.length})
      </h4>
      <ul className="max-h-72 space-y-2 overflow-y-auto">
        {issues.map((issue, index) => (
          <li
            key={`${issue.type ?? title}-${issue.date ?? ""}-${index}`}
            className={`rounded-md px-3 py-2 text-sm ${
              error
                ? "bg-destructive/5 text-destructive"
                : "bg-status-holiday text-status-holiday-foreground"
            }`}
          >
            <div className="flex items-start gap-2">
              {error ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p>{asMessage(issue)}</p>
                {(issue.type || issue.date || issue.brandName || issue.employeeName) && (
                  <p className="mt-1 text-xs opacity-80">
                    {[issue.type, issue.date, issue.brandName, issue.processType, issue.employeeName]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {issue.replacements?.length ? (
                  <p className="mt-1 text-xs">
                    Suggested cover: {issue.replacements
                      .flatMap((replacement: AnyRecord) => [
                        replacement.employeeName ?? replacement.name,
                        ...(replacement.suggestions ?? []).map(
                          (person: AnyRecord) => person.employeeName ?? person.name,
                        ),
                      ])
                      .filter(Boolean)
                      .join(", ") || "No eligible replacement suggested."}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
