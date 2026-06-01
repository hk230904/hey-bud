/** Theme is the only thing kept in localStorage now. */
const KEY = "slr.theme";

export const themeRepo = {
  get: (): "light" | "dark" => {
    if (typeof window === "undefined") return "light";
    return (window.localStorage.getItem(KEY) as "light" | "dark") ?? "light";
  },
  set: (t: "light" | "dark") => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, t);
  },
};
