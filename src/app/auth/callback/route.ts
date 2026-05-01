import { NextResponse } from "next/server";

import { trackServerEvent } from "@/lib/analytics/events";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: existingSignupEvent } = await supabase
          .from("analytics_events")
          .select("id")
          .eq("event_name", "signup_completed")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!existingSignupEvent) {
          await trackServerEvent(supabase, "signup_completed", {
            userId: user.id,
            source: "server",
            metadata: { via: "oauth_callback" },
          });
        }
      }
    } catch {
      // Ignore analytics failures.
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
