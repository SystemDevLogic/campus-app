import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getOrganizationSessionCookieName, readOrganizationSessionToken } from "@/lib/organizations/auth";
import { canCreatePlans, type AppRole } from "@/lib/constants/roles";
import { PLAN_CATEGORIES } from "@/lib/constants/plans";
import { createClient } from "@/lib/supabase/server";

import CreatePlanForm from "./CreatePlanForm";

function readFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function toIsoFromLocalDateTime(value: string) {
  return new Date(value).toISOString();
}

async function createOrganizationPlanAction(formData: FormData) {
  "use server";

  const cookieStore = await cookies();
  const token = cookieStore.get(getOrganizationSessionCookieName())?.value;
  const session = readOrganizationSessionToken(token);
  if (!session) {
    redirect("/organizations/access");
  }

  const title = readFormText(formData, "title");
  const description = readFormText(formData, "description");
  const category = readFormText(formData, "category");
  const campus = readFormText(formData, "campus");
  const startsAt = readFormText(formData, "startsAt");
  const capacity = readFormText(formData, "capacity");
  const withoutCapacity = readFormText(formData, "withoutCapacity") === "1";

  if (!title || !description || !campus || !startsAt) {
    redirect("/plans/new?orgError=missing");
  }

  if (!PLAN_CATEGORIES.includes(category as (typeof PLAN_CATEGORIES)[number])) {
    redirect("/plans/new?orgError=category");
  }

  const startsAtIso = toIsoFromLocalDateTime(startsAt);
  if (Number.isNaN(Date.parse(startsAtIso))) {
    redirect("/plans/new?orgError=date");
  }

  let capacityNumber: number | null = null;
  if (!withoutCapacity) {
    capacityNumber = Number(capacity);
    if (!Number.isInteger(capacityNumber) || capacityNumber < 2) {
      redirect("/plans/new?orgError=capacity");
    }
  }

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("organization_accounts")
    .select("id, is_active, organizations!inner(manager_user_id)")
    .eq("id", session.accountId)
    .maybeSingle();

  if (!account?.is_active) {
    redirect("/organizations/access");
  }

  const organization = Array.isArray(account.organizations) ? account.organizations[0] : account.organizations;
  const managerUserId = organization?.manager_user_id;
  if (!managerUserId) {
    redirect("/plans/new?orgError=account");
  }

  const { data: createdPlan, error: createPlanError } = await supabase
    .from("plans")
    .insert({
      creator_id: managerUserId,
      title,
      description,
      category,
      campus,
      starts_at: startsAtIso,
      capacity: capacityNumber,
    })
    .select("id")
    .maybeSingle();

  if (createPlanError || !createdPlan) {
    redirect("/plans/new?orgError=create");
  }

  const { error: memberError } = await supabase.from("plan_members").upsert(
    {
      plan_id: createdPlan.id,
      user_id: managerUserId,
      role: "host",
    },
    { onConflict: "plan_id,user_id" },
  );

  if (memberError) {
    redirect("/plans/new?orgError=member");
  }

  revalidatePath("/plans");
  redirect("/plans?created=1");
}

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

export default async function NewPlanPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = (await searchParams) ?? {};
  const orgError = typeof query.orgError === "string" ? query.orgError : "";

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const orgToken = cookieStore.get(getOrganizationSessionCookieName())?.value;
  const orgSession = readOrganizationSessionToken(orgToken);
  const isOrganizationSession = !authData.user && !!orgSession;

  if (isOrganizationSession) {
    const { data: account } = await supabase
      .from("organization_accounts")
      .select("id, is_active, organizations!inner(organization_name, organization_email)")
      .eq("id", orgSession.accountId)
      .maybeSingle();

    if (!account?.is_active) {
      redirect("/organizations/access");
    }

    const organization = Array.isArray(account.organizations) ? account.organizations[0] : account.organizations;
    if (!organization) {
      redirect("/organizations/access");
    }

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-16 text-zinc-900 dark:text-zinc-100">
        <Link href="/organizations/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          {"<- Volver al dashboard de organizacion"}
        </Link>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
          <h1 className="text-2xl font-semibold">Crear nuevo plan (organizacion)</h1>
          <p className="mt-2 text-sm text-zinc-300">Se publicara como plan de {organization.organization_name}.</p>

          {orgError ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              No se pudo crear el plan. Revisa los campos e intenta de nuevo.
            </p>
          ) : null}

          <form action={createOrganizationPlanAction} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Titulo</span>
              <input name="title" required className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Descripcion</span>
              <textarea name="description" required rows={4} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-300">Categoria</span>
                <select name="category" defaultValue={PLAN_CATEGORIES[0]} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100">
                  {PLAN_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-zinc-300">Aforo (opcional)</span>
                <input name="capacity" type="number" min={2} defaultValue="10" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" name="withoutCapacity" value="1" />
              {" "}
              Sin aforo
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Campus o punto de encuentro</span>
              <input name="campus" required className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Fecha y hora</span>
              <input name="startsAt" required type="datetime-local" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
            </label>

            <button type="submit" className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
              Crear plan
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (authError || !authData.user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, university, birth_date, interests, role")
    .eq("id", authData.user.id)
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
  if (!canCreatePlans(role)) {
    redirect("/plans?organizerOnly=1");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-16 text-zinc-900 dark:text-zinc-100">
      <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        {"<- Volver al dashboard"}
      </Link>

      <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
        <h1 className="text-2xl font-semibold">Crear nuevo plan</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Publica un plan para que otros estudiantes se unan.
        </p>

        <CreatePlanForm userId={authData.user.id} defaultCampus={profile.university} />
      </div>
    </main>
  );
}
