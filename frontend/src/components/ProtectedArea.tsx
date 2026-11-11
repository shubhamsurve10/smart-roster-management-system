  import { useEffect, type ReactNode } from "react";
  import { useNavigate } from "@tanstack/react-router";
  import { AUTH_REQUIRED, useAuth } from "@/context/AuthContext";
  import { Loading } from "@/components/States";

  export function ProtectedArea({ children }: { children: ReactNode }) {
    const { token, ready } = useAuth();
    const navigate = useNavigate();
    const blocked = AUTH_REQUIRED && ready && !token;

    useEffect(() => { if (blocked) void navigate({ to: "/login" }); }, [blocked, navigate]);

    if (AUTH_REQUIRED && (!ready || !token)) return <Loading label="Checking session…" />;
    return <>{children}</>;
  }
