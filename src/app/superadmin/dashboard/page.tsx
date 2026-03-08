import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function SuperadminDashboardPage({
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profile?.role !== "superadmin") {
    redirect("/dashboard?superadmin_denied=1");
  }

  const name = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Superadmin";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-400">Superadmin Hub</p>
      <h1 className="mt-3 text-3xl font-semibold">Hola, {name}</h1>
      <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
        Desde aqui gestionas configuraciones globales y permisos de administradores.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/admin/roles"
          className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
        >
          Gestionar roles y capacidades
        </Link>
        <Link
          href="/admin/requests"
          className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
        >
          Revisar solicitudes de organizacion
        </Link>
        <Link
          href="/admin/availability"
          className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
        >
          Configurar disponibilidad admin
        </Link>
      </div>

      <div className="mt-4">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {"<- Ir al dashboard general"}
        </Link>
      </div>
    </main>
  );
}
