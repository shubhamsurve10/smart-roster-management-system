import { useMemo, useState, type ReactNode } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/api/axiosInstance";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { PageHeader } from "@/components/PageHeader";
import { useList, type Rec } from "@/lib/resources";
import { useAuth } from "@/context/AuthContext";

export type Option = { value: string; label: string };

export type Field = {
  name: string;
  label: string;
  type:
    "text" | "email" | "password" | "number" | "select" | "checkbox" | "date";
  options?: Option[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  createOnly?: boolean;
};

export type Column = {
  header: string;
  render: (row: Rec) => ReactNode;
  className?: string;
};

export type Filter = {
  key: string;
  label: string;
  options: Option[];
  match: (row: Rec, value: string) => boolean;
};

type Props = {
  title: string;
  description: string;
  endpoint: string;
  singular: string;
  fields: Field[];
  columns: Column[];
  filters?: Filter[];
  searchText?: (row: Rec) => string;
  toForm: (row?: Rec) => any;
  toPayload: (form: any) => Record<string, unknown>;
  validate?: (form: any) => string | null;
  rowActions?: (row: Rec, reload: () => void) => ReactNode;
  readActions?: (row: Rec, reload: () => void) => ReactNode;
  onChanged?: () => void;
  extraHeader?: ReactNode;
  canCreate?: boolean;
  showRowActions?: boolean;
};

const PAGE = 20;

export function CrudPage(p: Props) {
  const { user } = useAuth();
  const writable = user?.role === "admin";
  const canCreate = p.canCreate ?? writable;

  const { items, loading, error, reload } = useList(p.endpoint);

  const [q, setQ] = useState("");
  const [fv, setFv] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Rec | null | undefined>(undefined);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Rec | null>(null);

  const filtered = useMemo(
    () =>
      items.filter((r) => {
        if (
          q &&
          p.searchText &&
          !p.searchText(r).toLowerCase().includes(q.toLowerCase())
        ) {
          return false;
        }

        return (p.filters ?? []).every((f) => {
          const value = fv[f.key];
          return !value || f.match(r, value);
        });
      }),
    [items, q, fv, p],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const open = (row: Rec | null) => {
    setEditing(row);
    setForm(p.toForm(row ?? undefined));
  };

  const refresh = () => {
    void reload();
    p.onChanged?.();
  };

  async function save() {
    if (editing ? !writable : !canCreate) return;

    for (const f of p.fields) {
      if (
        f.required &&
        !(editing && f.createOnly) &&
        (form[f.name] === "" || form[f.name] == null)
      ) {
        toast.error(`${f.label} is required`);
        return;
      }
    }

    const msg = p.validate?.(form);

    if (msg) {
      toast.error(msg);
      return;
    }

    setSaving(true);

    try {
      const body = p.toPayload(form);

      // Do not send create-only fields when editing an existing record.
      if (editing) {
        for (const f of p.fields) {
          if (f.createOnly) {
            delete body[f.name];
          }
        }

        await api.patch(`${p.endpoint}/${editing._id}`, body);
      } else {
        await api.post(p.endpoint, body);
      }

      toast.success(`${p.singular} ${editing ? "updated" : "created"}`);
      setEditing(undefined);
      refresh();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!toDelete || !writable) return;

    try {
      await api.delete(`${p.endpoint}/${toDelete._id}`);
      toast.success(`${p.singular} deleted`);
      refresh();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setToDelete(null);
    }
  }

  const visibleFields = p.fields.filter((f) => !(editing && f.createOnly));

  return (
    <>
      <PageHeader
        title={p.title}
        description={p.description}
        actions={
          canCreate ? (
            <Button onClick={() => open(null)}>
              <Plus className="h-4 w-4" />
              Add {p.singular.toLowerCase()}
            </Button>
          ) : undefined
        }
      />

      {p.extraHeader}

      <div className="mb-4 flex flex-wrap gap-2">
        {p.searchText && (
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="field w-64 pl-8"
              placeholder="Search…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>
        )}

        {p.filters?.map((f) => (
          <select
            key={f.key}
            className="field w-auto"
            value={fv[f.key] ?? ""}
            onChange={(e) => {
              setFv({ ...fv, [f.key]: e.target.value });
              setPage(0);
            }}
          >
            <option value="">All {f.label.toLowerCase()}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={`No ${p.title.toLowerCase()} found`}
            {...(items.length
              ? { hint: "Try changing the filters." }
              : writable
                ? { hint: `Add your first ${p.singular.toLowerCase()}.` }
                : {})}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {p.columns.map((c) => (
                  <th key={c.header}>{c.header}</th>
                ))}
                {(writable || p.readActions || p.showRowActions) && (
                  <th className="text-right">Actions</th>
                )}
              </tr>
            </thead>

            <tbody>
              {shown.map((r) => (
                <tr key={r._id}>
                  {p.columns.map((c) => (
                    <td key={c.header} className={c.className}>
                      {c.render(r)}
                    </td>
                  ))}

                  {(writable || p.readActions || p.showRowActions) && (
                    <td className="whitespace-nowrap text-right">
                      {p.readActions?.(r, refresh)}

                      {writable && (
                        <>
                          {p.rowActions?.(r, refresh)}

                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Edit"
                            onClick={() => open(r)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete"
                            onClick={() => setToDelete(r)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          Page {page + 1} of {pages}
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <Dialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "Add"} {p.singular.toLowerCase()}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {visibleFields.map((f) => (
              <FieldInput
                key={f.name}
                field={f}
                value={form[f.name]}
                onChange={(v) =>
                  setForm((s: any) => ({
                    ...s,
                    [f.name]: v,
                  }))
                }
              />
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(undefined)}>
              Cancel
            </Button>

            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete this ${p.singular.toLowerCase()}?`}
        description="This cannot be undone."
        onConfirm={remove}
      />
    </>
  );
}

function FieldInput({
  field: f,
  value,
  onChange,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
}) {
  if (f.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {f.label}
      </label>
    );
  }

  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">
        {f.label}
        {f.required && " *"}
      </span>

      {f.type === "select" ? (
        <select
          className="field"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{f.placeholder ?? "— Select —"}</option>

          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="field"
          type={f.type}
          value={value ?? ""}
          placeholder={f.placeholder}
          autoComplete={f.type === "password" ? "new-password" : undefined}
          onChange={(e) => onChange(e.target.value)}
          min={f.type === "number" ? 0 : undefined}
        />
      )}

      {f.hint && (
        <span className="block text-xs text-muted-foreground">{f.hint}</span>
      )}
    </label>
  );
}
