import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Users } from "lucide-react";
import { idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { CrudPage } from "@/components/CrudPage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { refLabel, useList, type Rec } from "@/lib/resources";

export const Route = createFileRoute("/pods")({
  head: () => ({
    meta: [
      { title: "Pods | Smart Roster" },
      { name: "description", content: "Manage pods and pod leads." },
      { property: "og:title", content: "Pods | Smart Roster" },
      { property: "og:description", content: "Manage pods and pod leads." },
    ],
  }),
  component: PodsPage,
});

function PodsPage() {
  const emps = useList(ENDPOINTS.employees);
  const [view, setView] = useState<Rec | null>(null);
  const members = (pod: Rec) => emps.items.filter((e) => idOf(e.pod) === pod._id);

  return (
    <>
      <CrudPage
        title="Pods" singular="Pod" endpoint={ENDPOINTS.pods}
        description="Group employees into pods and assign a pod lead."
        onChanged={emps.reload}
        fields={[
          { name: "name", label: "Pod name", type: "text", required: true },
          { name: "lead", label: "Pod lead", type: "select", placeholder: "— No lead —",
            options: emps.items.map((e) => ({ value: e._id, label: e.name })) },
        ]}
        toForm={(r) => ({ name: r?.name ?? "", lead: idOf(r?.lead) })}
        toPayload={(f) => ({ name: f.name.trim(), lead: f.lead || null })}
        searchText={(r) => r.name ?? ""}
        columns={[
          { header: "Pod", render: (r) => <span className="font-medium">{r.name}</span> },
          { header: "Lead", render: (r) => refLabel(r.lead, emps.items) },
          { header: "Employees", render: (r) => members(r).length },
        ]}
        readActions={(r) => (
          <Button size="icon" variant="ghost" aria-label="View employees" title="View employees" onClick={() => setView(r)}>
            <Users className="h-4 w-4" />
          </Button>
        )}
      />
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{view?.name} — employees</DialogTitle></DialogHeader>
          {view && members(view).length === 0 ? (
            <p className="text-sm text-muted-foreground">No employees in this pod.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {view && members(view).map((e) => (
                <li key={e._id} className="flex justify-between py-2">
                  <span>{e.name}</span>
                  <span className="text-muted-foreground">{e.role === "pod_lead" ? "Pod lead" : "Agent"}</span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
