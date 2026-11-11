import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, Boxes, Tag, Workflow, CalendarDays, Plane, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import api, { API_BASE_URL, getErrorMessage } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard | Smart Roster" },
      { name: "description", content: "Overview of employees, pods, processes and monthly roster status." },
      { property: "og:title", content: "Dashboard | Smart Roster" },
      { property: "og:description", content: "Overview of employees, pods, processes and monthly roster status." },
    ],
  }),
  component: Dashboard,
});

type AnyRec = { _id?: string; active?: boolean; status?: string; month?: string };
const asList = (d: unknown): AnyRec[] =>
  Array.isArray(d) ? d : Array.isArray((d as { data?: unknown })?.data) ? ((d as { data: AnyRec[] }).data) : [];

function Dashboard() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");
  const [data, setData] = useState<Partial<Record<"employees"|"pods"|"brands"|"processes"|"leaves"|"rosters", AnyRec[]>>>({});

  useEffect(() => {
    const keys = ["employees", "pods", "brands", "processes", "leaves", "rosters"] as const;
    Promise.all(keys.map((k) => api.get(ENDPOINTS[k])))
      .then((res) => {
        const out: Partial<Record<(typeof keys)[number], AnyRec[]>> = {};
        keys.forEach((k, i) => (out[k] = asList(res[i]?.data)));
        setData(out);
        setState("ok");
      })
      .catch((e) => { setError(getErrorMessage(e)); setState("error"); });
  }, []);

  const month = new Date().toISOString().slice(0, 7);
  const current = data.rosters?.find((r) => r.month === month);
  const stats = [
    { label: "Active employees", value: data.employees?.filter((e) => e.active !== false).length, icon: Users, to: "/employees" },
    { label: "Pods", value: data.pods?.length, icon: Boxes, to: "/pods" },
    { label: "Brands", value: data.brands?.length, icon: Tag, to: "/brands" },
    { label: "Processes", value: data.processes?.length, icon: Workflow, to: "/processes" },
    { label: "Pending leaves", value: data.leaves?.filter((l) => l.status === "PENDING").length, icon: Plane, to: "/leaves" },
    { label: `Roster ${month}`, value: state === "ok" ? (current?.status as string) || "Not created" : undefined, icon: CalendarDays, to: "/roster" },
  ] as const;

  return (
    <>
      <PageHeader title="Dashboard" description="Live overview from your roster server." />

      <div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        {state === "loading" && <><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> Connecting to {API_BASE_URL}…</>}
        {state === "ok" && <><CheckCircle2 className="h-4 w-4 text-success" /> Connected to {API_BASE_URL}</>}
        {state === "error" && <><XCircle className="h-4 w-4 text-destructive" /> {error}</>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="rounded-lg border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {s.label} <s.icon className="h-4 w-4" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{s.value ?? "—"}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
