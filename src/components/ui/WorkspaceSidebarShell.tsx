"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

type WorkspaceNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
};

type WorkspaceSidebarShellProps = {
  scopeLabel: string;
  title: string;
  subtitle: string;
  navItems: WorkspaceNavItem[];
  children: React.ReactNode;
};

function itemInitial(label: string) {
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "#";
}

export default function WorkspaceSidebarShell({
  scopeLabel,
  title,
  subtitle,
  navItems,
  children,
}: Readonly<WorkspaceSidebarShellProps>) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarWidthClass = expanded ? "md:w-72" : "md:w-24";

  const navContent = useMemo(
    () => (
      <nav className="mt-5 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                isActive
                  ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border border-transparent text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/70"
              }`}
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-600 bg-zinc-900 text-[11px] font-semibold text-zinc-300">
                {item.shortLabel ?? itemInitial(item.label)}
              </span>
              {expanded ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>
    ),
    [expanded, navItems, pathname],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.15),_rgba(24,24,27,1)_40%)] text-zinc-100">
      <div className="mx-auto flex w-full max-w-[1500px]">
        <aside className={`hidden min-h-screen border-r border-zinc-800 bg-zinc-950/95 p-4 backdrop-blur md:flex md:flex-col ${sidebarWidthClass}`}>
          <div className="flex items-center justify-between gap-2">
            {expanded ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">{scopeLabel}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-100">Panel</p>
              </div>
            ) : (
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{scopeLabel.slice(0, 2)}</p>
            )}
            <button
              type="button"
              data-no-global-loader="true"
              onClick={() => setExpanded((prev) => !prev)}
              className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500"
            >
              {expanded ? "<<" : ">>"}
            </button>
          </div>

          {navContent}

          <div className="mt-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-[11px] text-zinc-400">Navegacion optimizada para admin y futura app movil.</p>
          </div>
        </aside>

        <div className="min-h-screen flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <header className="sticky top-0 z-20 mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/85 p-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{scopeLabel}</p>
                <h1 className="mt-1 text-xl font-semibold text-zinc-100 sm:text-2xl">{title}</h1>
                <p className="mt-1 text-xs text-zinc-400 sm:text-sm">{subtitle}</p>
              </div>
              <button
                type="button"
                data-no-global-loader="true"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-500 md:hidden"
              >
                Menu
              </button>
            </div>
          </header>

          <div className="space-y-4">{children}</div>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            data-no-global-loader="true"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-zinc-950/70"
            aria-label="Cerrar menu"
          />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">{scopeLabel}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-100">Panel</p>
              </div>
              <button
                type="button"
                data-no-global-loader="true"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500"
              >
                Cerrar
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
