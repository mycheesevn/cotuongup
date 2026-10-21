"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./client";

interface AuthState {
  configured: boolean;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (
    provider: "google" | "facebook"
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Set the leaderboard display name. */
  setUsername: (name: string) => Promise<{ error: string | null }>;
  /** Change the account password (user must be logged in). */
  changePassword: (newPassword: string) => Promise<{ error: string | null }>;
  /** True when the session ended WITHOUT the user asking (expired /
   *  refresh failed) — the shell shows a "session expired" notice. */
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
}

const AuthContext = createContext<AuthState>({
  configured: false,
  user: null,
  loading: true,
  signUp: async () => ({ error: "Supabase not configured" }),
  signIn: async () => ({ error: "Supabase not configured" }),
  signInWithOAuth: async () => ({ error: "Supabase not configured" }),
  signOut: async () => {},
  setUsername: async () => ({ error: "Supabase not configured" }),
  changePassword: async () => ({ error: "Supabase not configured" }),
  sessionExpired: false,
  dismissSessionExpired: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const explicitSignOutRef = useRef(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      const su = session?.user ?? null;
      if (su) {
        setSessionExpired(false);
        setUser(su);
        return;
      }
      if (event === "SIGNED_OUT" && !explicitSignOutRef.current) {
        // A failed token refresh can emit SIGNED_OUT while the stored
        // session is still valid — verify before demoting the player to
        // guest mid-game (games used to record nothing after such a
        // silent downgrade). Only a verified dead session demotes, and
        // it says so out loud.
        void sb.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
          const vu = data.session?.user ?? null;
          if (vu) setUser(vu);
          else {
            setUser(null);
            setSessionExpired(true);
          }
        });
        return;
      }
      explicitSignOutRef.current = false;
      setUser(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) return { error: "Supabase not configured" };
    const { error } = await sb.auth.signUp({ email, password });
    return { error: error ? error.message : null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) return { error: "Supabase not configured" };
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }, []);

  const signInWithOAuth = useCallback(
    async (provider: "google" | "facebook") => {
      const sb = getSupabase();
      if (!sb) return { error: "Supabase not configured" };
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      return { error: error ? error.message : null };
    },
    []
  );

  const signOut = useCallback(async () => {
    explicitSignOutRef.current = true;
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setUser(null);
  }, []);

  const dismissSessionExpired = useCallback(() => setSessionExpired(false), []);

  const setUsername = useCallback(async (name: string) => {
    const sb = getSupabase();
    if (!sb) return { error: "Supabase not configured" };
    const {
      data: { user: u },
    } = await sb.auth.getUser();
    if (!u) return { error: "Not logged in" };
    const clean = name.trim().slice(0, 30);
    if (!clean) return { error: "Name is empty" };
    const { error } = await sb
      .from("profiles")
      .update({ username: clean })
      .eq("id", u.id);
    return { error: error ? error.message : null };
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    const sb = getSupabase();
    if (!sb) return { error: "Supabase not configured" };
    const { error } = await sb.auth.updateUser({ password: newPassword });
    return { error: error ? error.message : null };
  }, []);

  // Apply the display name stashed at signup (it takes precedence over the
  // email-prefix default the DB trigger sets). Email confirmation may delay
  // the first session, hence this runs on every login until the stash is gone.
  useEffect(() => {
    if (!user) return;
    let stashed: string | null = null;
    try {
      stashed = localStorage.getItem("cu-username");
    } catch {
      /* storage unavailable */
    }
    const stashedName = stashed?.trim().slice(0, 30) || null;
    try {
      localStorage.removeItem("cu-username");
    } catch {
      /* ignore */
    }
    if (!stashedName) return;
    const sb = getSupabase();
    if (!sb) return;
    sb.from("profiles").update({ username: stashedName }).eq("id", user.id);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        configured,
        user,
        loading,
        signUp,
        signIn,
        signInWithOAuth,
        signOut,
        setUsername,
        changePassword,
        sessionExpired,
        dismissSessionExpired,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
