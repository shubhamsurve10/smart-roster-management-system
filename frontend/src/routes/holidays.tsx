import { createFileRoute } from "@tanstack/react-router";
import { ENDPOINTS } from "@/api/endpoints";
import { CrudPage } from "@/components/CrudPage";
import { fmtDate, toDateInput, WEEKDAYS } from "@/lib/resources";

export const Route = createFileRoute("/holidays")({
  head: () => ({
    meta: [
      { title: "Holidays | Smart Roster" },
      { name: "description", content: "Public holidays that affect process calendars." },
      { property: "og:title", content: "Holidays | Smart Roster" },
      { property: "og:description", content: "Public holidays that affect process calendars." },
    ],
  }),
  component: HolidaysPage,
});

function HolidaysPage() {
  return (
    <CrudPage
      title="Holidays" singular="Holiday" endpoint={ENDPOINTS.holidays}
      description="Processes with holiday-aware calendars do not operate on these dates."
      fields={[
        { name: "name", label: "Holiday name", type: "text", required: true },
        { name: "date", label: "Date", type: "date", required: true },
      ]}
      toForm={(r) => ({ name: r?.name ?? "", date: toDateInput(r?.date) })}
      toPayload={(f) => ({ name: f.name.trim(), date: f.date })}
      searchText={(r) => r.name ?? ""}
      columns={[
        { header: "Date", render: (r) => fmtDate(r.date) },
        { header: "Day", render: (r) => (r.date ? WEEKDAYS[new Date(r.date).getUTCDay()] : "—") },
        { header: "Holiday", render: (r) => <span className="font-medium">{r.name}</span> },
      ]}
    />
  );
}
