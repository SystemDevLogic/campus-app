import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PLAN_CATEGORIES } from "@/lib/constants/plans";
import { canCreatePlans, type AppRole } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";

type SearchParams = {
  category?: string;
  campus?: string;
  date?: string;
  created?: string;
  joined?: string;
  left?: string;
  full?: string;
  joinError?: string;
  organizerOnly?: string;
  organizerBlocked?: string;
};

type PlanMembership = {
  count: number;
  joined: boolean;
  isHost: boolean;
};

type PlanItem = {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  category: string;
  campus: string;
  starts_at: string;
  capacity: number | null;
};

type PlanFeedbackProps = {
  created: boolean;
  joined: boolean;
  left: boolean;
  full: boolean;
  joinError: boolean;
  organizerOnly: boolean;
  organizerBlocked: boolean;
};

type PlansFilters = {
  category: string;
  campus: string;
  date: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function joinPlanAction(formData: FormData) {
  "use server";

  const planId = formData.get("planId");
  if (typeof planId !== "string" || !planId) {
    redirect("/plans?joinError=1");
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect("/login");
  }

  const userId = authData.user.id;

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const currentRole = (currentProfile?.role ?? "general_user") as AppRole;

  const { data: existingMember } = await supabase
    .from("plan_members")
    .select("plan_id")
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingMember) {
    redirect("/plans?joined=1");
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("capacity, status, creator_id")
    .eq("id", planId)
    .maybeSingle();

  if (planError || plan?.status !== "active") {
    redirect("/plans?joinError=1");
  }

  if (currentRole === "event_organizer" && plan.creator_id !== userId) {
    redirect("/plans?organizerBlocked=1");
  }

  const { count: currentMembers } = await supabase
    .from("plan_members")
    .select("*", { count: "exact", head: true })
    .eq("plan_id", planId);

  if (plan.capacity !== null && (currentMembers ?? 0) >= plan.capacity) {
    redirect("/plans?full=1");
  }

  const { error: insertError } = await supabase.from("plan_members").insert({
    plan_id: planId,
    user_id: userId,
    role: "member",
  });

  if (insertError) {
    redirect("/plans?joinError=1");
  }

  revalidatePath("/plans");
  redirect("/plans?joined=1");
}

async function leavePlanAction(formData: FormData) {
  "use server";

  const planId = formData.get("planId");
  if (typeof planId !== "string" || !planId) {
    redirect("/plans?joinError=1");
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect("/login");
  }

  const { error: deleteError } = await supabase
    .from("plan_members")
    .delete()
    .eq("plan_id", planId)
    .eq("user_id", authData.user.id)
    .neq("role", "host");

  if (deleteError) {
    redirect("/plans?joinError=1");
  }

  revalidatePath("/plans");
  redirect("/plans?left=1");
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

function formatDateLabel(isoDate: string) {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function PlanFeedbackMessages({
  created,
  joined,
  left,
  full,
  joinError,
  organizerOnly,
  organizerBlocked,
}: Readonly<PlanFeedbackProps>) {
  return (
    <>
      {created ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Plan creado correctamente.
        </p>
      ) : null}

      {joined ? (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Te uniste al plan.
        </p>
      ) : null}

      {left ? (
        <p className="mt-4 rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
          Saliste del plan.
        </p>
      ) : null}

      {full ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Este plan ya esta lleno.
        </p>
      ) : null}

      {joinError ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo completar la accion. Intenta de nuevo.
        </p>
      ) : null}

      {organizerOnly ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Solo organizadores y administradores pueden crear planes.
        </p>
      ) : null}

      {organizerBlocked ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Una cuenta organizadora no puede unirse a planes de otros organizadores.
        </p>
      ) : null}
    </>
  );
}

type PlanCardProps = {
  plan: PlanItem;
  membership: PlanMembership;
  role: AppRole;
  currentUserId: string;
};

