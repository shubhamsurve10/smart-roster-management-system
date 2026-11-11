import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";
import api, { getErrorMessage } from "@/api/axiosInstance";
import { ENDPOINTS } from "@/api/endpoints";
import { session } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    const user = session.getUser();
    if (user) throw redirect({ to: user.role === "admin" ? "/" : "/roster", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Login | Smart Roster" },
      { name: "description", content: "Sign in to Smart Roster." },
      { property: "og:title", content: "Login | Smart Roster" },
      { property: "og:description", content: "Sign in to Smart Roster." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!ENDPOINTS.login) { setError("Login is not connected yet. The server login address is required."); return; }
    setBusy(true);
    try {
      const response = await api.post(ENDPOINTS.login, { username: username.trim(), password });
      const user = signIn(response.data);
      setPassword("");
      await router.invalidate();
      await navigate({ to: user.role === "admin" ? "/" : "/roster", replace: true });
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center py-8">
      <div className="w-full max-w-md border-t-4 border-primary bg-card p-6 shadow-card sm:p-10">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><CalendarDays className="h-4 w-4" /></div>
          <span className="text-2xl font-semibold text-foreground">Smart Roster</span>
        </div>
        <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">Admin · Pod Manager · Agent</p>
        <form className="space-y-5" onSubmit={submit}>
          <label className="block space-y-2"><span className="text-sm font-medium">Username</span>
            <input className="field" autoComplete="username" required value={username} disabled={busy} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="block space-y-2"><span className="text-sm font-medium">Password</span>
            <div className="relative">
              <input className="field pr-12" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} />
              <Button type="button" size="icon" variant="ghost" className="absolute right-0 top-0 h-9 w-10" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
            </div>
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !username.trim() || !password}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
        <div className="mt-7 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Smart Roster workspace</div>
      </div>
    </div>
  );
}
  