/**
 * localStorage-backed repositories. Swap the implementations later
 * with a real backend without touching call sites.
 */
import type {
  Feedback,
  Prediction,
  RecognitionSession,
  SystemLog,
  User,
} from "./types";

const KEYS = {
  users: "slr.users",
  session: "slr.session",
  predictions: "slr.predictions",
  sessions: "slr.recSessions",
  feedback: "slr.feedback",
  logs: "slr.logs",
  theme: "slr.theme",
  resetTokens: "slr.resetTokens",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export async function hashPassword(password: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    // SSR / unsupported — fallback (demo only)
    return `plain:${password}`;
  }
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const usersRepo = {
  all: () => read<User[]>(KEYS.users, []),
  save: (users: User[]) => write(KEYS.users, users),
  findByEmail: (email: string) =>
    usersRepo.all().find((u) => u.email.toLowerCase() === email.toLowerCase()),
  findById: (id: string) => usersRepo.all().find((u) => u.id === id),
  upsert: (user: User) => {
    const users = usersRepo.all();
    const i = users.findIndex((u) => u.id === user.id);
    if (i >= 0) users[i] = user;
    else users.push(user);
    usersRepo.save(users);
  },
  delete: (id: string) => {
    usersRepo.save(usersRepo.all().filter((u) => u.id !== id));
  },
};

export const sessionRepo = {
  current: () => read<string | null>(KEYS.session, null),
  set: (userId: string | null) => write(KEYS.session, userId),
  clear: () => write(KEYS.session, null),
};

export const predictionsRepo = {
  all: () => read<Prediction[]>(KEYS.predictions, []),
  forUser: (userId: string) =>
    predictionsRepo.all().filter((p) => p.userId === userId),
  add: (p: Prediction) => {
    const list = predictionsRepo.all();
    list.unshift(p);
    write(KEYS.predictions, list.slice(0, 5000));
  },
  delete: (id: string) =>
    write(KEYS.predictions, predictionsRepo.all().filter((p) => p.id !== id)),
};

export const recSessionsRepo = {
  all: () => read<RecognitionSession[]>(KEYS.sessions, []),
  forUser: (userId: string) =>
    recSessionsRepo.all().filter((s) => s.userId === userId),
  upsert: (s: RecognitionSession) => {
    const list = recSessionsRepo.all();
    const i = list.findIndex((x) => x.id === s.id);
    if (i >= 0) list[i] = s;
    else list.unshift(s);
    write(KEYS.sessions, list.slice(0, 2000));
  },
};

export const feedbackRepo = {
  all: () => read<Feedback[]>(KEYS.feedback, []),
  forUser: (userId: string) =>
    feedbackRepo.all().filter((f) => f.userId === userId),
  add: (f: Feedback) => {
    const list = feedbackRepo.all();
    list.unshift(f);
    write(KEYS.feedback, list);
  },
  delete: (id: string) =>
    write(KEYS.feedback, feedbackRepo.all().filter((f) => f.id !== id)),
};

export const logsRepo = {
  all: () => read<SystemLog[]>(KEYS.logs, []),
  add: (log: Omit<SystemLog, "id" | "timestamp"> & { timestamp?: string }) => {
    const list = logsRepo.all();
    list.unshift({
      id: uid(),
      timestamp: log.timestamp ?? new Date().toISOString(),
      ...log,
    });
    write(KEYS.logs, list.slice(0, 1000));
  },
};

export const resetTokensRepo = {
  all: () => read<Record<string, string>>(KEYS.resetTokens, {}),
  set: (token: string, email: string) => {
    const all = resetTokensRepo.all();
    all[token] = email;
    write(KEYS.resetTokens, all);
  },
  consume: (token: string): string | null => {
    const all = resetTokensRepo.all();
    const email = all[token];
    if (!email) return null;
    delete all[token];
    write(KEYS.resetTokens, all);
    return email;
  },
};

export const themeRepo = {
  get: () => read<"light" | "dark">(KEYS.theme, "light"),
  set: (t: "light" | "dark") => write(KEYS.theme, t),
};
