
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import api, { getToken } from "@/api/axiosInstance";
import { session } from "@/lib/session";
import type { SessionUser } from "@/lib/access";

export const AUTH_REQUIRED =
  import.meta.env["VITE_AUTH_REQUIRED"] === "true";

type AuthState = {
  token: string | null;
  user: SessionUser | null;
  ready: boolean;
  signIn: (data: unknown) => SessionUser;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

// Shared restoration promise. It can run before AuthProvider mounts.
let authReadyPromise: Promise<SessionUser | null> | null = null;

export function waitForAuth(): Promise<SessionUser | null> {
  if (authReadyPromise) {
    return authReadyPromise;
  }

  const savedToken = getToken();

  if (!savedToken) {
    authReadyPromise = Promise.resolve(null);
    return authReadyPromise;
  }

  authReadyPromise = (async () => {
    try {
      const response = await api.get("/auth/me", {
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (response.data?.success !== true || !response.data?.user) {
        throw new Error("Invalid authentication response");
      }

      return session.restore(response.data.user);
    } catch {
      session.clear();
      return null;
    }
  })();

  return authReadyPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [user, setUser] = useState<SessionUser | null>(
    session.getUser()
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const syncSession = () => {
      setTokenState(getToken());
      setUser(session.getUser());
    };

    const unsubscribe = session.subscribe(syncSession);

    waitForAuth().finally(() => {
      if (!cancelled) {
        syncSession();
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signIn = (data: unknown) => {
    const loggedInUser = session.accept(data);

    authReadyPromise = Promise.resolve(loggedInUser);

    return loggedInUser;
  };

  const signOut = () => {
    session.clear();
    authReadyPromise = Promise.resolve(null);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        ready,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return ctx;
}
