import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { randomUUID } from "node:crypto";

import { type AppRole, roleLabel } from "@/lib/constants/roles";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

type MeetingPlatform = "google_meet" | "zoom" | "other";

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

function canReviewRequests(role: AppRole) {
  return role === "admin" || role === "superadmin";
}

function readFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function platformLabel(platform: MeetingPlatform) {
  if (platform === "google_meet") return "Google Meet";
  if (platform === "zoom") return "Zoom";
  return "Otra";
}

function statusLabel(status: RequestStatus) {
  if (status === "pending") return "Pendiente";
  if (status === "approved") return "Aprobada";
  if (status === "rejected") return "Rechazada";
  return "Cancelada";
}

function statusBadgeClass(status: RequestStatus) {
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-red-200 bg-red-50 text-red-700";
  return "border-zinc-300 bg-zinc-100 text-zinc-700";
}

async function getAdminContext() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect("/login");
  }

  const userId = authData.user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = (profile?.role ?? "general_user") as AppRole;
  if (!canReviewRequests(role)) {
    redirect("/dashboard");
  }

  return { supabase, userId, role };
}

async function ensureRequestEmailAllowed(supabase: Awaited<ReturnType<typeof createClient>>, email: string) {
  const { data: conflictCheck } = await supabase.rpc("email_belongs_to_general_user", {
    email_to_check: email,
  });

  if (conflictCheck === true) {
    redirect("/admin/requests?emailConflict=1");
  }
}

async function ensureSupabaseAuthUser(email: string) {
  const serviceClient = createServiceClient();
  const temporaryPassword = `${randomUUID()}Aa1!`;

  const { error } = await serviceClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      account_type: "organization",
    },
  });

  if (!error) {
    return;
  }

  const alreadyExists = /already|exists|registered/i.test(error.message);
  if (!alreadyExists) {
    redirect("/admin/requests?error=1");
  }
}

