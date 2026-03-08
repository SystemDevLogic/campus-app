import Link from "next/link";
import { redirect } from "next/navigation";

import { roleLabel, type AppRole } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";

import OrganizationRequestForm from "./OrganizationRequestForm";

type MeetingPlatform = "google_meet" | "zoom" | "other";

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

function localDateTimeToIso(value: string) {
  return new Date(value).toISOString();
}

function readFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function platformLabel(platform: string) {
  if (platform === "google_meet") return "Google Meet";
  if (platform === "zoom") return "Zoom";
  return "Otra";
}

function resolveOtherPlatformLabel(
  slots: Array<{ starts_at: string; ends_at: string; custom_platform_name: string | null }>,
  meetingStartsAtIso: string,
) {
  const meetingDate = new Date(meetingStartsAtIso);
  const meetingHour = `${String(meetingDate.getHours()).padStart(2, "0")}:${String(meetingDate.getMinutes()).padStart(2, "0")}:00`;
  const matchingSlot = slots.find((slot) => slot.starts_at <= meetingHour && meetingHour < slot.ends_at);
  return matchingSlot?.custom_platform_name?.trim() || "Otra";
}

type LatestRequestSummary = {
  meeting_link: string | null;
  platform_label: string;
};

async function getLatestRequestSummary(supabase: Awaited<ReturnType<typeof createClient>>, requesterUserId: string) {
  const { data: latestRequest } = await supabase
    .from("organization_creation_requests")
    .select("meeting_platform, meeting_link, requested_admin_id, meeting_starts_at")
    .eq("requester_user_id", requesterUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRequest) {
    return null as LatestRequestSummary | null;
  }

  if (latestRequest.meeting_platform !== "other" || !latestRequest.requested_admin_id) {
    return {
      meeting_link: latestRequest.meeting_link,
      platform_label: platformLabel(latestRequest.meeting_platform),
    };
  }

  const meetingDate = new Date(latestRequest.meeting_starts_at);
  const weekday = meetingDate.getDay();
  const { data: otherSlots } = await supabase
    .from("admin_availability")
    .select("starts_at, ends_at, custom_platform_name")
    .eq("admin_user_id", latestRequest.requested_admin_id)
    .eq("is_active", true)
    .eq("weekday", weekday)
    .eq("platform", "other");

  return {
    meeting_link: latestRequest.meeting_link,
    platform_label: resolveOtherPlatformLabel(otherSlots ?? [], latestRequest.meeting_starts_at),
  };
}

type FeedbackProps = {
  role: AppRole;
  sent: boolean;
  error: boolean;
  missingAdmin: boolean;
  invalidSlot: boolean;
  slotTaken: boolean;
  forbidden: boolean;
  latestRequestSummary: LatestRequestSummary | null;
};

function RequestFeedback({
  role,
  sent,
  error,
  missingAdmin,
  invalidSlot,
  slotTaken,
  forbidden,
  latestRequestSummary,
}: Readonly<FeedbackProps>) {
  return (
    <>
      {role === "general_user" ? null : (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Solo un usuario general puede enviar esta solicitud.
        </p>
      )}

      {sent ? (
        <div className="mt-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p>Solicitud enviada correctamente.</p>
          {latestRequestSummary?.meeting_link ? (
            <>
              <p>Plataforma asignada: {latestRequestSummary.platform_label}</p>
              <p>Link de reunion asignado por administrador: {latestRequestSummary.meeting_link}</p>
            </>
          ) : (
            <p>El link de reunion se mostrara cuando un administrador asigne disponibilidad para tu solicitud.</p>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Ocurrio un error y no se pudo registrar la solicitud.
        </p>
      ) : null}

      {missingAdmin ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Debes seleccionar un administrador para un horario valido.
        </p>
      ) : null}

      {invalidSlot ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          El horario elegido no coincide con la disponibilidad del administrador.
        </p>
      ) : null}

      {slotTaken ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Ese horario ya fue reservado. Elige otro horario disponible.
        </p>
      ) : null}

      {forbidden ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Tu rol actual no tiene permisos para este formulario.
        </p>
      ) : null}
    </>
  );
}

