import { redirect } from "next/navigation";

/**
 * The Phase 86C invite path. Kept as a redirect because links already sent by
 * WhatsApp cannot be recalled — a staff member opening an old one should land
 * in the app, not on a 404.
 */
export default async function LegacyJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  redirect(token ? `/join/staff?token=${encodeURIComponent(token)}` : "/join/staff");
}
