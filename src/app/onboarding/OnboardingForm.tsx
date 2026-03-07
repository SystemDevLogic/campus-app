"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/browser";
import { INTEREST_CATEGORIES } from "@/lib/constants/onboarding";

type OnboardingFormProps = {
  userId: string;
  universities: string[];
  initialFirstName: string;
  initialLastName: string;
  initialUniversity: string;
  initialBirthDate: string;
  initialInterests: string[];
};

export default function OnboardingForm({
  userId,
  universities,
  initialFirstName,
  initialLastName,
  initialUniversity,
  initialBirthDate,
  initialInterests,
}: OnboardingFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [university, setUniversity] = useState(initialUniversity);
  const [birthDate, setBirthDate] = useState(initialBirthDate);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(initialInterests);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minBirthDate = useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 16);
    return date.toISOString().split("T")[0];
  }, []);

  function toggleInterest(category: string) {
    setSelectedInterests((current) => {
      if (current.includes(category)) {
        return current.filter((item) => item !== category);
      }
      return [...current, category];
    });
  }

  function isAtLeast16YearsOld(dateValue: string) {
    if (!dateValue) return false;
    const today = new Date();
    const birth = new Date(`${dateValue}T00:00:00`);

    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age >= 16;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!firstName.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }

    if (!lastName.trim()) {
      setError("El apellido es obligatorio.");
      return;
    }

    if (!isAtLeast16YearsOld(birthDate)) {
      setError("Debes tener al menos 16 anos.");
      return;
    }

    if (!university.trim()) {
      setError("La universidad es obligatoria.");
      return;
    }

    if (selectedInterests.length === 0) {
      setError("Selecciona al menos una categoria de interes.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: upsertError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        university: university.trim(),
        birth_date: birthDate,
        interests: selectedInterests,
      },
      { onConflict: "id" },
    );

    if (upsertError) {
      setError(upsertError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Nombres</span>
        <input
          required
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500"
          placeholder="Ej: Jorge"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Apellidos</span>
        <input
          required
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500"
          placeholder="Ej: Herrera"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Universidad (Ecuador)</span>
        <select
          required
          value={university}
          onChange={(event) => setUniversity(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500"
        >
          <option value="">Selecciona tu universidad</option>
          {universities.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">Fecha de nacimiento</span>
        <input
          required
          type="date"
          value={birthDate}
          max={minBirthDate}
          onChange={(event) => setBirthDate(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500"
        />
      </label>

      <fieldset className="block">
        <legend className="mb-2 block text-sm text-zinc-300">Intereses (categorias)</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INTEREST_CATEGORIES.map((category) => {
            const selected = selectedInterests.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleInterest(category)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  selected
                    ? "border-white bg-white text-zinc-900"
                    : "border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-zinc-500"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Guardando..." : "Guardar perfil"}
      </button>
    </form>
  );
}
