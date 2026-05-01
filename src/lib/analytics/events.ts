export type AnalyticsEventName =
  | "signup_completed"
  | "onboarding_completed"
  | "plan_created"
  | "plan_joined"
  | "message_sent";

type TrackServerEventOptions = {
  userId?: string | null;
  source?: "server" | "client" | "web";
  metadata?: Record<string, unknown>;
};

export async function trackServerEvent(
  supabase: { from: (table: string) => { insert: (payload: Record<string, unknown>) => unknown } },
  eventName: AnalyticsEventName,
  options: TrackServerEventOptions = {},
) {
  try {
    await supabase.from("analytics_events").insert({
      event_name: eventName,
      user_id: options.userId ?? null,
      source: options.source ?? "server",
      metadata: options.metadata ?? {},
    });
  } catch {
    // Analytics must never block business flows.
  }
}
