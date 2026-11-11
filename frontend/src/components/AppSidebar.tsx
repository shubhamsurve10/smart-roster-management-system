import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard, CalendarDays, Users, Boxes, Tag, Workflow, Link2,
   CalendarOff, Plane, PartyPopper, ShieldCheck, Settings, LogOut,
} from "lucide-react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { canVisit } from "@/lib/access";
import { Button } from "@/components/ui/button";

const main = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/roster", label: "Monthly Roster", icon: CalendarDays },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/pods", label: "Pods", icon: Boxes },
  { to: "/brands", label: "Brands", icon: Tag },
  { to: "/processes", label: "Processes", icon: Workflow },
  { to: "/assignments", label: "Assignments", icon: Link2 },
] as const;

const rules = [
  { to: "/weekly-off-rules", label: "Weekly Off Rules", icon: CalendarOff },
  { to: "/leaves", label: "Leaves", icon: Plane },
  { to: "/holidays", label: "Holidays", icon: PartyPopper },
  { to: "/coverage-overrides", label: "Coverage Overrides", icon: ShieldCheck },
] as const;

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Users }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === "/" }}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      activeProps={{ className: "bg-sidebar-accent text-sidebar-primary font-medium" }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function AppSidebar() {
  const { user, signOut } = useAuth();
  console.log("Logged-in sidebar user:", user);
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const visible = (path: string) => !!user && canVisit(user.role, path);
  async function logout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    signOut();
    await navigate({ to: "/login", replace: true });
    await router.invalidate();
  }
  return (
    <aside className="flex w-full shrink-0 flex-col border-sidebar-border bg-sidebar md:sticky md:top-0 md:h-screen md:w-60 md:border-r">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <CalendarDays className="h-4 w-4" />
        </div>
        <span className="font-semibold text-foreground">Smart Roster</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {main.filter((i) => visible(i.to)).map((i) => <NavItem key={i.to} {...i} label={i.to === "/roster" && user?.role === "agent" ? "My Roster" : i.label} />)}
        {rules.some((i) => visible(i.to)) && <p className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Scheduling Rules
        </p>}
        {rules.filter((i) => visible(i.to)).map((i) => <NavItem key={i.to} {...i} />)}
        {visible("/settings") && <div className="pt-4">
          <NavItem to="/settings" label="Settings" icon={Settings} />
        </div>}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-border p-4">
        <div className="min-w-0"><p className="truncate text-sm font-medium">{user?.name || user?.email}</p><p className="text-xs text-muted-foreground">{user?.role === "pod_lead" ? "Pod Manager" : user?.role === "admin" ? "Admin" : "Agent"}</p></div>
        <Button size="icon" variant="ghost" aria-label="Sign out" title="Sign out" onClick={logout}><LogOut className="h-4 w-4" /></Button>
      </div>
    </aside>
  );
}
