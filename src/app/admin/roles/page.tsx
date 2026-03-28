import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import AdminWorkspaceShell from "@/components/ui/AdminWorkspaceShell";
import { type AppRole, roleLabel } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";

type RoleRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  university: string | null;
  role: AppRole;
  role_assigned_at: string;
  is_active: boolean;
};

type AdminCapabilitiesRow = {
  admin_user_id: string;
  can_promote_general_users: boolean;
  can_demote_newer_admins: boolean;
  can_manage_roles: boolean;
  can_manage_org_parameters: boolean;
};

type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  role: AppRole;
  roleAssignedAt: string;
  adminsCanManageRolesGlobally: boolean;
  allowManageRoles: boolean;
  canPromoteGeneralUsers: boolean;
  canDemoteNewerAdmins: boolean;
};

function readFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readFormBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function fullName(row: Pick<RoleRow, "first_name" | "last_name">) {
  const value = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return value || "Usuario";
}

function canReviewRoles(role: AppRole) {
  return role === "admin" || role === "superadmin";
}

function isOlderOrSameAdmin(actorAssignedAt: string, targetAssignedAt: string) {
  return new Date(targetAssignedAt).getTime() <= new Date(actorAssignedAt).getTime();
}

async function getAdminRoleContext(): Promise<AdminContext> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    redirect("/login");
  }

  const userId = authData.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, role_assigned_at")
    .eq("id", userId)
    .maybeSingle();

  const role = (profile?.role ?? "general_user") as AppRole;
  const roleAssignedAt = profile?.role_assigned_at ?? new Date().toISOString();

  if (!canReviewRoles(role)) {
    redirect("/dashboard");
  }

  const { data: settings } = await supabase
    .from("app_settings")
    .select("admins_can_manage_roles_globally")
    .eq("id", 1)
    .maybeSingle();

  const { data: capabilities } = await supabase
    .from("admin_capabilities")
    .select("can_promote_general_users, can_demote_newer_admins, can_manage_roles")
    .eq("admin_user_id", userId)
    .maybeSingle();

  const adminsCanManageRolesGlobally = settings?.admins_can_manage_roles_globally ?? true;
  const canManageRoles = capabilities?.can_manage_roles ?? true;

  const allowManageRoles = role === "superadmin" ? true : adminsCanManageRolesGlobally && canManageRoles;

  return {
    supabase,
    userId,
    role,
    roleAssignedAt,
    adminsCanManageRolesGlobally,
    allowManageRoles,
    canPromoteGeneralUsers: capabilities?.can_promote_general_users ?? true,
    canDemoteNewerAdmins: capabilities?.can_demote_newer_admins ?? true,
  };
}

async function updateGlobalRoleGovernanceAction(formData: FormData) {
  "use server";

  const enabled = readFormBoolean(formData, "adminsCanManageRolesGlobally");
  const context = await getAdminRoleContext();
  if (context.role !== "superadmin") {
    redirect("/admin/roles?forbidden=1");
  }

  const { error } = await context.supabase
    .from("app_settings")
    .update({ admins_can_manage_roles_globally: enabled })
    .eq("id", 1);

  if (error) {
    redirect("/admin/roles?error=1");
  }

  revalidatePath("/admin/roles");
  revalidatePath("/dashboard");
  redirect("/admin/roles?settings=1");
}

