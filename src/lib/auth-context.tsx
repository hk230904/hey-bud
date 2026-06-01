import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updateProfile: (patch: { fullName?: string; avatarUrl?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(userId: string, email: string): Promise<User> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    id: userId,
    email,
    fullName: data?.full_name ?? email,
    avatarUrl: data?.avatar_url ?? null,
    createdAt: data?.created_at ?? new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Listen first to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          // Defer profile fetch to avoid running supabase calls inside the callback
          setTimeout(async () => {
            if (!mounted) return;
            const u = await loadProfile(session.user.id, session.user.email ?? "");
            if (!mounted) return;
            setUser(u);
            qc.invalidateQueries();
          }, 0);
        } else {
          setUser(null);
          qc.clear();
        }
      },
    );

    // Initial session check
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        const u = await loadProfile(
          data.session.user.id,
          data.session.user.email ?? "",
        );
        if (!mounted) return;
        setUser(u);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [qc]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const register = useCallback(
    async (fullName: string, email: string, password: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw new Error(error.message);
    },
    [],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }, []);

  const updateProfile = useCallback(
    async (patch: { fullName?: string; avatarUrl?: string }) => {
      if (!user) throw new Error("Not signed in");
      const update: { full_name?: string; avatar_url?: string | null } = {};
      if (patch.fullName !== undefined) update.full_name = patch.fullName;
      if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl;
      const { error } = await supabase
        .from("profiles")
        .update(update)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
      setUser({
        ...user,
        ...(patch.fullName !== undefined && { fullName: patch.fullName }),
        ...(patch.avatarUrl !== undefined && { avatarUrl: patch.avatarUrl }),
      });
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      loading,
      login,
      register,
      logout,
      requestPasswordReset,
      updatePassword,
      updateProfile,
    }),
    [user, loading, login, register, logout, requestPasswordReset, updatePassword, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
