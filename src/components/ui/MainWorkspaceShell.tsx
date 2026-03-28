import { type AppRole, canCreatePlans } from "@/lib/constants/roles";
import WorkspaceSidebarShell from "@/components/ui/WorkspaceSidebarShell";

type MainWorkspaceShellProps = {
  role: AppRole;
  children: React.ReactNode;
};

export default function MainWorkspaceShell({ role, children }: Readonly<MainWorkspaceShellProps>) {
  const baseNavItems = [
    { href: "/dashboard", label: "Inicio", shortLabel: "IN" },
    { href: "/plans", label: "Planes", shortLabel: "PL" },
  ];

  const roleNavItems = [
    ...(canCreatePlans(role) ? [{ href: "/plans/new", label: "Crear plan", shortLabel: "CP" }] : []),
    ...(role === "general_user" ? [{ href: "/organizations/request", label: "Solicitud org", shortLabel: "SO" }] : []),
    ...(role === "admin" || role === "superadmin"
      ? [
          { href: "/admin/requests", label: "Solicitudes admin", shortLabel: "AR" },
          { href: "/admin/availability", label: "Disponibilidad", shortLabel: "DP" },
          { href: "/admin/roles", label: "Roles", shortLabel: "RL" },
          { href: "/admin/audit", label: "Auditoria", shortLabel: "AU" },
        ]
      : []),
    ...(role === "superadmin" ? [{ href: "/superadmin/dashboard", label: "Hub superadmin", shortLabel: "SA" }] : []),
  ];

  const navItems = [...baseNavItems, ...roleNavItems];

  return (
    <WorkspaceSidebarShell
      scopeLabel="Campus"
      title="Dashboard principal"
      subtitle="Vista general con navegacion lateral expandible y responsive."
      navItems={navItems}
    >
      {children}
    </WorkspaceSidebarShell>
  );
}
