import { idOf, setToken } from "@/api/axiosInstance";
import type { SessionUser } from "./access";

let user: SessionUser | null = null;
const listeners = new Set<() => void>();
export const session = {
  getUser: () => user,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  clear: () => { user = null; setToken(null); listeners.forEach((fn) => fn()); },
  accept: (data: unknown) => {
    const response = data as { success?: boolean; token?: unknown; user?: { id?: string; _id?: string; name?: string; email?: string; role?: string; pod?: unknown; employee?: unknown } } | null;
    const u = response?.user;
    if (response?.success !== true || typeof response.token !== "string" || !response.token.trim() || !u || !idOf(u) || !["admin", "pod_lead", "agent"].includes(u.role ?? "")) {
      throw new Error("The server returned an invalid login response or an unsupported role.");
    }
    user = { id: idOf(u), name: u.name ?? "", email: u.email ?? "", role: u.role as SessionUser["role"], pod: idOf(u.pod), employee: idOf(u.employee) };
    setToken(response.token);
    listeners.forEach((fn) => fn());
    return user;
  },
  restore: (data: unknown) => {
  const u = data as {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    pod?: unknown;
    employee?: unknown;
  } | null;

  if (
    !u ||
    !u.id ||
    !["admin", "pod_lead", "agent"].includes(u.role ?? "")
  ) {
    throw new Error("Invalid session user");
  }

  user = {
    id: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    role: u.role as SessionUser["role"],
    pod: idOf(u.pod),
    employee: idOf(u.employee),
  };

  listeners.forEach((fn) => fn());

  return user;
},
};