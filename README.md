# Campus App MVP

Aplicacion web/movil hibrida para planes universitarios (18-25).

## Stack
- Next.js 16 + React 19 + TypeScript
- Tailwind CSS
- Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- Zod para validacion de entorno

## Requisitos
- Node.js 22+
- npm 11+

## Setup rapido
1. Instalar dependencias:

```bash
npm install
```

2. Crear archivo `.env.local` desde `.env.example` y completar valores:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

3. Levantar servidor local:

```bash
npm run dev
```

Abrir `http://localhost:3000`.

## Scripts
```bash
npm run dev
npm run lint
npm run build
```

## SQL inicial
El esquema base MVP esta en:

`supabase/sql/001_init_schema.sql`

Ejecutalo en el SQL Editor de Supabase para crear tablas iniciales.

## Estructura relevante
```text
src/
	app/
	components/
	lib/
		env.ts
		supabase/
			browser.ts
			server.ts
	types/
supabase/
	sql/
```

## Siguiente paso de desarrollo
1. Implementar login (Google o magic link).
2. Onboarding de perfil (`university`, `age`, `interests`).
3. CRUD de planes con filtros.
4. Chat realtime por plan.
5. PWA instalable.
