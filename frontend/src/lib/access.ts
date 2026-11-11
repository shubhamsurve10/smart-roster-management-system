export type Role = "admin" | "pod_lead" | "agent";
export type SessionUser = { id: string; name: string; email: string; role: Role; pod: string; employee: string };

export function canVisit(role: Role, path: string) {
  if (role === "admin") return true;
  const allowed = role === "pod_lead"
    ? ["/roster", "/pods", "/employees"]
    : ["/roster", "/weekly-off-rules", "/holidays", "/leaves"];
  return allowed.includes(path);
}

export function canEditEntry(user: SessionUser | null, employee: { _id?: string; pod?: unknown }, published: boolean, existing: boolean) {
  if (!user || published) return false;
  if (user.role === "admin") return true;
  const pod = typeof employee.pod === "string" ? employee.pod : (employee.pod as { _id?: string; id?: string } | null)?. _id ?? (employee.pod as { id?: string } | null)?.id;
  return user.role === "pod_lead" && !!user.pod && pod === user.pod && existing;
}

export function ownsEmployee(user: SessionUser, employee: { _id?: string; id?: string; pod?: unknown; user?: unknown }) {
  if (user.role === "admin") return true;
  const ref = (v: unknown) => typeof v === "string" ? v : (v as { _id?: string; id?: string } | null)?._id ?? (v as { id?: string } | null)?.id ?? "";
  if (user.role === "pod_lead") return !!user.pod && ref(employee.pod) === user.pod;
  return (!!user.employee && (employee._id ?? employee.id) === user.employee) || ref(employee.user) === user.id;
}