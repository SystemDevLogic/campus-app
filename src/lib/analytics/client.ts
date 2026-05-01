import { createClient } from "@/lib/supabase/browser";
import type { AnalyticsEventName } from "@/lib/analytics/events";

export async function trackClientEvent(eventName: AnalyticsEventName, metadata: Record<string, unknown> = {}) {
  try {
    const supabase = createClient();
    await supabase.from("analytics_events").insert({
      event_name: eventName,
      source: "client",
      metadata,
    });
  } catch {
    // Analytics must never block business flows.
  }
}
