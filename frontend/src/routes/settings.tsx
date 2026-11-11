import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import api, { API_BASE_URL, getErrorMessage } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { AUTH_REQUIRED, useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Smart Roster" },
      { name: "description", content: "Application and connection settings." },
      { property: "og:title", content: "Settings | Smart Roster" },
      { property: "og:description", content: "Application and connection settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { token, signOut } = useAuth();
  const navigate = useNavigate();
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);

  return (
    <>
      <PageHeader title="Settings" description="Connection and session details." />
      <div className="max-w-2xl space-y-4">
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="font-semibold text-foreground">Server connection</h2>
          <p className="mt-1 text-sm text-muted-foreground">Set with <code>VITE_API_BASE_URL</code>.</p>
          <p className="mt-3 rounded-md bg-muted px-3 py-2 font-mono text-sm text-foreground">{API_BASE_URL}</p>
          <div className="mt-3 flex items-center gap-3">
            <Button variant="outline" onClick={async () => {
              try { await api.get(ENDPOINTS.pods); setTest({ ok: true, msg: "Server reachable" }); }
              catch (e) { setTest({ ok: false, msg: getErrorMessage(e) }); }
            }}>Test connection</Button>
            {test && (
              <span className={`flex items-center gap-1.5 text-sm ${test.ok ? "text-success" : "text-destructive"}`}>
                {test.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{test.msg}
              </span>
            )}
          </div>
        </section>
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="font-semibold text-foreground">Session</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Login required: {AUTH_REQUIRED ? "yes" : "no"} (<code>VITE_AUTH_REQUIRED</code>). Token: {token ? "present" : "none"}.
          </p>
          <div className="mt-3 flex gap-2">
            {token
              ? <Button variant="outline" onClick={() => { signOut(); void navigate({ to: "/login" }); }}>Sign out</Button>
              : <Button variant="outline" onClick={() => navigate({ to: "/login" })}>Go to login</Button>}
          </div>
        </section>
      </div>
    </>
  );
}