async function updateAdminCapabilitiesAction(formData: FormData) {
  "use server";

  const targetUserId = readFormText(formData, "targetUserId");
  if (!targetUserId) {
    redirect("/admin/roles?error=1");
  }

  const context = await getAdminRoleContext();
  if (context.role !== "superadmin") {
    redirect("/admin/roles?forbidden=1");
  }

  const canPromote = readFormBoolean(formData, "canPromoteGeneralUsers");
  const canDemote = readFormBoolean(formData, "canDemoteNewerAdmins");
  const canManageRoles = readFormBoolean(formData, "canManageRoles");
  const canManageOrgParameters = readFormBoolean(formData, "canManageOrgParameters");

  const { data: targetProfile } = await context.supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", targetUserId)
    .maybeSingle();

  const targetRole = (targetProfile?.role ?? "general_user") as AppRole;
  if (!targetProfile?.is_active || targetRole !== "admin") {
    redirect("/admin/roles?error=1");
  }

  const { error } = await context.supabase.from("admin_capabilities").upsert({
    admin_user_id: targetUserId,
    can_promote_general_users: canPromote,
    can_demote_newer_admins: canDemote,
    can_manage_roles: canManageRoles,
    can_manage_org_parameters: canManageOrgParameters,
  });

  if (error) {
    redirect("/admin/roles?error=1");
  }

  revalidatePath("/admin/roles");
  redirect("/admin/roles?capabilities=1");
}

async function writeRoleAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  targetUserId: string,
  previousRole: AppRole,
  nextRole: AppRole,
  changedBy: string,
  reason: string,
) {
  await supabase.from("role_change_audit").insert({
    target_user_id: targetUserId,
    previous_role: previousRole,
    new_role: nextRole,
    changed_by: changedBy,
    reason: reason || null,
  });
}

