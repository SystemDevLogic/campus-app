export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-20">
        <p className="mb-4 inline-block w-fit rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs tracking-[0.2em] text-zinc-300 uppercase">
          MVP in progress
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Campus App: planes universitarios para estudiantes de 18 a 25.
        </h1>
        <p className="mt-6 max-w-2xl text-zinc-300">
          Base tecnica lista para arrancar: Next.js + Supabase + Tailwind. Esta semana se
          construyen login, onboarding, planes, chat en tiempo real y PWA instalable.
        </p>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Esta noche</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-200">
              <li>- A1/A2 listos: setup y variables.</li>
              <li>- B1 iniciado: esquema SQL versionado.</li>
              <li>- Proximo: auth y onboarding.</li>
            </ul>
          </article>
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Comandos</h2>
            <ul className="mt-3 space-y-2 font-mono text-sm text-zinc-200">
              <li>npm run dev</li>
              <li>npm run lint</li>
              <li>npm run build</li>
            </ul>
          </article>
        </section>
      </main>
    </div>
  );
}
