import WorkspaceSidebarShell from "@/components/ui/WorkspaceSidebarShell";

const ORGANIZATION_NAV_ITEMS = [
  { href: "/organizations/dashboard", label: "Dashboard organizacion", shortLabel: "DG" },
  { href: "/plans/new", label: "Crear plan", shortLabel: "CP" },
  { href: "/plans", label: "Planes", shortLabel: "PL" },
  { href: "/login", label: "Login principal", shortLabel: "LG" },
];

type OrganizationWorkspaceShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export default function OrganizationWorkspaceShell({ title, subtitle, children }: Readonly<OrganizationWorkspaceShellProps>) {
  return (
    <WorkspaceSidebarShell
      scopeLabel="Org"
      title={title}
      subtitle={subtitle}
      navItems={ORGANIZATION_NAV_ITEMS}
    >
      {children}
    </WorkspaceSidebarShell>
  );
}
