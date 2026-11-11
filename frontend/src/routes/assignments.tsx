import { createFileRoute } from "@tanstack/react-router";
import { idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { CrudPage } from "@/components/CrudPage";
import { processLabel, refLabel, useList, type Rec } from "@/lib/resources";

export const Route = createFileRoute("/assignments")({
  head: () => ({
    meta: [
      { title: "Assignments | Smart Roster" },
      { name: "description", content: "Assign employees to one or more processes." },
      { property: "og:title", content: "Assignments | Smart Roster" },
      { property: "og:description", content: "Assign employees to one or more processes." },
    ],
  }),
  component: AssignmentsPage,
});

function AssignmentsPage() {
  const emps = useList(ENDPOINTS.employees);
  const procs = useList(ENDPOINTS.processes);
  const brands = useList(ENDPOINTS.brands);
  const pods = useList(ENDPOINTS.pods);
  const emp = (r: Rec) => emps.items.find((e) => e._id === idOf(r.employee));
  const proc = (r: Rec) => procs.items.find((p) => p._id === idOf(r.process));
  const procOpts = procs.items.map((p) => ({ value: p._id, label: processLabel(p, procs.items, brands.items) }));
  const empOpts = emps.items.map((e) => ({ value: e._id, label: e.name }));

  return (
    <CrudPage
      title="Assignments" singular="Assignment" endpoint={ENDPOINTS.assignments}
      description="An employee can work on several processes, and a process can have many employees."
      fields={[
        { name: "employee", label: "Employee", type: "select", options: empOpts, required: true },
        { name: "process", label: "Process", type: "select", options: procOpts, required: true },
        { name: "isPrimary", label: "Primary assignment", type: "checkbox" },
      ]}
      toForm={(r) => ({ employee: idOf(r?.employee), process: idOf(r?.process), isPrimary: r?.isPrimary ?? false })}
      toPayload={(f) => ({ employee: f.employee, process: f.process, isPrimary: !!f.isPrimary })}
      searchText={(r) => `${refLabel(r.employee, emps.items)} ${processLabel(r.process, procs.items, brands.items)}`}
      filters={[
        { key: "employee", label: "Employees", options: empOpts, match: (r, v) => idOf(r.employee) === v },
        { key: "brand", label: "Brands", options: brands.items.map((b) => ({ value: b._id, label: b.name })),
          match: (r, v) => idOf(proc(r)?.brand ?? (r.process as Rec)?.brand) === v },
        { key: "process", label: "Processes", options: procOpts, match: (r, v) => idOf(r.process) === v },
        { key: "pod", label: "Pods", options: pods.items.map((p) => ({ value: p._id, label: p.name })),
          match: (r, v) => idOf(emp(r)?.pod ?? (r.employee as Rec)?.pod) === v },
      ]}
      columns={[
        { header: "Employee", render: (r) => <span className="font-medium">{refLabel(r.employee, emps.items)}</span> },
        { header: "Pod", render: (r) => refLabel(emp(r)?.pod, pods.items) },
        { header: "Process", render: (r) => processLabel(r.process, procs.items, brands.items) },
        { header: "Primary", render: (r) => (r.isPrimary ? "Yes" : "No") },
      ]}
    />
  );
}