async function approveRequestAction(formData: FormData) {
  "use server";

  const requestId = readFormText(formData, "requestId");
  const reviewMessage = readFormText(formData, "reviewMessage");
  if (!requestId) {
    redirect("/admin/requests?error=1");
  }

  const { supabase, userId } = await getAdminContext();

  const { data: requestRow, error: requestError } = await supabase
    .from("organization_creation_requests")
    .select(
      "id, requester_user_id, contact_email, contact_phone, organization_name, organization_type_id, organization_type_other, status",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || requestRow?.status !== "pending") {
    redirect("/admin/requests?error=1");
  }

  await ensureRequestEmailAllowed(supabase, requestRow.contact_email);

  const { data: existingOrganization } = await supabase
    .from("organizations")
    .select("id")
    .eq("approved_request_id", requestId)
    .maybeSingle();

  let organizationId = existingOrganization?.id ?? null;

  if (!existingOrganization) {
    const { data: createdOrganization, error: organizationError } = await supabase
      .from("organizations")
      .insert({
        organization_name: requestRow.organization_name,
        organization_type_id: requestRow.organization_type_id,
        organization_type_other: requestRow.organization_type_other,
        organization_email: requestRow.contact_email,
        organization_phone: requestRow.contact_phone,
        manager_user_id: requestRow.requester_user_id,
        approved_request_id: requestRow.id,
        status: "active",
      })
      .select("id")
      .maybeSingle();

    if (organizationError || !createdOrganization) {
      redirect("/admin/requests?error=1");
    }

    organizationId = createdOrganization.id;
  }

  if (!organizationId) {
    redirect("/admin/requests?error=1");
  }

  const { data: existingAccount } = await supabase
    .from("organization_accounts")
    .select("id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  let organizationAccountId = existingAccount?.id ?? null;

  if (!existingAccount) {
    const { data: createdAccount, error: accountError } = await supabase
      .from("organization_accounts")
      .insert({
        organization_id: organizationId,
        email: requestRow.contact_email,
        first_login_completed: false,
        is_active: true,
      })
      .select("id")
      .maybeSingle();

    if (accountError || !createdAccount) {
      redirect("/admin/requests?error=1");
    }

    organizationAccountId = createdAccount.id;
  }

  if (!organizationAccountId) {
    redirect("/admin/requests?error=1");
  }

  await ensureSupabaseAuthUser(requestRow.contact_email);

  const { error: updateError } = await supabase
    .from("organization_creation_requests")
    .update({
      status: "approved",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      review_message: reviewMessage || null,
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (updateError) {
    redirect("/admin/requests?error=1");
  }

  revalidatePath("/admin/requests");
  revalidatePath("/organizations/request");
  redirect("/admin/requests?approved=1");
}

async function rejectRequestAction(formData: FormData) {
  "use server";

  const requestId = readFormText(formData, "requestId");
  const reviewMessage = readFormText(formData, "reviewMessage");
  if (!requestId) {
    redirect("/admin/requests?error=1");
  }

  const { supabase, userId } = await getAdminContext();

  const { error: updateError } = await supabase
    .from("organization_creation_requests")
    .update({
      status: "rejected",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      review_message: reviewMessage || null,
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (updateError) {
    redirect("/admin/requests?error=1");
  }

  revalidatePath("/admin/requests");
  redirect("/admin/requests?rejected=1");
}

async function runBrevoHealthCheckAction() {
  "use server";
  redirect("/admin/requests");
}

export default async function AdminRequestsPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = (await searchParams) ?? {};
  const approved = query.approved === "1";
  const rejected = query.rejected === "1";
  const error = query.error === "1";
  const emailConflict = query.emailConflict === "1";

  const { supabase, role } = await getAdminContext();

  const { data: requests } = await supabase
    .from("organization_creation_requests")
    .select(
      "id, organization_name, contact_email, contact_phone, meeting_platform, meeting_link, meeting_starts_at, meeting_duration_minutes, status, review_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        {"<- Volver al dashboard"}
      </Link>

      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
        <h1 className="text-2xl font-semibold">Revision de solicitudes de organizacion</h1>
        <p className="mt-2 text-sm text-zinc-300">Rol: {roleLabel(role)}</p>

        {approved ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Solicitud aprobada y organizacion creada. El OTP se enviara al primer intento de ingreso.
          </p>
        ) : null}
        {rejected ? (
          <p className="mt-4 rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
            Solicitud rechazada.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            No se pudo completar la accion.
          </p>
        ) : null}
        {emailConflict ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            El correo de esta solicitud pertenece a un usuario general y no puede usarse para organizacion.
          </p>
        ) : null}

        <div className="mt-6 space-y-4">
          {(requests ?? []).length === 0 ? (
            <p className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
              No hay solicitudes registradas.
            </p>
          ) : null}

          {(requests ?? []).map((requestItem) => {
            const status = requestItem.status as RequestStatus;
            const isPending = status === "pending";

            return (
              <article key={requestItem.id} className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-zinc-100">{requestItem.organization_name}</h2>
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}>
                    {statusLabel(status)}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm text-zinc-300">
                  <p>Correo: {requestItem.contact_email}</p>
                  <p>Telefono: {requestItem.contact_phone}</p>
                  <p>Plataforma: {platformLabel(requestItem.meeting_platform as MeetingPlatform)}</p>
                  <p>Link reunion: {requestItem.meeting_link ?? "No asignado"}</p>
                  <p>
                    Reunion: {new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(new Date(requestItem.meeting_starts_at))}
                    {` (${requestItem.meeting_duration_minutes} min)`}
                  </p>
                  <p>Solicitud: {new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(new Date(requestItem.created_at))}</p>
                  {requestItem.review_message ? <p>Revision: {requestItem.review_message}</p> : null}
                </div>

                {isPending ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <form action={approveRequestAction} className="space-y-2">
                      <input type="hidden" name="requestId" value={requestItem.id} />
                      <textarea
                        name="reviewMessage"
                        rows={2}
                        placeholder="Comentario de aprobacion (opcional)"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                      />
                      <button
                        type="submit"
                        className="w-full cursor-pointer rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
                      >
                        Aprobar
                      </button>
                    </form>

                    <form action={rejectRequestAction} className="space-y-2">
                      <input type="hidden" name="requestId" value={requestItem.id} />
                      <textarea
                        name="reviewMessage"
                        rows={2}
                        placeholder="Motivo de rechazo (opcional)"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                      />
                      <button
                        type="submit"
                        className="w-full cursor-pointer rounded-lg border border-red-400 px-3 py-2 text-sm font-semibold text-red-300 hover:border-red-300"
                      >
                        Rechazar
                      </button>
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
