/**
 * PitchingCoachAI — Simple Analytics
 *
 * Lightweight event tracking via server-side API route.
 * No external dependencies. Privacy-friendly (no PII in events).
 */

/**
 * Track an analytics event. Non-blocking, fire-and-forget.
 */
export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>
): void {
  if (typeof window === "undefined") return;

  const payload = {
    event,
    properties: properties || {},
    url: window.location.pathname,
    referrer: document.referrer || null,
  };

  try {
    fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
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
