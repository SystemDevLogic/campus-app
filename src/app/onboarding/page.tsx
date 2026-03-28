import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getEcuadorUniversities } from "@/lib/universities";
import { type AppRole } from "@/lib/constants/roles";

import OnboardingForm from "./OnboardingForm";

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

export default async function OnboardingPage() {
  const showRoleSelector = process.env.NEXT_PUBLIC_ENABLE_ROLE_SELECTOR === "true";
  const supabase = await createClient();
  const universities = await getEcuadorUniversities();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, university, birth_date, interests, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  const initialRole = (profile?.role ?? "general_user") as AppRole;

  if (
    profile &&
    isProfileComplete({
      first_name: profile.first_name,
      last_name: profile.last_name,
      university: profile.university,
      birth_date: profile.birth_date,
      interests: profile.interests,
    })
  ) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16 text-zinc-100">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h1 className="text-2xl font-semibold">Completa tu perfil</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Necesitamos estos datos para mostrarte planes relevantes en tu campus.
        </p>

        <OnboardingForm
          userId={userData.user.id}
          showRoleSelector={showRoleSelector}
          universities={universities}
          initialFirstName={profile?.first_name ?? ""}
          initialLastName={profile?.last_name ?? ""}
          initialUniversity={profile?.university ?? ""}
          initialBirthDate={profile?.birth_date ?? ""}
          initialInterests={Array.isArray(profile?.interests) ? profile.interests : []}
          initialRole={initialRole}
        />
      </div>
    </main>
  );
}
