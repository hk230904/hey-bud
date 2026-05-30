import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { sessionRepo, usersRepo } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/_admin")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const id = sessionRepo.current();
    const user = id ? usersRepo.findById(id) : null;
    if (!user || user.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});