function PlanCard({ plan, membership, role, currentUserId }: Readonly<PlanCardProps>) {
  const isLimited = plan.capacity !== null;
  const maxCapacity = plan.capacity ?? 0;
  const isFull = isLimited && membership.count >= maxCapacity;
  const organizerCannotJoin = role === "event_organizer" && plan.creator_id !== currentUserId;

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <p className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">{plan.category}</p>
        {isLimited ? (
          <p className="text-xs text-zinc-500">
            Aforo: {membership.count}/{plan.capacity}
          </p>
        ) : null}
      </div>

      <h2 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{plan.title}</h2>
      <p className="mt-2 line-clamp-3 text-sm text-zinc-700 dark:text-zinc-300">{plan.description}</p>

      <div className="mt-4 space-y-1 text-sm text-zinc-600">
        <p>{plan.campus}</p>
        <p>{formatDateLabel(plan.starts_at)}</p>
      </div>

      <div className="mt-4">
        {!membership.joined && !isFull && !organizerCannotJoin ? (
          <form action={joinPlanAction}>
            <input type="hidden" name="planId" value={plan.id} />
            <button
              type="submit"
              className="w-full cursor-pointer rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
            >
              Unirme
            </button>
          </form>
        ) : null}

        {!membership.joined && isFull ? (
          <button
            type="button"
            disabled
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-500"
          >
            Plan lleno
          </button>
        ) : null}

        {!membership.joined && organizerCannotJoin ? (
          <button
            type="button"
            disabled
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-500"
          >
            Cuenta organizador
          </button>
        ) : null}

        {membership.joined && !membership.isHost ? (
          <div className="space-y-2">
            <Link
              href={`/plans/${plan.id}`}
              className="block w-full rounded-lg bg-zinc-900 px-3 py-2 text-center text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
            >
              Abrir chat
            </Link>
            <form action={leavePlanAction}>
              <input type="hidden" name="planId" value={plan.id} />
              <button
                type="submit"
                className="w-full cursor-pointer rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
              >
                Salirme
              </button>
            </form>
          </div>
        ) : null}

        {membership.joined && membership.isHost ? (
          <div className="space-y-2">
            <Link
              href={`/plans/${plan.id}`}
              className="block w-full rounded-lg bg-zinc-900 px-3 py-2 text-center text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
            >
              Abrir chat
            </Link>
            <button
              type="button"
              disabled
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-500"
            >
              Eres host
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

async function requireAuthedProfile(supabase: SupabaseServerClient) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
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

  return {
    userId: authData.user.id,
    role: (profile.role ?? "general_user") as AppRole,
  };
}

async function fetchPlans(supabase: SupabaseServerClient, filters: PlansFilters) {
  let query = supabase
    .from("plans")
    .select("id, creator_id, title, description, category, campus, starts_at, capacity")
    .eq("status", "active")
    .order("starts_at", { ascending: true })
    .limit(50);

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (filters.campus.trim()) {
    query = query.ilike("campus", `%${filters.campus.trim()}%`);
  }

  if (filters.date) {
    const start = new Date(`${filters.date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    query = query.gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString());
  }

  return query;
}

async function buildMembershipMap(supabase: SupabaseServerClient, planIds: string[], userId: string) {
  const membershipByPlan = new Map<string, PlanMembership>();
  if (planIds.length === 0) {
    return membershipByPlan;
  }

  const { data: members } = await supabase
    .from("plan_members")
    .select("plan_id, user_id, role")
    .in("plan_id", planIds);

  for (const planId of planIds) {
    membershipByPlan.set(planId, { count: 0, joined: false, isHost: false });
  }

  for (const member of members ?? []) {
    const current = membershipByPlan.get(member.plan_id);
    if (!current) continue;

    const isCurrentUser = member.user_id === userId;
    membershipByPlan.set(member.plan_id, {
      count: current.count + 1,
      joined: current.joined || isCurrentUser,
      isHost: current.isHost || (isCurrentUser && member.role === "host"),
    });
  }

  return membershipByPlan;
}

export default async function PlansPage({
  searchParams,
}: {
  readonly searchParams?: Promise<SearchParams>;
}) {
  const filters = (await searchParams) ?? {};
  const category = filters.category ?? "";
  const campus = filters.campus ?? "";
  const date = filters.date ?? "";
  const created = filters.created === "1";
  const joined = filters.joined === "1";
  const left = filters.left === "1";
  const full = filters.full === "1";
  const joinError = filters.joinError === "1";
  const organizerOnly = filters.organizerOnly === "1";
  const organizerBlocked = filters.organizerBlocked === "1";

  const supabase = await createClient();
  const { userId, role } = await requireAuthedProfile(supabase);
  const allowPlanCreation = canCreatePlans(role);

  const { data: plans, error: plansError } = await fetchPlans(supabase, { category, campus, date });

  const planIds = plans?.map((plan) => plan.id) ?? [];
  const membershipByPlan = await buildMembershipMap(supabase, planIds, userId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-400">Feed de planes</p>
          <h1 className="mt-2 text-3xl font-semibold">Encuentra algo para hoy</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard"
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500"
          >
            Dashboard
          </Link>
          {allowPlanCreation ? (
            <Link
              href="/plans/new"
              className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
            >
              Crear plan
            </Link>
          ) : (
            <span className="inline-flex cursor-not-allowed rounded-lg bg-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              Crear plan
            </span>
          )}
        </div>
      </div>

      <PlanFeedbackMessages
        created={created}
        joined={joined}
        left={left}
        full={full}
        joinError={joinError}
        organizerOnly={organizerOnly}
        organizerBlocked={organizerBlocked}
      />

      <form className="mt-6 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Categoria</span>
          <select
            name="category"
            defaultValue={category}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">Todas</option>
            {PLAN_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Campus</span>
          <input
            name="campus"
            defaultValue={campus}
            placeholder="Ej: matriz"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Fecha</span>
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
          >
            Filtrar
          </button>
          <Link
            href="/plans"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-center text-sm text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
          >
            Limpiar
          </Link>
        </div>
      </form>

      {plansError ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el feed: {plansError.message}
        </p>
      ) : null}

      {!plansError && (!plans || plans.length === 0) ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <p>No hay planes con esos filtros todavia.</p>
          <Link href="/plans/new" className="mt-3 inline-block text-sm font-semibold text-zinc-900 underline dark:text-zinc-100">
            Crear el primer plan
          </Link>
        </div>
      ) : null}

      {!plansError && plans && plans.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              membership={membershipByPlan.get(plan.id) ?? { count: 0, joined: false, isHost: false }}
              role={role}
              currentUserId={userId}
            />
          ))}
        </div>
      ) : null}
    </main>
  );
}
