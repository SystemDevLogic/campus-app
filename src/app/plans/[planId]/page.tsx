import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getOrganizationSessionCookieName, readOrganizationSessionToken } from "@/lib/organizations/auth";
import { createClient } from "@/lib/supabase/server";

import ChatRoom from "./ChatRoom";

type PlanDetailPageProps = Readonly<{
  params: Promise<{ planId: string }>;
}>;

async function resolvePlanActorUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (!authError && authData.user) {
    return authData.user.id;
  }

  return getManagerUserIdFromOrganizationSession(supabase);
}

async function getManagerUserIdFromOrganizationSession(supabase: Awaited<ReturnType<typeof createClient>>) {

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

export default async function PlanDetailPage({ params }: PlanDetailPageProps) {
  const { planId } = await params;
  const supabase = await createClient();

  const userId = await resolvePlanActorUserId(supabase);

  const { data: membership } = await supabase
    .from("plan_members")
    .select("plan_id")
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    redirect("/plans?joinError=1");
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, title, description, category, campus, starts_at")
    .eq("id", planId)
    .maybeSingle();

  if (planError || !plan) {
    redirect("/plans");
  }

  const { data: messageRows } = await supabase
    .from("messages")
    .select("id, user_id, body, created_at")
    .eq("plan_id", planId)
    .order("created_at", { ascending: true })
    .limit(200);

  const userIds = Array.from(new Set((messageRows ?? []).map((row) => row.user_id)));
  const profileNameById = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", userIds);

    for (const profile of profiles ?? []) {
      const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
      profileNameById.set(profile.id, fullName || "Estudiante");
    }
  }

  const initialMessages = (messageRows ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    body: row.body,
    created_at: row.created_at,
    author_name: row.user_id === userId ? "Tu" : profileNameById.get(row.user_id) ?? "Estudiante",
  }));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <Link href="/plans" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        {"<- Volver al feed"}
      </Link>

      <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-400">{plan.category}</p>
        <h1 className="mt-2 text-2xl font-semibold">{plan.title}</h1>
        <p className="mt-3 text-zinc-700 dark:text-zinc-300">{plan.description}</p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {plan.campus} · {new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(new Date(plan.starts_at))}
        </p>
      </section>

      <ChatRoom planId={plan.id} userId={userId} initialMessages={initialMessages} />
    </main>
  );
}
