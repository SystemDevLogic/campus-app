import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";

import { getOrganizationSessionCookieName, readOrganizationSessionToken } from "@/lib/organizations/auth";
import { canCreatePlans, roleLabel, type AppRole } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";
import MainWorkspaceShell from "@/components/ui/MainWorkspaceShell";

function isProfileComplete(profile: {
  first_name: string | null;
  last_name: string | null;
  university: string | null;
  birth_date: string | null;
  interests: string[] | null;
}) {
  return Boolean(
    profile.first_name &&
      profile.last_name &&
      profile.university &&
      profile.birth_date &&
      profile.interests &&
      profile.interests.length > 0,
  );
}

export default async function DashboardPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = (await searchParams) ?? {};
  const superadminDenied = query.superadmin_denied === "1";
  const roleSelectorTestingEnabled = process.env.NEXT_PUBLIC_ENABLE_ROLE_SELECTOR === "true";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    const cookieStore = await cookies();
    const orgToken = cookieStore.get(getOrganizationSessionCookieName())?.value;
    const orgSession = readOrganizationSessionToken(orgToken);

    if (orgSession) {
      redirect("/organizations/dashboard");
    }

    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, university, birth_date, interests, role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (
    !profile ||
    !isProfileComplete({
      first_name: profile.first_name,
      last_name: profile.last_name,
      university: profile.university,
      birth_date: profile.birth_date,
      interests: profile.interests,
    })
  ) {
    redirect("/onboarding");
  }

  const role = (profile.role ?? "general_user") as AppRole;
  const allowPlanCreation = canCreatePlans(role);

  return (
    <MainWorkspaceShell role={role}>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
      <h1 className="text-3xl font-semibold">
        Hola, {profile.first_name} {profile.last_name}
      </h1>
      <p className="mt-2 text-zinc-300">
        Perfil listo. Siguiente objetivo: CRUD de planes y feed social.
      </p>

      {roleSelectorTestingEnabled ? (
        <p className="mt-3 inline-flex w-fit rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
          Modo pruebas: selector interno de rol activo
        </p>
      ) : null}

      {superadminDenied ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Tu cuenta no tiene acceso al panel superadmin.
        </p>
      ) : null}

      <p className="mt-2 inline-flex w-fit rounded-full border border-zinc-300 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
        Rol: {roleLabel(role)}
      </p>

      <div className="mt-6">
        {allowPlanCreation ? (
          <Link
            href="/plans/new"
            className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
          >
            Crear plan
          </Link>
        ) : null}
        <Link
          href="/plans"
          className={`${allowPlanCreation ? "ml-2 " : ""}inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500`}
        >
          Ver planes
        </Link>
      </div>

      {allowPlanCreation ? null : (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Tu cuenta actual puede unirse a planes, pero no crearlos.
        </p>
      )}

      {role === "general_user" ? (
        <div className="mt-3">
          <Link
            href="/organizations/request"
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
          >
            Solicitar creacion de organizacion
          </Link>
        </div>
      ) : null}

      {(role === "admin" || role === "superadmin") ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/admin/requests"
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
          >
            Revisar solicitudes
          </Link>
          <Link
            href="/admin/availability"
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
          >
            Configurar plataformas y links fijos
          </Link>
          <Link
            href="/admin/roles"
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
          >
            Gestionar roles administrativos
          </Link>
          <Link
            href="/admin/audit"
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
          >
            Ver auditoria de roles
          </Link>
          {role === "superadmin" ? (
            <Link
              href="/superadmin/dashboard"
              className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
            >
              Abrir dashboard admin
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-sm text-zinc-400">Universidad</p>
        <p className="text-lg text-zinc-100">{profile.university}</p>
        <p className="mt-4 text-sm text-zinc-400">Fecha de nacimiento</p>
        <p className="text-zinc-100">{profile.birth_date}</p>
        <p className="mt-4 text-sm text-zinc-400">Intereses</p>
        <p className="text-zinc-100">{profile.interests.join(", ")}</p>
      </div>
      </section>
    </MainWorkspaceShell>
  );
}
