/**
 * PitchingCoachAI — Simple Analytics
 *
 * Lightweight event tracking using Supabase.
 * No external dependencies. Privacy-friendly (no PII in events).
 */

const SUPABASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://sqzuolsexkmohmdopwrv.supabase.co")
    : "";

/**
 * Track an analytics event. Non-blocking, fire-and-forget.
 * Uses the anon key (public) so no secrets needed.
 */
export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>
): void {
  if (typeof window === "undefined") return;

  // Use navigator.sendBeacon for reliable tracking that survives page unloads
  const payload = {
    event,
    properties: properties || {},
    url: window.location.pathname,
    referrer: document.referrer || null,
    timestamp: new Date().toISOString(),
    screen_width: window.innerWidth,
    user_agent: navigator.userAgent.slice(0, 200),
  };

  // Fire and forget via fetch (non-blocking)
  try {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey || !SUPABASE_URL) return;

    fetch(`${SUPABASE_URL}/rest/v1/events`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
      keepalive: true, // survives page navigation
    }).catch(() => {}); // silently fail
  } catch {
    // Analytics should never break the app
  }
}

// Convenience functions
export const analytics = {
  pageView: (page: string) => trackEvent("page_view", { page }),
  analysisStarted: () => trackEvent("analysis_started"),
  analysisCompleted: (score: number, grade: string) =>
    trackEvent("analysis_completed", { score, grade }),
  analysisError: (error: string) => trackEvent("analysis_error", { error: error.slice(0, 200) }),
  leadSubmitted: (source: string | null) => trackEvent("lead_submitted", { source }),
  drillViewed: (drillName: string) => trackEvent("drill_viewed", { drill: drillName }),
  shareClicked: () => trackEvent("share_clicked"),
  lessonCTAClicked: () => trackEvent("lesson_cta_clicked"),
  videoUploaded: (fileSize: number) =>
    trackEvent("video_uploaded", { file_size_mb: Math.round(fileSize / 1024 / 1024) }),
};
