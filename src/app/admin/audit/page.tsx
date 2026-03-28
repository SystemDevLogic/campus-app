import Link from "next/link";
import { redirect } from "next/navigation";

import AdminWorkspaceShell from "@/components/ui/AdminWorkspaceShell";
import { type AppRole, roleLabel } from "@/lib/constants/roles";
import EmailQuickActions from "@/components/ui/EmailQuickActions";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

type AuditRow = {
  id: string;
  target_user_id: string;
  previous_role: AppRole | null;
  new_role: AppRole | null;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
};

type ProfileBasic = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type AuditFilters = {
  text: string;
  role: "all" | AppRole;
  fromDate: string;
  toDate: string;
};

function canReviewAudit(role: AppRole) {
  return role === "admin" || role === "superadmin";
}

function profileName(profile: ProfileBasic | undefined) {
  if (!profile) return "Usuario";
  const value = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return value || "Usuario";
}

function readQueryText(query: Record<string, string | string[] | undefined>, key: string) {
  const value = query[key];
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && value.length > 0) return `${value[0]}`.trim();
  return "";
}

function normalizeRoleFilter(value: string): "all" | AppRole {
  if (value === "general_user" || value === "event_organizer" || value === "admin" || value === "superadmin") {
    return value;
  }
  return "all";
}

