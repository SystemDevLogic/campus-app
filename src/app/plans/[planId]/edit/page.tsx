import Link from "next/link";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PLAN_CATEGORIES } from "@/lib/constants/plans";
import { getOrganizationSessionCookieName, readOrganizationSessionToken } from "@/lib/organizations/auth";
import { createClient } from "@/lib/supabase/server";

type EditPlanPageProps = Readonly<{
  params: Promise<{ planId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>;

function readFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function toIsoFromLocalDateTime(value: string) {
  return new Date(value).toISOString();
}

function toLocalDateTime(isoDate: string) {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function resolvePlanActorUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (!authError && authData.user) {
    return authData.user.id;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(getOrganizationSessionCookieName())?.value;
  const orgSession = readOrganizationSessionToken(token);
  if (!orgSession) {
    redirect("/login");
  }

  const { data: account } = await supabase
    .from("organization_accounts")
    .select("id, is_active, organizations!inner(manager_user_id)")
    .eq("id", orgSession.accountId)
    .maybeSingle();

  if (!account?.is_active) {
    redirect("/organizations/access");
  }

  const organization = Array.isArray(account.organizations) ? account.organizations[0] : account.organizations;
  if (!organization?.manager_user_id) {
    redirect("/organizations/access");
  }

  return organization.manager_user_id;
}

async function updatePlanAction(formData: FormData) {
  "use server";

  const planId = readFormText(formData, "planId");
  const title = readFormText(formData, "title");
  const description = readFormText(formData, "description");
  const category = readFormText(formData, "category");
  const campus = readFormText(formData, "campus");
  const startsAt = readFormText(formData, "startsAt");
  const capacity = readFormText(formData, "capacity");
  const withoutCapacity = readFormText(formData, "withoutCapacity") === "1";

  if (!planId || !title || !description || !category || !campus || !startsAt) {
    redirect(`/plans/${planId}/edit?error=missing`);
  }

  if (!PLAN_CATEGORIES.includes(category as (typeof PLAN_CATEGORIES)[number])) {
    redirect(`/plans/${planId}/edit?error=category`);
  }

  const startsAtIso = toIsoFromLocalDateTime(startsAt);
  if (Number.isNaN(Date.parse(startsAtIso))) {
    redirect(`/plans/${planId}/edit?error=date`);
  }

  let capacityNumber: number | null = null;
  if (!withoutCapacity) {
    capacityNumber = Number(capacity);
    if (!Number.isInteger(capacityNumber) || capacityNumber < 2) {
      redirect(`/plans/${planId}/edit?error=capacity`);
    }
  }

  const supabase = await createClient();
  const actorUserId = await resolvePlanActorUserId(supabase);

  const { error: updateError } = await supabase
    .from("plans")
    .update({
      title,
      description,
      category,
      campus,
      starts_at: startsAtIso,
      capacity: capacityNumber,
    })
    .eq("id", planId)
    .eq("creator_id", actorUserId)
    .eq("status", "active");

  if (updateError) {
    redirect(`/plans/${planId}/edit?error=update`);
  }

  revalidatePath("/plans");
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/organizations/dashboard");
  redirect(`/plans/${planId}?updated=1`);
}

export default async function EditPlanPage({ params, searchParams }: EditPlanPageProps) {
  const { planId } = await params;
  const query = (await searchParams) ?? {};
  const errorFlag = typeof query.error === "string" ? query.error : "";

  const supabase = await createClient();
  const actorUserId = await resolvePlanActorUserId(supabase);

  const { data: plan } = await supabase
    .from("plans")
    .select("id, title, description, category, campus, starts_at, capacity, creator_id, status")
    .eq("id", planId)
    .maybeSingle();

  if (!plan) {
    redirect("/plans");
  }

  if (plan.status !== "active" || plan.creator_id !== actorUserId) {
    redirect("/plans");
  }

  const dashboardHref = "/organizations/dashboard";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-16 text-zinc-900 dark:text-zinc-100">
      <Link href={dashboardHref} className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        {"<- Volver al dashboard"}
      </Link>

      <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
        <h1 className="text-2xl font-semibold">Editar plan</h1>
        <p className="mt-2 text-sm text-zinc-300">Actualiza la informacion de tu plan activo.</p>

        {errorFlag ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            No se pudo actualizar el plan. Verifica los campos e intenta otra vez.
          </p>
        ) : null}

        <form action={updatePlanAction} className="mt-6 space-y-4">
          <input type="hidden" name="planId" value={plan.id} />

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Titulo</span>
            <input name="title" required defaultValue={plan.title} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Descripcion</span>
            <textarea
              name="description"
              rows={4}
              required
              defaultValue={plan.description}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Categoria</span>
              <select name="category" defaultValue={plan.category} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100">
                {PLAN_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Aforo (opcional)</span>
              <input
                name="capacity"
                type="number"
                min={2}
                defaultValue={plan.capacity ?? ""}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" name="withoutCapacity" value="1" defaultChecked={plan.capacity === null} />
            {" "}
            Sin aforo
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Campus o punto de encuentro</span>
            <input name="campus" required defaultValue={plan.campus} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Fecha y hora</span>
            <input
              name="startsAt"
              required
              type="datetime-local"
              defaultValue={toLocalDateTime(plan.starts_at)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
          </label>

          <button type="submit" className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
            Guardar cambios
          </button>
        </form>
      </div>
    </main>
  );
}
