"use client";

import { useMemo, useState } from "react";

type MeetingPlatform = "google_meet" | "zoom" | "other";

type WeekdayOption = {
  value: number;
  label: string;
};

type AdminAvailabilityFormProps = {
  weekdays: WeekdayOption[];
  action: (formData: FormData) => void;
};

function platformLabel(platform: MeetingPlatform) {
  if (platform === "google_meet") return "Google Meet";
  if (platform === "zoom") return "Zoom";
  return "Otra";
}

const PLATFORM_OPTIONS: MeetingPlatform[] = ["google_meet", "zoom", "other"];

export default function AdminAvailabilityForm({ weekdays, action }: Readonly<AdminAvailabilityFormProps>) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<MeetingPlatform[]>([]);

  const selectedSet = useMemo(() => new Set(selectedPlatforms), [selectedPlatforms]);

  function togglePlatform(platform: MeetingPlatform, checked: boolean) {
    setSelectedPlatforms((current) => {
      if (checked) {
        if (current.includes(platform)) return current;
        return [...current, platform];
      }

      return current.filter((item) => item !== platform);
    });
  }

  return (
    <form action={action} className="mt-6 grid gap-3 rounded-xl border border-zinc-700 bg-zinc-950 p-4 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Dia de semana</span>
        <select name="weekday" required className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100">
          {weekdays.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="block">
        <legend className="mb-1 block text-sm text-zinc-300">Plataformas disponibles para este horario</legend>
        <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100">
          {PLATFORM_OPTIONS.map((platform) => (
            <label key={platform} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="platforms"
                value={platform}
                checked={selectedSet.has(platform)}
                onChange={(event) => togglePlatform(platform, event.target.checked)}
              />
              <span>{platformLabel(platform)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Hora inicio</span>
        <input type="time" name="startsAt" required className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100" />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Hora fin</span>
        <input type="time" name="endsAt" required className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100" />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Duracion por slot (minutos)</span>
        <input
          type="number"
          name="slotMinutes"
          required
          min={15}
          max={60}
          defaultValue={30}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
        />
      </label>

      {selectedSet.has("google_meet") ? (
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-zinc-300">Link fijo para Google Meet</span>
          <input
            type="url"
            name="defaultMeetingUrl_google_meet"
            required
            placeholder="https://meet.google.com/..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
          />
        </label>
      ) : null}

      {selectedSet.has("zoom") ? (
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm text-zinc-300">Link fijo para Zoom</span>
          <input
            type="url"
            name="defaultMeetingUrl_zoom"
            required
            placeholder="https://zoom.us/j/..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
          />
        </label>
      ) : null}

      {selectedSet.has("other") ? (
        <>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm text-zinc-300">Nombre de la plataforma</span>
            <input
              type="text"
              name="customPlatformName_other"
              required
              placeholder="Ej: Microsoft Teams"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm text-zinc-300">Link fijo para la plataforma personalizada</span>
            <input
              type="url"
              name="defaultMeetingUrl_other"
              required
              placeholder="https://..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
            />
          </label>
        </>
      ) : null}

      <button type="submit" className="cursor-pointer rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 sm:col-span-2">
        Guardar disponibilidad
      </button>
    </form>
  );
}
