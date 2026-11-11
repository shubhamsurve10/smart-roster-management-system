import { useCallback, useEffect, useState } from "react";
import api, { getErrorMessage, idOf } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { useAuth } from "@/context/AuthContext";
import { ownsEmployee } from "@/lib/access";

// Backend documents are loosely typed on purpose: shapes come from the external API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Rec = any;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function asList(d: unknown): Rec[] {
  if (Array.isArray(d)) return d;
  const o = d as Record<string, unknown> | null;
  for (const k of ["data", "items", "results", "docs"]) {
    if (o && Array.isArray(o[k])) return o[k] as Rec[];
  }
  return [];
}

/** Loads a list endpoint; returns items, loading, error and a reload function. */

export function useList(
  endpoint: string,
  params?: Record<string, unknown>,
  enabled = true
) {
  const { user } = useAuth();

  const [items, setItems] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const key = JSON.stringify(params ?? {});

  const reload = useCallback(async () => {
    if (!enabled || !user) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const res = await api.get(endpoint, {
        params: JSON.parse(key),
      });

      const rows = asList(res.data);

      // Backend already applies role-based access.
      // Do not make extra employee API requests here.
      setItems(rows);
      setError("");
    } catch (e) {
      setItems([]);
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [endpoint, key, enabled, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, loading, error, reload, setItems };
}
  

/** Label for a reference that may be a populated object or an id. */
export function refLabel(value: unknown, list: Rec[], field = "name"): string {
  if (!value) return "—";
  if (typeof value === "object" && (value as Rec)[field]) return String((value as Rec)[field]);
  const found = list.find((x) => x._id === idOf(value));
  return found ? String(found[field] ?? found._id) : "—";
}

export function processLabel(p: unknown, processes: Rec[], brands: Rec[]): string {
  if (!p) return "—";
  const proc = typeof p === "object" ? (p as Rec) : processes.find((x) => x._id === p);
  if (!proc) return "—";
  const full = processes.find((x) => x._id === idOf(proc)) ?? proc;
  return `${refLabel(full.brand, brands)} · ${full.type ?? ""}`;
}

export const toDateInput = (v: unknown) => (v ? String(v).slice(0, 10) : "");
export const fmtDate = (v: unknown) =>
  v ? new Date(String(v)).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