async function promoteToAdminAction(formData: FormData) {
  "use server";

  const targetUserId = readFormText(formData, "targetUserId");
  const reason = readFormText(formData, "reason");
  if (!targetUserId) {
    redirect("/admin/roles?error=1");
  }

  const context = await getAdminRoleContext();
  if (!context.allowManageRoles) {
    redirect("/admin/roles?forbidden=1");
  }

  if (context.role === "admin" && !context.canPromoteGeneralUsers) {
    redirect("/admin/roles?forbidden=1");
  }

  const { data: targetProfile } = await context.supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", targetUserId)
    .maybeSingle();

  const targetRole = (targetProfile?.role ?? "general_user") as AppRole;
  if (!targetProfile?.is_active || targetRole !== "general_user") {
    redirect("/admin/roles?error=1");
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await context.supabase
    .from("profiles")
    .update({
      role: "admin",
      role_assigned_at: nowIso,
      is_active: true,
    })
    .eq("id", targetUserId)
    .eq("role", "general_user");

  if (updateError) {
    redirect("/admin/roles?error=1");
  }

  await context.supabase.from("admin_capabilities").upsert({
    admin_user_id: targetUserId,
    can_promote_general_users: true,
    can_demote_newer_admins: true,
    can_manage_roles: true,
  });

  await writeRoleAudit(context.supabase, targetUserId, "general_user", "admin", context.userId, reason);

  revalidatePath("/admin/roles");
  revalidatePath("/dashboard");
  redirect("/admin/roles?promoted=1");
}

async function demoteAdminAction(formData: FormData) {
  "use server";

  const targetUserId = readFormText(formData, "targetUserId");
  const reason = readFormText(formData, "reason");
  if (!targetUserId) {
    redirect("/admin/roles?error=1");
  }

  const context = await getAdminRoleContext();
  if (!context.allowManageRoles) {
    redirect("/admin/roles?forbidden=1");
  }

  if (context.role === "admin" && !context.canDemoteNewerAdmins) {
    redirect("/admin/roles?forbidden=1");
  }

  if (context.userId === targetUserId && context.role !== "superadmin") {
    redirect("/admin/roles?forbidden=1");
  }

  const { data: targetProfile } = await context.supabase
    .from("profiles")
    .select("id, role, role_assigned_at, is_active")
    .eq("id", targetUserId)
    .maybeSingle();

  const targetRole = (targetProfile?.role ?? "general_user") as AppRole;
  if (!targetProfile?.is_active || targetRole !== "admin") {
    redirect("/admin/roles?error=1");
  }

  if (context.role === "admin" && isOlderOrSameAdmin(context.roleAssignedAt, targetProfile.role_assigned_at)) {
    redirect("/admin/roles?seniority=1");
  }

  const { error: updateError } = await context.supabase
    .from("profiles")
    .update({ role: "general_user" })
    .eq("id", targetUserId)
    .eq("role", "admin");

  if (updateError) {
    redirect("/admin/roles?error=1");
  }

  await writeRoleAudit(context.supabase, targetUserId, "admin", "general_user", context.userId, reason);

  revalidatePath("/admin/roles");
  revalidatePath("/dashboard");
  redirect("/admin/roles?demoted=1");
}

export default async function AdminRolesPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = (await searchParams) ?? {};
  const promoted = query.promoted === "1";
  const demoted = query.demoted === "1";
  const error = query.error === "1";
  const forbidden = query.forbidden === "1";
  const seniority = query.seniority === "1";
  const settingsSaved = query.settings === "1";
  const capabilitiesSaved = query.capabilities === "1";

  const context = await getAdminRoleContext();

  const { data: profiles } = await context.supabase
    .from("profiles")
    .select("id, first_name, last_name, university, role, role_assigned_at, is_active")
    .eq("is_active", true)
    .order("role_assigned_at", { ascending: true })
    .limit(300);

  const { data: capabilities } = await context.supabase
    .from("admin_capabilities")
    .select("admin_user_id, can_promote_general_users, can_demote_newer_admins, can_manage_roles, can_manage_org_parameters");

  const capabilitiesByAdmin = new Map<string, AdminCapabilitiesRow>();
  for (const row of capabilities ?? []) {
    capabilitiesByAdmin.set(row.admin_user_id, row as AdminCapabilitiesRow);
  }

  const generalUsers = (profiles ?? []).filter((item) => item.role === "general_user") as RoleRow[];
  const admins = (profiles ?? []).filter((item) => item.role === "admin") as RoleRow[];
  const showManagementDisabledNotice = context.allowManageRoles === false;

  return (
    <AdminWorkspaceShell
      role={context.role}
      title="Gobernanza de roles"
      subtitle="Promociona, degrada y configura capacidades administrativas desde un panel lateral centralizado."
    >
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
        <h1 className="text-2xl font-semibold">Gestion de roles administrativos</h1>
        <p className="mt-2 text-sm text-zinc-300">Tu rol: {roleLabel(context.role)}</p>

        {promoted ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Usuario promovido a admin.</p> : null}
        {demoted ? <p className="mt-4 rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-700">Admin degradado a usuario general.</p> : null}
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo completar la accion.</p> : null}
        {forbidden ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">No tienes permisos para esta accion.</p> : null}
        {seniority ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">No puedes degradar administradores mas antiguos o de la misma antiguedad.</p> : null}
        {settingsSaved ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Configuracion global actualizada.</p> : null}
        {capabilitiesSaved ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Permisos de administrador actualizados.</p> : null}

        {showManagementDisabledNotice ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            La gestion de roles para administradores esta deshabilitada para tu cuenta.
          </p>
        ) : null}

        {context.role === "superadmin" ? (
          <section className="mt-6 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
            <h2 className="text-lg font-semibold">Controles de superadmin</h2>
            <p className="mt-1 text-xs text-zinc-400">Define si los admins pueden gestionar roles a nivel global.</p>
            <form action={updateGlobalRoleGovernanceAction} className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  name="adminsCanManageRolesGlobally"
                  defaultChecked={context.adminsCanManageRolesGlobally}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-900"
                />
                <span>Admins pueden gestionar roles (global)</span>
              </label>
              <button
                type="submit"
                className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-900"
              >
                Guardar configuracion global
              </button>
            </form>
          </section>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
            <h2 className="text-lg font-semibold">Promover usuarios generales</h2>
            <p className="mt-1 text-xs text-zinc-400">Convierte usuarios generales activos en administradores.</p>
            <div className="mt-4 space-y-3">
              {generalUsers.length === 0 ? <p className="text-sm text-zinc-400">No hay usuarios generales disponibles.</p> : null}
              {generalUsers.map((item) => (
                <article key={item.id} className="rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                  <p className="text-sm font-semibold text-zinc-100">{fullName(item)}</p>
                  <p className="mt-1 text-xs text-zinc-400">{item.university ?? "Sin universidad"}</p>
                  <form action={promoteToAdminAction} className="mt-2 space-y-2">
                    <input type="hidden" name="targetUserId" value={item.id} />
                    <input
                      name="reason"
                      placeholder="Motivo (opcional)"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                    />
                    <button
                      type="submit"
                      disabled={!context.allowManageRoles || (context.role === "admin" && !context.canPromoteGeneralUsers)}
                      className="w-full rounded-lg bg-emerald-500 px-2 py-1 text-xs font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Promover a admin
                    </button>
                  </form>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
            <h2 className="text-lg font-semibold">Administradores activos</h2>
            <p className="mt-1 text-xs text-zinc-400">Solo superadmin o admins mas antiguos pueden degradar.</p>
            <div className="mt-4 space-y-3">
              {admins.length === 0 ? <p className="text-sm text-zinc-400">No hay administradores activos.</p> : null}
              {admins.map((item) => {
                const itemCaps = capabilitiesByAdmin.get(item.id);
                const canDemoteThisAdmin =
                  context.allowManageRoles &&
                  (context.role === "superadmin" || !isOlderOrSameAdmin(context.roleAssignedAt, item.role_assigned_at));

                return (
                  <article key={item.id} className="rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                    <p className="text-sm font-semibold text-zinc-100">{fullName(item)}</p>
                    <p className="mt-1 text-xs text-zinc-400">Asignado: {new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.role_assigned_at))}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Permisos: promover({itemCaps?.can_promote_general_users ? "si" : "no"}) · degradar({itemCaps?.can_demote_newer_admins ? "si" : "no"}) · gestionar roles({itemCaps?.can_manage_roles ? "si" : "no"}) · gestionar parametros({itemCaps?.can_manage_org_parameters ? "si" : "no"})
                    </p>
                    <form action={demoteAdminAction} className="mt-2 space-y-2">
                      <input type="hidden" name="targetUserId" value={item.id} />
                      <input
                        name="reason"
                        placeholder="Motivo (opcional)"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                      />
                      <button
                        type="submit"
                        disabled={!canDemoteThisAdmin || (context.role === "admin" && !context.canDemoteNewerAdmins)}
                        className="w-full rounded-lg border border-red-400 px-2 py-1 text-xs font-semibold text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Degradar a usuario general
                      </button>
                    </form>
                    {context.role === "superadmin" ? (
                      <form action={updateAdminCapabilitiesAction} className="mt-3 space-y-2 rounded-lg border border-zinc-700 bg-zinc-950 p-2">
                        <input type="hidden" name="targetUserId" value={item.id} />
                        <label className="flex items-center gap-2 text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            name="canPromoteGeneralUsers"
                            defaultChecked={itemCaps?.can_promote_general_users ?? true}
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900"
                          />
                          <span>Puede promover usuarios generales</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            name="canDemoteNewerAdmins"
                            defaultChecked={itemCaps?.can_demote_newer_admins ?? true}
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900"
                          />
                          <span>Puede degradar admins nuevos</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            name="canManageRoles"
                            defaultChecked={itemCaps?.can_manage_roles ?? true}
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900"
                          />
                          <span>Puede gestionar roles</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            name="canManageOrgParameters"
                            defaultChecked={itemCaps?.can_manage_org_parameters ?? true}
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900"
                          />
                          <span>Puede gestionar parametros de organizaciones</span>
                        </label>
                        <button
                          type="submit"
                          className="w-full rounded-lg border border-zinc-500 px-2 py-1 text-xs font-semibold text-zinc-200"
                        >
                          Guardar permisos
                        </button>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </AdminWorkspaceShell>
  );
}
