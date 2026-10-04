const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * Formats a "HH:mm" (or "HH:mm:ss") 24h time string, or a Date, into
 * 12-hour AM/PM form (e.g. "6:00 AM", "12:00 PM").
 */
export function formatTime12h(value: string | Date): string {
  if (value instanceof Date) return TIME_FORMATTER.format(value);
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return TIME_FORMATTER.format(d);
}

/**
 * A span of work as people say it (Phase 126): "under a minute", "25 min",
 * "1 h 5 min" — or in Bahasa Indonesia, "kurang dari 1 mnt", "25 mnt",
 * "1 j 5 mnt". Null for a negative span (clocks disagreeing), which would
 * only mislead.
 */
export function formatDuration(ms: number, lang: "en" | "id" = "en"): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return lang === "id" ? "kurang dari 1 mnt" : "under a minute";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const min = lang === "id" ? "mnt" : "min";
  const hr = lang === "id" ? "j" : "h";
  if (h === 0) return `${m} ${min}`;
  return m === 0 ? `${h} ${hr}` : `${h} ${hr} ${m} ${min}`;
}
