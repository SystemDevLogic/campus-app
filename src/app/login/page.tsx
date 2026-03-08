"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? globalThis.location.origin;

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${appOrigin}/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
        <h1 className="text-2xl font-semibold">Entrar</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Inicia sesion para crear y unirte a planes de tu universidad.
        </p>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Conectando..." : "Continuar con Google"}
        </button>

        <Link
          href="/organizations/access"
          className="mt-3 block rounded-lg border border-zinc-300 px-4 py-2 text-center text-sm font-semibold text-zinc-100 hover:border-zinc-100"
        >
          Acceso de organizaciones (OTP / contrasena)
        </Link>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </div>
    </main>
  );
}
