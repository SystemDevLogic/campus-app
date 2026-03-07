import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getClientEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  const env = getClientEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In Server Components, Next.js forbids mutating cookies.
        // Route Handlers and Server Actions can write them normally.
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Safe to ignore here; session refresh writes should happen in middleware/route handlers.
        }
      },
    },
  });
}
