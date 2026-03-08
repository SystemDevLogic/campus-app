"use client";

import { useEffect, useMemo, useState } from "react";

type OrgTypeOption = {
  id: string;
  key: string;
  label: string;
};

type AdminOption = {
  id: string;
  fullName: string;
};

type MeetingPlatform = "google_meet" | "zoom" | "other";

type AdminAvailability = {
  adminUserId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  slotMinutes: number;
  defaultMeetingUrl: string;
  platform: MeetingPlatform;
  customPlatformName: string | null;
};

type OrganizationRequestFormProps = {
  orgTypes: OrgTypeOption[];
  admins: AdminOption[];
  availabilities: AdminAvailability[];
  strictScheduling: boolean;
  defaultContactEmail: string;
  defaultRequesterName: string;
  occupiedSlots: Array<{
    adminUserId: string;
    meetingStartsAt: string;
  }>;
  action: (formData: FormData) => void;
};

type SlotOption = {
  value: string;
  label: string;
};

type PlatformOption = {
  value: MeetingPlatform;
  label: string;
};

const FALLBACK_PLATFORMS: ReadonlyArray<MeetingPlatform> = ["google_meet", "zoom", "other"];

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

function makeDateWithTime(baseDate: Date, timeHHMMSS: string) {
  const [h, m] = timeHHMMSS.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

function formatSlotLabel(date: Date) {
  return new Intl.DateTimeFormat("es-EC", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function generateSlotsForAvailability(date: Date, availability: AdminAvailability, now: Date) {
  const slots: SlotOption[] = [];
  const start = makeDateWithTime(date, availability.startsAt);
  const end = makeDateWithTime(date, availability.endsAt);
  const stepMs = availability.slotMinutes * 60000;

  for (let slot = new Date(start); slot < end; slot = new Date(slot.getTime() + stepMs)) {
    const slotEnd = new Date(slot.getTime() + stepMs);
    if (slotEnd > end) break;
    if (slot <= now) continue;

    slots.push({
      value: slot.toISOString(),
      label: `${formatSlotLabel(slot)} (${availability.slotMinutes} min)`,
    });
  }

  return slots;
}

function generateSlots(adminAvailabilities: AdminAvailability[]) {
  if (adminAvailabilities.length === 0) return [] as SlotOption[];

  const result: SlotOption[] = [];
  const now = new Date();

  for (let dayOffset = 0; dayOffset < 21; dayOffset++) {
    const date = new Date(now);
    date.setDate(now.getDate() + dayOffset);

    for (const availability of adminAvailabilities) {
      if (date.getDay() !== availability.weekday) continue;
      result.push(...generateSlotsForAvailability(date, availability, now));
    }
  }

  return result;
}

function normalizeIsoMinute(iso: string) {
  return new Date(iso).toISOString();
}

export default function OrganizationRequestForm({
  orgTypes,
  admins,
  availabilities,
  strictScheduling,
  defaultContactEmail,
  defaultRequesterName,
  occupiedSlots,
  action,
}: Readonly<OrganizationRequestFormProps>) {
  const [selectedOrgTypeKey, setSelectedOrgTypeKey] = useState("");
  const [selectedAdminId, setSelectedAdminId] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<MeetingPlatform | "">("");

  const adminAvailabilities = useMemo(() => {
    if (!selectedAdminId) return [] as AdminAvailability[];
    return availabilities.filter((item) => item.adminUserId === selectedAdminId);
  }, [availabilities, selectedAdminId]);

  const platformOptions = useMemo(() => {
    if (strictScheduling && !selectedAdminId) {
      return [] as PlatformOption[];
    }

    if (adminAvailabilities.length === 0) {
      return FALLBACK_PLATFORMS.map((platform) => ({
        value: platform,
        label: platformLabel(platform),
      }));
    }

    const byPlatform = new Map<MeetingPlatform, string>();
    for (const item of adminAvailabilities) {
      if (!byPlatform.has(item.platform)) {
        byPlatform.set(item.platform, platformDisplayLabel(item.platform, item.customPlatformName));
      }
    }

    return Array.from(byPlatform.entries()).map(([value, label]) => ({ value, label }));
  }, [adminAvailabilities, selectedAdminId, strictScheduling]);

  useEffect(() => {
    if (platformOptions.length === 0) {
      if (selectedPlatform !== "") {
        setSelectedPlatform("");
      }
      return;
    }

    const currentIsValid = selectedPlatform !== "" && platformOptions.some((item) => item.value === selectedPlatform);
    if (!currentIsValid) {
      setSelectedPlatform(platformOptions[0].value);
    }
  }, [platformOptions, selectedPlatform]);

  const selectedPlatformLink = useMemo(() => {
    if (!selectedPlatform) return "";
    const match = adminAvailabilities.find((item) => item.platform === selectedPlatform);
    return match?.defaultMeetingUrl ?? "";
  }, [adminAvailabilities, selectedPlatform]);

  const generatedSlots = useMemo(() => generateSlots(adminAvailabilities), [adminAvailabilities]);

  const occupiedSlotSet = useMemo(() => {
    if (!selectedAdminId) return new Set<string>();

    const occupied = occupiedSlots
      .filter((slot) => slot.adminUserId === selectedAdminId)
      .map((slot) => normalizeIsoMinute(slot.meetingStartsAt));

    return new Set(occupied);
  }, [occupiedSlots, selectedAdminId]);

  const availableSlots = useMemo(
    () => generatedSlots.filter((slot) => !occupiedSlotSet.has(normalizeIsoMinute(slot.value))),
    [generatedSlots, occupiedSlotSet],
  );

  return (
    <form action={action} className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Encargado</span>
          <input
            name="requesterName"
            required
            defaultValue={defaultRequesterName}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            placeholder="Nombres y apellidos"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Correo de contacto</span>
          <input
            type="email"
            name="contactEmail"
            required
            defaultValue={defaultContactEmail}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            placeholder="correo@ejemplo.com"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Telefono de contacto</span>
        <input
          name="contactPhone"
          required
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
          placeholder="0999999999"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Nombre de la organizacion</span>
        <input
          name="organizationName"
          required
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
          placeholder="Ej: Club de Software"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Tipo de organizacion</span>
        <select
          name="organizationTypeId"
          required
          onChange={(event) => {
            const type = orgTypes.find((item) => item.id === event.target.value);
            setSelectedOrgTypeKey(type?.key ?? "");
          }}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
        >
          <option value="">Selecciona una opcion</option>
          {orgTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      {selectedOrgTypeKey === "other" ? (
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Especificar tipo</span>
          <input
            name="organizationTypeOther"
            required
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            placeholder="Describe el tipo"
          />
        </label>
      ) : (
        <input type="hidden" name="organizationTypeOther" value="" />
      )}

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Administrador (opcional si no hay horarios)</span>
        <select
          name="requestedAdminId"
          value={selectedAdminId}
          onChange={(event) => setSelectedAdminId(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
        >
          <option value="">Asignacion automatica</option>
          {admins.map((admin) => (
            <option key={admin.id} value={admin.id}>
              {admin.fullName}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Plataforma (segun configuracion del administrador)</span>
        <select
          name="meetingPlatform"
          value={selectedPlatform}
          onChange={(event) => setSelectedPlatform(event.target.value as MeetingPlatform | "")}
          disabled={strictScheduling && !selectedAdminId}
          required
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
        >
          {strictScheduling && !selectedAdminId ? <option value="">Selecciona un administrador primero</option> : null}
          {platformOptions.map((platform) => (
            <option key={platform.value} value={platform.value}>
              {platform.label}
            </option>
          ))}
        </select>
      </label>

      {selectedPlatformLink ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Link fijo configurado para esta plataforma: {selectedPlatformLink}
        </p>
      ) : null}

      {strictScheduling && selectedAdminId && availableSlots.length > 0 ? (
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Horario de reunion (segun admin)</span>
          <select
            name="meetingStartsAt"
            required
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
          >
            <option value="">Selecciona un horario</option>
            {availableSlots.map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Fecha y hora preferida</span>
          <input
            required
            type="datetime-local"
            name="meetingStartsAtLocal"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
          />
        </label>
      )}

      {strictScheduling ? null : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Aun no hay administradores con horarios configurados. Tu solicitud quedara pendiente de asignacion.
        </p>
      )}

      {strictScheduling && selectedAdminId && availableSlots.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          No hay horarios disponibles para este administrador en este momento.
        </p>
      ) : null}

      <button
        type="submit"
        className="cursor-pointer rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
      >
        Enviar solicitud
      </button>
    </form>
  );
}
