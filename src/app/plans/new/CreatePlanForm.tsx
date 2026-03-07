"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/browser";
import { PLAN_CATEGORIES } from "@/lib/constants/plans";

type PlanCategory = (typeof PLAN_CATEGORIES)[number];

type CreatePlanFormProps = {
  userId: string;
  defaultCampus: string;
};

function toISOStringFromLocalDateTime(value: string) {
  return new Date(value).toISOString();
}

export default function CreatePlanForm({ userId, defaultCampus }: CreatePlanFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<PlanCategory>(PLAN_CATEGORIES[0]);
  const [campus, setCampus] = useState(defaultCampus);
  const [startsAt, setStartsAt] = useState("");
  const [capacity, setCapacity] = useState("10");
  const [withoutCapacity, setWithoutCapacity] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("El titulo es obligatorio.");
      return;
    }

    if (!description.trim()) {
      setError("La descripcion es obligatoria.");
      return;
    }

    if (!campus.trim()) {
      setError("El campus es obligatorio.");
      return;
    }

    if (!startsAt) {
      setError("La fecha y hora son obligatorias.");
      return;
    }

    const startsAtIso = toISOStringFromLocalDateTime(startsAt);
    if (Number.isNaN(Date.parse(startsAtIso))) {
      setError("La fecha y hora no son validas.");
      return;
    }

    let capacityNumber: number | null = null;
    if (!withoutCapacity) {
      capacityNumber = Number(capacity);
      if (!Number.isInteger(capacityNumber) || capacityNumber < 2) {
        setError("El aforo debe ser un numero entero mayor o igual a 2.");
        return;
      }
    }

    setLoading(true);

    const supabase = createClient();

    const { data: createdPlan, error: createPlanError } = await supabase
      .from("plans")
      .insert({
        creator_id: userId,
        title: title.trim(),
        description: description.trim(),
        category,
        campus: campus.trim(),
        starts_at: startsAtIso,
        capacity: capacityNumber,
      })
      .select("id")
      .single();

    if (createPlanError) {
      setError(createPlanError.message);
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase.from("plan_members").upsert(
      {
        plan_id: createdPlan.id,
        user_id: userId,
        role: "host",
      },
      { onConflict: "plan_id,user_id" },
    );

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    router.push("/plans?created=1");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Titulo</span>
        <input
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500"
          placeholder="Ej: Futbol sabado en la tarde"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Descripcion</span>
        <textarea
          required
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500"
          placeholder="Cuenta de que trata el plan, lugar exacto y que deben llevar"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Categoria</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as PlanCategory)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500"
          >
            {PLAN_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <div className="block">
          <label className="mb-1 block text-sm text-zinc-300" htmlFor="capacity">
            Aforo
          </label>
          <input
            id="capacity"
            required={!withoutCapacity}
            disabled={withoutCapacity}
            type="number"
            min={2}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <label className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={withoutCapacity}
              onChange={(event) => setWithoutCapacity(event.target.checked)}
            />
            Sin aforo
          </label>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Campus o punto de encuentro</span>
        <input
          required
          value={campus}
          onChange={(event) => setCampus(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500"
          placeholder="Ej: Campus matriz, edificio A"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Fecha y hora</span>
        <input
          required
          type="datetime-local"
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500"
        />
      </label>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Creando plan..." : "Crear plan"}
      </button>
    </form>
  );
}
