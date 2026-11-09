import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { practiceAllowed } from "@/lib/kakak/practice";

/**
 * What the owner did with Kakak's suggestion (migrations/126,
 * kakak_set_result): confirmed, changed, cancelled or undone. No content,
 * only the request id and one word. The database checks the caller is an
 * admin of that request's household and that it is set once (confirmed may
 * become undone).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESULTS = new Set(["confirmed", "changed", "cancelled", "undone"]);

export async function POST(request: NextRequest) {
  let body: { requestId?: unknown; result?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof body.requestId !== "string" || !UUID.test(body.requestId) || typeof body.result !== "string" || !RESULTS.has(body.result)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  // Practice requests are never recorded (api/kakak/route.ts), so there is
  // nothing to mark.
  if (practiceAllowed(process.env)) return NextResponse.json({ ok: true, practice: true });
  const { error } = await supabase.rpc("kakak_set_result", { p_request: body.requestId, p_result: body.result });
  if (error) return NextResponse.json({ error: "not recorded" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
