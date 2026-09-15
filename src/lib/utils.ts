export { cn } from "cn"

/**
 * A wa.me share link carrying `message` followed by a link to the dashboard.
 *
 * No phone number on purpose: the household has no stored owner contact, so
 * WhatsApp opens its own chat picker and staff choose who to send it to. The
 * URL is appended rather than templated in, so every notice ends with a
 * tappable link however the wording changes — and it's taken from the current
 * origin, so a preview deployment links to itself, not to production.
 */
export function generateWhatsAppLink(message: string): string {
  const dashboardUrl = `${window.location.origin}/dashboard`
  return `https://wa.me/?text=${encodeURIComponent(`${message} ${dashboardUrl}`)}`
}
