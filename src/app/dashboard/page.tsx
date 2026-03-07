import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, university, birth_date, interests")
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-16 text-zinc-100">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Dashboard</p>
      <h1 className="mt-3 text-3xl font-semibold">
        Hola, {profile.first_name} {profile.last_name}
      </h1>
      <p className="mt-4 text-zinc-300">Perfil listo. Siguiente objetivo: CRUD de planes y feed social.</p>

      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm text-zinc-400">Universidad</p>
        <p className="text-lg text-zinc-100">{profile.university}</p>
        <p className="mt-4 text-sm text-zinc-400">Fecha de nacimiento</p>
        <p className="text-zinc-100">{profile.birth_date}</p>
        <p className="mt-4 text-sm text-zinc-400">Intereses</p>
        <p className="text-zinc-100">{profile.interests.join(", ")}</p>
      </div>
    </main>
  );
}
