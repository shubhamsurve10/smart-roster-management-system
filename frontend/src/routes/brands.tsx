import { createFileRoute } from "@tanstack/react-router";
import { idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { CrudPage } from "@/components/CrudPage";
import { useList } from "@/lib/resources";

export const Route = createFileRoute("/brands")({
  head: () => ({
    meta: [
      { title: "Brands | Smart Roster" },
      { name: "description", content: "Manage brands and their processes." },
      { property: "og:title", content: "Brands | Smart Roster" },
      { property: "og:description", content: "Manage brands and their processes." },
    ],
  }),
  component: BrandsPage,
});

function BrandsPage() {
  const procs = useList(ENDPOINTS.processes);
  return (
    <CrudPage
      title="Brands" singular="Brand" endpoint={ENDPOINTS.brands}
      description="Brands group the processes your team supports."
      fields={[{ name: "name", label: "Brand name", type: "text", required: true }]}
      toForm={(r) => ({ name: r?.name ?? "" })}
      toPayload={(f) => ({ name: f.name.trim() })}
      searchText={(r) => r.name ?? ""}
      columns={[
        { header: "Brand", render: (r) => <span className="font-medium">{r.name}</span> },
        { header: "Processes", render: (r) => procs.items.filter((p) => idOf(p.brand) === r._id).length },
      ]}
    />
  );
}
