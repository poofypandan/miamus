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
