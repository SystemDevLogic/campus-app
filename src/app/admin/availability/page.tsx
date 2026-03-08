import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type AppRole, roleLabel } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";

import AdminAvailabilityForm from "./AdminAvailabilityForm";

type WeekdayOption = {
  value: number;
  label: string;
};

const WEEKDAYS: WeekdayOption[] = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miercoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sabado" },
];

type MeetingPlatform = "google_meet" | "zoom" | "other";

function canManageAvailability(role: AppRole) {
  return role === "admin" || role === "superadmin";
}

function readFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readFormTextList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseWeekday(value: string) {
  const asNumber = Number.parseInt(value, 10);
  if (Number.isNaN(asNumber) || asNumber < 0 || asNumber > 6) {
    return null;
  }
  return asNumber;
}

function platformLabel(platform: MeetingPlatform) {
  if (platform === "google_meet") return "Google Meet";
  if (platform === "zoom") return "Zoom";
  return "Otra";
}

function platformDisplayLabel(platform: MeetingPlatform, customPlatformName: string | null) {
  if (platform === "other") {
    return customPlatformName?.trim() || "Otra";
  }
  return platformLabel(platform);
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
  if (!canManageAvailability(role)) {
    redirect("/dashboard");
  }

  return { supabase, userId, role };
}

async function createAvailabilityAction(formData: FormData) {
  "use server";

  const { supabase, userId } = await getAdminContext();

  const weekdayValue = readFormText(formData, "weekday");
  const startsAt = readFormText(formData, "startsAt");
  const endsAt = readFormText(formData, "endsAt");
  const slotMinutes = Number.parseInt(readFormText(formData, "slotMinutes"), 10);
  const selectedPlatforms = readFormTextList(formData, "platforms") as MeetingPlatform[];
  const customOtherPlatformName = readFormText(formData, "customPlatformName_other");

  const linkByPlatform: Record<MeetingPlatform, string> = {
    google_meet: readFormText(formData, "defaultMeetingUrl_google_meet"),
    zoom: readFormText(formData, "defaultMeetingUrl_zoom"),
    other: readFormText(formData, "defaultMeetingUrl_other"),
  };

  const weekday = parseWeekday(weekdayValue);
  const uniquePlatforms = Array.from(new Set(selectedPlatforms)).filter(
    (platform): platform is MeetingPlatform => platform === "google_meet" || platform === "zoom" || platform === "other",
  );

  const linksAreValid = uniquePlatforms.every((platform) => linkByPlatform[platform].length > 0);
  const otherPlatformNameIsValid = !uniquePlatforms.includes("other") || customOtherPlatformName.length > 0;

  if (
    weekday === null ||
    !startsAt ||
    !endsAt ||
    Number.isNaN(slotMinutes) ||
    slotMinutes < 15 ||
    slotMinutes > 60 ||
    uniquePlatforms.length === 0 ||
    !linksAreValid ||
    !otherPlatformNameIsValid
  ) {
    redirect("/admin/availability?error=1");
  }

  const rows = uniquePlatforms.map((platform) => ({
    admin_user_id: userId,
    weekday,
    starts_at: startsAt,
    ends_at: endsAt,
    slot_minutes: slotMinutes,
    platform,
    default_meeting_url: linkByPlatform[platform],
    custom_platform_name: platform === "other" ? customOtherPlatformName : null,
    is_active: true,
  }));

  const { error } = await supabase.from("admin_availability").insert(rows);

  if (error) {
    redirect("/admin/availability?error=1");
  }

  revalidatePath("/admin/availability");
  revalidatePath("/organizations/request");
  redirect("/admin/availability?saved=1");
}

async function deleteAvailabilityAction(formData: FormData) {
  "use server";

  const { supabase, userId } = await getAdminContext();
  const availabilityId = readFormText(formData, "availabilityId");
  if (!availabilityId) {
    redirect("/admin/availability?error=1");
  }

  const { error } = await supabase
    .from("admin_availability")
    .delete()
    .eq("id", availabilityId)
    .eq("admin_user_id", userId);

  if (error) {
    redirect("/admin/availability?error=1");
  }

  revalidatePath("/admin/availability");
  revalidatePath("/organizations/request");
  redirect("/admin/availability?deleted=1");
}

export default async function AdminAvailabilityPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = (await searchParams) ?? {};
  const saved = query.saved === "1";
  const deleted = query.deleted === "1";
  const error = query.error === "1";

  const { supabase, userId, role } = await getAdminContext();

  const { data: rows } = await supabase
    .from("admin_availability")
    .select("id, weekday, starts_at, ends_at, slot_minutes, platform, default_meeting_url, custom_platform_name, is_active")
    .eq("admin_user_id", userId)
    .order("weekday", { ascending: true })
    .order("starts_at", { ascending: true });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        {"<- Volver al dashboard"}
      </Link>

      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
        <h1 className="text-2xl font-semibold">Configuracion de disponibilidad admin</h1>
        <p className="mt-2 text-sm text-zinc-300">Rol: {roleLabel(role)}</p>
        <p className="mt-2 text-sm text-zinc-300">
          Las plataformas y links fijos que configures aqui son las opciones visibles para solicitudes de organizaciones.
        </p>

        {saved ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Disponibilidad guardada.</p> : null}
        {deleted ? <p className="mt-4 rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-700">Disponibilidad eliminada.</p> : null}
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo completar la accion.</p> : null}

        <AdminAvailabilityForm action={createAvailabilityAction} weekdays={WEEKDAYS} />

        <div className="mt-6 space-y-3">
          {(rows ?? []).length === 0 ? (
            <p className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
              Aun no has configurado disponibilidad.
            </p>
          ) : null}

          {(rows ?? []).map((row) => (
            <article key={row.id} className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
              <p className="text-sm text-zinc-100">
                {WEEKDAYS.find((item) => item.value === row.weekday)?.label ?? "Dia"} · {row.starts_at} - {row.ends_at}
              </p>
              <p className="mt-1 text-sm text-zinc-300">Plataforma: {platformDisplayLabel(row.platform, row.custom_platform_name)}</p>
              <p className="mt-1 break-all text-sm text-zinc-300">Link fijo: {row.default_meeting_url}</p>
              <p className="mt-1 text-xs text-zinc-400">Duracion slot: {row.slot_minutes} min</p>

              <form action={deleteAvailabilityAction} className="mt-3">
                <input type="hidden" name="availabilityId" value={row.id} />
                <button type="submit" className="cursor-pointer rounded-lg border border-zinc-500 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-300">
                  Eliminar
                </button>
              </form>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
