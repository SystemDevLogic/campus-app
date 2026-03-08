import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getOrganizationSessionCookieName, readOrganizationSessionToken } from "@/lib/organizations/auth";
import { createClient } from "@/lib/supabase/server";

async function signOutOrganizationAction() {
  "use server";

  const supabase = await createClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete(getOrganizationSessionCookieName());
  redirect("/organizations/access");
}

export default async function OrganizationDashboardPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = (await searchParams) ?? {};
  const welcome = query.welcome === "1";

  const cookieStore = await cookies();
  const token = cookieStore.get(getOrganizationSessionCookieName())?.value;
  const session = readOrganizationSessionToken(token);

  if (!session) {
    redirect("/organizations/access");
  }

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("organization_accounts")
    .select("id, email, is_active, organizations!inner(id, organization_name, organization_email, status)")
    .eq("id", session.accountId)
    .maybeSingle();

  if (!account?.is_active) {
    const mutableCookies = await cookies();
    mutableCookies.delete(getOrganizationSessionCookieName());
    redirect("/organizations/access");
  }

  const organization = Array.isArray(account.organizations) ? account.organizations[0] : account.organizations;
  if (!organization) {
    redirect("/organizations/access");
  }

  const sameEmail = account.email.trim().toLowerCase() === organization.organization_email.trim().toLowerCase();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Organization Dashboard</p>
        <Link href="/plans" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          Ver planes de la app
        </Link>
      </div>

      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
        <h1 className="text-2xl font-semibold">Dashboard de organizacion</h1>
        {welcome ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Acceso inicial completado. Tu cuenta ya tiene contrasena.
          </p>
        ) : null}

        <div className="mt-4 space-y-2 text-sm text-zinc-300">
          <p>Organizacion: {organization.organization_name}</p>
          {sameEmail ? (
            <p>Correo: {account.email}</p>
          ) : (
            <>
              <p>Correo de cuenta: {account.email}</p>
              <p>Correo de organizacion: {organization.organization_email}</p>
            </>
          )}
          <p>Estado: {organization.status}</p>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
          <p className="text-sm text-zinc-300">Panel activo</p>
          <p className="mt-1 text-sm text-zinc-400">
            Este es el dashboard de tu organizacion. Aqui conectaremos los modulos de gestion, eventos y miembros.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/plans/new"
            className="inline-flex rounded-lg bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
          >
            Crear plan
          </Link>
          <Link
            href="/plans"
            className="inline-flex rounded-lg border border-zinc-500 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-300"
          >
            Ver planes
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/organizations/dashboard"
            className="inline-flex rounded-lg border border-zinc-500 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-300"
          >
            Actualizar panel
          </Link>
          <Link
            href="/login"
            className="inline-flex rounded-lg border border-zinc-500 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-300"
          >
            Ir a login principal
          </Link>
        </div>

        <form action={signOutOrganizationAction} className="mt-3">
          <button
            type="submit"
            className="cursor-pointer rounded-lg border border-zinc-500 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-300"
          >
            Cerrar sesion de organizacion
          </button>
        </form>
      </section>
    </main>
  );
}