function dateAtStartOfDay(dateText: string) {
  if (!dateText) return null;
  const date = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateAtEndOfDay(dateText: string) {
  if (!dateText) return null;
  const date = new Date(`${dateText}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rowMatchesRoleFilter(row: AuditRow, roleFilter: "all" | AppRole) {
  if (roleFilter === "all") {
    return true;
  }
  return row.previous_role === roleFilter || row.new_role === roleFilter;
}

function rowMatchesDateFilter(row: AuditRow, fromDate: Date | null, toDate: Date | null) {
  if (!fromDate && !toDate) {
    return true;
  }

  const createdAt = new Date(row.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    return false;
  }

  if (fromDate && createdAt < fromDate) {
    return false;
  }
  if (toDate && createdAt > toDate) {
    return false;
  }

  return true;
}

function rowMatchesTextFilter(
  row: AuditRow,
  searchText: string,
  profilesById: Map<string, ProfileBasic>,
  emailsByUserId: Map<string, string>,
) {
  if (!searchText) {
    return true;
  }

  const targetProfile = profilesById.get(row.target_user_id);
  const actorProfile = row.changed_by ? profilesById.get(row.changed_by) : undefined;

  const targetName = profileName(targetProfile).toLowerCase();
  const actorName = profileName(actorProfile).toLowerCase();
  const reasonText = (row.reason ?? "").toLowerCase();
  const targetEmail = (emailsByUserId.get(row.target_user_id) ?? "").toLowerCase();
  const actorEmail = (row.changed_by ? emailsByUserId.get(row.changed_by) : "")?.toLowerCase() ?? "";

  return (
    targetName.includes(searchText) ||
    actorName.includes(searchText) ||
    reasonText.includes(searchText) ||
    targetEmail.includes(searchText) ||
    actorEmail.includes(searchText)
  );
}

export default async function AdminAuditPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = (await searchParams) ?? {};

  const filters: AuditFilters = {
    text: readQueryText(query, "q"),
    role: normalizeRoleFilter(readQueryText(query, "role")),
    fromDate: readQueryText(query, "from"),
    toDate: readQueryText(query, "to"),
  };

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    redirect("/login");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();

  const currentRole = (currentProfile?.role ?? "general_user") as AppRole;
  if (!canReviewAudit(currentRole)) {
    redirect("/dashboard");
  }

  const { data: auditRows } = await supabase
    .from("role_change_audit")
    .select("id, target_user_id, previous_role, new_role, changed_by, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const audits = (auditRows ?? []) as AuditRow[];

  const profileIds = new Set<string>();
  for (const row of audits) {
    profileIds.add(row.target_user_id);
    if (row.changed_by) {
      profileIds.add(row.changed_by);
    }
  }

  let profilesById = new Map<string, ProfileBasic>();
  if (profileIds.size > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", Array.from(profileIds));

    profilesById = new Map((profileRows ?? []).map((item) => [item.id, item as ProfileBasic]));
  }

  let emailsByUserId = new Map<string, string>();
  if (profileIds.size > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", Array.from(profileIds));

    emailsByUserId = new Map(
      (profileRows ?? [])
        .filter((row) => typeof row.id === "string" && typeof row.email === "string")
        .map((row) => [row.id as string, row.email as string]),
    );
  }

  const searchText = filters.text.toLowerCase();
  const fromDate = dateAtStartOfDay(filters.fromDate);
  const toDate = dateAtEndOfDay(filters.toDate);
  const exportParams = new URLSearchParams();
  if (filters.text) exportParams.set("q", filters.text);
  if (filters.role !== "all") exportParams.set("role", filters.role);
  if (filters.fromDate) exportParams.set("from", filters.fromDate);
  if (filters.toDate) exportParams.set("to", filters.toDate);
  const exportQuery = exportParams.toString();
  const exportHref = exportQuery ? `/admin/audit/export?${exportQuery}` : "/admin/audit/export";

  const filteredAudits = audits.filter((row) => {
    if (!rowMatchesRoleFilter(row, filters.role)) {
      return false;
    }
    if (!rowMatchesDateFilter(row, fromDate, toDate)) {
      return false;
    }
    return rowMatchesTextFilter(row, searchText, profilesById, emailsByUserId);
  });

  return (
    <AdminWorkspaceShell
      role={currentRole}
      title="Auditoria de cambios"
      subtitle="Consulta historial, responsables y motivos con filtros y exportacion CSV."
    >
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
        <h1 className="text-2xl font-semibold">Auditoria de cambios de rol</h1>
        <p className="mt-2 text-sm text-zinc-300">Rol actual: {roleLabel(currentRole)}</p>

        <form className="mt-4 grid gap-2 rounded-xl border border-zinc-700 bg-zinc-950 p-3 md:grid-cols-5" method="get">
          <input
            name="q"
            defaultValue={filters.text}
            placeholder="Buscar por nombre, correo o motivo"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 md:col-span-2"
          />
          <select
            name="role"
            defaultValue={filters.role}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
          >
            <option value="all">Todos los roles</option>
            <option value="general_user">Usuario general</option>
            <option value="event_organizer">Organizador de eventos</option>
            <option value="admin">Admin</option>
            <option value="superadmin">Superadmin</option>
          </select>
          <input
            type="date"
            name="from"
            defaultValue={filters.fromDate}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
          />
          <input
            type="date"
            name="to"
            defaultValue={filters.toDate}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
          />
          <div className="md:col-span-5 flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-900"
            >
              Aplicar filtros
            </button>
            <Link
              href="/admin/audit"
              className="rounded-lg border border-zinc-600 px-3 py-1 text-xs font-semibold text-zinc-200"
            >
              Limpiar
            </Link>
            <a
              href={exportHref}
              data-no-global-loader="true"
              className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300"
            >
              Exportar CSV
            </a>
          </div>
        </form>

        <div className="mt-6 space-y-3">
          {filteredAudits.length === 0 ? (
            <p className="rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-400">
              No hay resultados con los filtros actuales.
            </p>
          ) : null}

          {filteredAudits.map((row) => {
            const targetProfile = profilesById.get(row.target_user_id);
            const actorProfile = row.changed_by ? profilesById.get(row.changed_by) : undefined;
            const targetEmail = emailsByUserId.get(row.target_user_id) ?? "Correo no disponible";
            const actorEmail = row.changed_by
              ? (emailsByUserId.get(row.changed_by) ?? "Correo no disponible")
              : "No aplica";
            const targetName = profileName(targetProfile);
            const actorName = row.changed_by ? profileName(actorProfile) : "Sistema";
            const previousRoleLabel = roleLabel(row.previous_role ?? "general_user");
            const newRoleLabel = roleLabel(row.new_role ?? "general_user");
            const formattedDate = new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(row.created_at),
            );

            return (
              <article key={row.id} className="rounded-lg border border-zinc-700 bg-zinc-950 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
                    {previousRoleLabel}
                  </span>
                  <span className="text-xs text-zinc-400">{"->"}</span>
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                    {newRoleLabel}
                  </span>
                  <span className="ml-auto text-xs text-zinc-400">{formattedDate}</span>
                </div>

                <div className="mt-3 grid gap-2 text-xs text-zinc-300 md:grid-cols-2">
                  <div>
                    <p>
                      <span className="text-zinc-400">Objetivo:</span> {targetName}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-zinc-400">Correo:</span>
                      <span>{targetEmail}</span>
                      <EmailQuickActions email={targetEmail} />
                    </p>
                  </div>
                  <div>
                    <p>
                      <span className="text-zinc-400">Cambio realizado por:</span> {actorName}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-zinc-400">Correo:</span>
                      <span>{actorEmail}</span>
                      <EmailQuickActions email={actorEmail} />
                    </p>
                  </div>
                </div>

                {row.reason ? <p className="mt-2 text-xs text-zinc-300">Motivo: {row.reason}</p> : null}
              </article>
            );
          })}
        </div>
      </section>
    </AdminWorkspaceShell>
  );
}
