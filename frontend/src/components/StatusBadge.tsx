const styles: Record<string, string> = {
  WORKING: "bg-status-working text-status-working-foreground",
  WEEKLY_OFF: "bg-status-off text-status-off-foreground",
  HOLIDAY: "bg-status-holiday text-status-holiday-foreground",
  LEAVE: "bg-status-leave text-status-leave-foreground",
  COMP_OFF: "bg-status-compoff text-status-compoff-foreground",
  DRAFT: "bg-status-holiday text-status-holiday-foreground",
  PUBLISHED: "bg-status-working text-status-working-foreground",
  APPROVED: "bg-status-working text-status-working-foreground",
  PENDING: "bg-status-holiday text-status-holiday-foreground",
  ACTIVE: "bg-status-working text-status-working-foreground",
  INACTIVE: "bg-status-off text-status-off-foreground",
};

export function StatusBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${styles[value] ?? "bg-muted text-muted-foreground"}`}>
      {value.replace("_", " ")}
    </span>
  );
}
