import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <section className="w-full max-w-lg rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/30">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Sin conexion</p>
        <h1 className="mt-3 text-3xl font-semibold">Campus App esta sin red</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-300">
          Puedes volver a intentar cuando recuperes conexion. Si ya abriste contenido recientemente,
          algunas partes de la app pueden seguir disponibles desde la cache local.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
          >
            Ir al inicio
          </Link>
          <Link
            href="/login"
            className="inline-flex rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-500"
          >
            Volver al login
          </Link>
        </div>
      </section>
    </main>
  );
}
