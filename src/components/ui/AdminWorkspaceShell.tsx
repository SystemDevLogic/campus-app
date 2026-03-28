import WorkspaceSidebarShell from "@/components/ui/WorkspaceSidebarShell";
import { type AppRole } from "@/lib/constants/roles";

type AdminWorkspaceShellProps = {
  role: AppRole;
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export default function AdminWorkspaceShell({ role, title, subtitle, children }: Readonly<AdminWorkspaceShellProps>) {
  const navItems = [
    { href: "/admin/requests", label: "Solicitudes", shortLabel: "SR" },
    { href: "/admin/availability", label: "Disponibilidad", shortLabel: "DP" },
    { href: "/admin/roles", label: "Roles", shortLabel: "RL" },
    { href: "/admin/audit", label: "Auditoria", shortLabel: "AU" },
    ...(role === "superadmin" ? [{ href: "/superadmin/dashboard", label: "Hub superadmin", shortLabel: "SA" }] : []),
    { href: "/dashboard", label: "Dashboard principal", shortLabel: "DB" },
  ];

  return (
    <WorkspaceSidebarShell
      scopeLabel={role === "superadmin" ? "Superadmin" : "Admin"}
      title={title}
      subtitle={subtitle}
      navItems={navItems}
    >
      {children}
    </WorkspaceSidebarShell>
  );
}
