import { createFileRoute } from "@tanstack/react-router";
import { idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { CrudPage } from "@/components/CrudPage";
import { CALENDAR_TYPES, PROCESS_TYPES } from "@/lib/options";
import { refLabel, useList } from "@/lib/resources";

export const Route = createFileRoute("/processes")({
  head: () => ({
    meta: [
      { title: "Processes | Smart Roster" },
      { name: "description", content: "Configure process types, calendars and minimum staffing." },
      { property: "og:title", content: "Processes | Smart Roster" },
      { property: "og:description", content: "Configure process types, calendars and minimum staffing." },
    ],
  }),
  component: ProcessesPage,
});

function ProcessesPage() {
  const brands = useList(ENDPOINTS.brands);
  const brandOpts = brands.items.map((b) => ({ value: b._id, label: b.name }));
  return (
    <CrudPage
      title="Processes" singular="Process" endpoint={ENDPOINTS.processes}
      description="Each process belongs to a brand and has its own operating calendar and minimum staff."
      fields={[
        { name: "brand", label: "Brand", type: "select", options: brandOpts, required: true },
        { name: "type", label: "Process type", type: "select", options: PROCESS_TYPES, required: true },
        { name: "calendarType", label: "Operating calendar", type: "select", options: CALENDAR_TYPES, required: true },
        { name: "minStaff", label: "Default minimum staff", type: "number", required: true },
      ]}
      toForm={(r) => ({ brand: idOf(r?.brand), type: r?.type ?? "", calendarType: r?.calendarType ?? "", minStaff: r?.minStaff ?? 1 })}
      toPayload={(f) => ({ brand: f.brand, type: f.type, calendarType: f.calendarType, minStaff: Number(f.minStaff) })}
      searchText={(r) => `${refLabel(r.brand, brands.items)} ${r.type}`}
      filters={[
        { key: "brand", label: "Brands", options: brandOpts, match: (r, v) => idOf(r.brand) === v },
        { key: "type", label: "Types", options: PROCESS_TYPES, match: (r, v) => r.type === v },
      ]}
      columns={[
        { header: "Brand", render: (r) => <span className="font-medium">{refLabel(r.brand, brands.items)}</span> },
        { header: "Type", render: (r) => r.type },
        { header: "Calendar", render: (r) => CALENDAR_TYPES.find((c) => c.value === r.calendarType)?.label ?? r.calendarType },
        { header: "Min staff", render: (r) => r.minStaff },
      ]}
    />
  );
}
