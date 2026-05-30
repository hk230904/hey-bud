import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  hashPassword,
  logsRepo,
  resetTokensRepo,
  sessionRepo,
  uid,
  usersRepo,
} from "./storage";
import type { User, UserRole } from "./types";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
  requestPasswordReset: (email: string) => Promise<string>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, "fullName" | "email">>) => Promise<void>;
  changePassword: (oldPw: string, newPw: string) => Promise<void>;
  setRole: (userId: string, role: UserRole) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function seedAdminIfNeeded() {
  const users = usersRepo.all();
  if (users.length > 0) return;
  const adminHash = await hashPassword("admin123");
  const demoHash = await hashPassword("demo1234");
  const now = new Date().toISOString();
  usersRepo.save([
    {
      id: uid(),
      fullName: "Admin User",
      email: "admin@demo.local",
      passwordHash: adminHash,
      role: "admin",
      createdAt: now,
      lastLogin: null,
    },
    {
      id: uid(),
      fullName: "Demo User",
      email: "demo@demo.local",
      passwordHash: demoHash,
      role: "user",
      createdAt: now,
      lastLogin: null,
    },
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await seedAdminIfNeeded();
      const id = sessionRepo.current();
      if (id) {
        const u = usersRepo.findById(id);
        if (u) setUser(u);
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const found = usersRepo.findByEmail(email);
    const hash = await hashPassword(password);
    if (!found || found.passwordHash !== hash) {
      throw new Error("Invalid email or password");
    }
    const updated = { ...found, lastLogin: new Date().toISOString() };
    usersRepo.upsert(updated);
    sessionRepo.set(updated.id);
    setUser(updated);
    logsRepo.add({
      eventType: "auth",
      description: `User logged in: ${updated.email}`,
      userId: updated.id,
    });
  }, []);

  const register = useCallback(
    async (fullName: string, email: string, password: string) => {
      if (usersRepo.findByEmail(email)) {
        throw new Error("An account with this email already exists");
      }
      const passwordHash = await hashPassword(password);
      const newUser: User = {
        id: uid(),
        fullName,
        email,
        passwordHash,
        role: "user",
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      usersRepo.upsert(newUser);
      sessionRepo.set(newUser.id);
      setUser(newUser);
      logsRepo.add({
        eventType: "auth",
        description: `New user registered: ${newUser.email}`,
        userId: newUser.id,
      });
    },
    [],
  );

  const logout = useCallback(() => {
    if (user) {
      logsRepo.add({
        eventType: "auth",
        description: `User logged out: ${user.email}`,
        userId: user.id,
      });
    }
    sessionRepo.clear();
    setUser(null);
  }, [user]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const u = usersRepo.findByEmail(email);
    if (!u) throw new Error("No account found for that email");
    const token = uid();
    resetTokensRepo.set(token, email);
    return token;
  }, []);

  const resetPassword = useCallback(
    async (token: string, newPassword: string) => {
      const email = resetTokensRepo.consume(token);
      if (!email) throw new Error("Invalid or expired reset token");
      const u = usersRepo.findByEmail(email);
      if (!u) throw new Error("Account no longer exists");
      const updated = { ...u, passwordHash: await hashPassword(newPassword) };
      usersRepo.upsert(updated);
      logsRepo.add({
        eventType: "auth",
        description: `Password reset for ${updated.email}`,
        userId: updated.id,
      });
    },
    [],
  );

  const updateProfile = useCallback(
    async (patch: Partial<Pick<User, "fullName" | "email">>) => {
      if (!user) throw new Error("Not logged in");
      const updated = { ...user, ...patch };
      usersRepo.upsert(updated);
      setUser(updated);
    },
    [user],
  );

  const changePassword = useCallback(
    async (oldPw: string, newPw: string) => {
      if (!user) throw new Error("Not logged in");
      if ((await hashPassword(oldPw)) !== user.passwordHash) {
        throw new Error("Current password is incorrect");
      }
      const updated = { ...user, passwordHash: await hashPassword(newPw) };
      usersRepo.upsert(updated);
      setUser(updated);
    },
    [user],
  );

  const setRole = useCallback((userId: string, role: UserRole) => {
    const u = usersRepo.findById(userId);
    if (!u) return;
    usersRepo.upsert({ ...u, role });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isAdmin: user?.role === "admin",
      loading,
      login,
      register,
      logout,
      requestPasswordReset,
      resetPassword,
      updateProfile,
      changePassword,
      setRole,
    }),
    [
      user,
      loading,
      login,
      register,
      logout,
      requestPasswordReset,
      resetPassword,
      updateProfile,
      changePassword,
      setRole,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