async function createOrganizationRequestAction(formData: FormData) {
  "use server";

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
  if (role !== "general_user") {
    redirect("/organizations/request?forbidden=1");
  }

  const requesterName = readFormText(formData, "requesterName");
  const contactEmail = readFormText(formData, "contactEmail");
  const contactPhone = readFormText(formData, "contactPhone");
  const organizationName = readFormText(formData, "organizationName");
  const organizationTypeId = readFormText(formData, "organizationTypeId");
  const organizationTypeOther = readFormText(formData, "organizationTypeOther");
  const requestedAdminIdRaw = readFormText(formData, "requestedAdminId");
  const meetingPlatform = readFormText(formData, "meetingPlatform");

  const meetingStartsAtRaw = readFormText(formData, "meetingStartsAt");
  const meetingStartsAtLocalRaw = readFormText(formData, "meetingStartsAtLocal");

  if (!requesterName || !contactEmail || !contactPhone || !organizationName || !organizationTypeId || !meetingPlatform) {
    redirect("/organizations/request?error=1");
  }

  const { count: availabilityCount } = await supabase
    .from("admin_availability")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  const strictScheduling = (availabilityCount ?? 0) > 0;
  const requestedAdminId = requestedAdminIdRaw || null;

  if (strictScheduling && !requestedAdminId) {
    redirect("/organizations/request?missingAdmin=1");
  }

  let meetingLinkToStore: string | null = null;

  let meetingStartsAtIso = "";
  if (meetingStartsAtRaw) {
    meetingStartsAtIso = meetingStartsAtRaw;
  } else if (meetingStartsAtLocalRaw) {
    meetingStartsAtIso = localDateTimeToIso(meetingStartsAtLocalRaw);
  }

  if (!meetingStartsAtIso || Number.isNaN(Date.parse(meetingStartsAtIso))) {
    redirect("/organizations/request?error=1");
  }

  if (strictScheduling && requestedAdminId) {
    const meetingDate = new Date(meetingStartsAtIso);
    const weekday = meetingDate.getDay();
    const meetingHour = `${String(meetingDate.getHours()).padStart(2, "0")}:${String(meetingDate.getMinutes()).padStart(2, "0")}:00`;

    const { data: availableSlots } = await supabase
      .from("admin_availability")
      .select("starts_at, ends_at, platform, default_meeting_url, custom_platform_name")
      .eq("admin_user_id", requestedAdminId)
      .eq("is_active", true)
      .eq("weekday", weekday)
      .eq("platform", meetingPlatform as MeetingPlatform);

    const validSlot = (availableSlots ?? []).find((slot) => slot.starts_at <= meetingHour && meetingHour < slot.ends_at);

    if (!validSlot) {
      redirect("/organizations/request?invalidSlot=1");
    }

    const { count: occupiedCount } = await supabase
      .from("organization_creation_requests")
      .select("*", { count: "exact", head: true })
      .eq("requested_admin_id", requestedAdminId)
      .eq("meeting_starts_at", meetingStartsAtIso)
      .in("status", ["pending", "approved"]);

    if ((occupiedCount ?? 0) > 0) {
      redirect("/organizations/request?slotTaken=1");
    }

    meetingLinkToStore = validSlot.default_meeting_url;
  }

  const { error: insertError } = await supabase.from("organization_creation_requests").insert({
    requester_user_id: userId,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    organization_name: organizationName,
    organization_type_id: organizationTypeId,
    organization_type_other: organizationTypeOther || null,
    requested_admin_id: requestedAdminId,
    meeting_platform: meetingPlatform,
    meeting_link: meetingLinkToStore,
    meeting_starts_at: meetingStartsAtIso,
    meeting_duration_minutes: 30,
  });

  if (insertError) {
    redirect("/organizations/request?error=1");
  }

  redirect("/organizations/request?sent=1");
}

export default async function OrganizationRequestPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const query = (await searchParams) ?? {};

  const sent = query.sent === "1";
  const error = query.error === "1";
  const forbidden = query.forbidden === "1";
  const missingAdmin = query.missingAdmin === "1";
  const invalidSlot = query.invalidSlot === "1";
  const slotTaken = query.slotTaken === "1";

  const supabase = await createClient();
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

  const role = (profile.role ?? "general_user") as AppRole;
  const { data: orgTypes } = await supabase
    .from("organization_types")
    .select("id, key, label")
    .eq("is_active", true)
    .order("label", { ascending: true });

  const { data: admins } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("role", ["admin", "superadmin"])
    .eq("is_active", true)
    .order("role_assigned_at", { ascending: true });

  const { data: availabilities } = await supabase
    .from("admin_availability")
    .select("admin_user_id, weekday, starts_at, ends_at, slot_minutes, default_meeting_url, platform, custom_platform_name")
    .eq("is_active", true)
    .order("weekday", { ascending: true });

  const { data: occupiedSlots } = await supabase
    .from("organization_creation_requests")
    .select("requested_admin_id, meeting_starts_at")
    .not("requested_admin_id", "is", null)
    .in("status", ["pending", "approved"]);

  const strictScheduling = (availabilities?.length ?? 0) > 0;
  const latestRequestSummary = sent ? await getLatestRequestSummary(supabase, authData.user.id) : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        {"<- Volver al dashboard"}
      </Link>

      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
        <h1 className="text-2xl font-semibold">Solicitud de creacion de organizacion</h1>
        <p className="mt-2 text-sm text-zinc-300">Tu rol actual: {roleLabel(role)}</p>

        <RequestFeedback
          role={role}
          sent={sent}
          error={error}
          missingAdmin={missingAdmin}
          invalidSlot={invalidSlot}
          slotTaken={slotTaken}
          forbidden={forbidden}
          latestRequestSummary={latestRequestSummary}
        />

        <OrganizationRequestForm
          action={createOrganizationRequestAction}
          orgTypes={(orgTypes ?? []).map((item) => ({ id: item.id, key: item.key, label: item.label }))}
          admins={(admins ?? []).map((item) => ({
            id: item.id,
            fullName: `${item.first_name ?? ""} ${item.last_name ?? ""}`.trim() || "Administrador",
          }))}
          availabilities={(availabilities ?? []).map((item) => ({
            adminUserId: item.admin_user_id,
            weekday: item.weekday,
            startsAt: item.starts_at,
            endsAt: item.ends_at,
            slotMinutes: item.slot_minutes,
            defaultMeetingUrl: item.default_meeting_url,
            platform: item.platform,
            customPlatformName: item.custom_platform_name,
          }))}
          strictScheduling={strictScheduling}
          defaultContactEmail={authData.user.email ?? ""}
          defaultRequesterName={`${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()}
          occupiedSlots={(occupiedSlots ?? []).map((item) => ({
            adminUserId: item.requested_admin_id ?? "",
            meetingStartsAt: item.meeting_starts_at,
          }))}
        />
      </section>
    </main>
  );
}
