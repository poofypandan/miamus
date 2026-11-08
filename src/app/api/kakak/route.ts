import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildContext, jakartaNow, type ContextRows } from "@/lib/kakak/context";
import type { KakakModel } from "@/lib/kakak/cost";
import { PRICES } from "@/lib/kakak/cost";
import {
  BadTurnError,
  checkHistory,
  nextUserTurn,
  runKakakTurn,
  type BeginResult,
  type CallRecord,
  type KakakEffort,
  type RefusalReason,
} from "@/lib/kakak/engine";

/**
 * Tell Kakak (Phase 156 step 2, docs/phase-156-step2-kakak-plan.md, section 4).
 *
 * The owner's sentence in, one question / suggestions / short reply out.
 * This route never writes household data: the phone saves a confirmed
 * suggestion through the same HouseholdProvider actions as a manual entry.
 *
 * Who may call it is decided by the database, with the caller's own JWT:
 * kakak_begin (migrations/126) refuses anyone who is not an admin of the
 * household (staff phones included), a household not on the family list or
 * not switched on, and anyone over the daily limits, before anything is sent
 * to Anthropic. The household context is read with the same session, so RLS
 * decides what can be read; nothing in it comes from the phone.
 *
 * Logs carry the request id, outcome, tokens and latency, never the sentence,
 * the household or Kakak's words.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EFFORTS: KakakEffort[] = ["low", "medium", "high"];

function refused(reason: RefusalReason | "unavailable", status: number) {
  return NextResponse.json({ kind: "refused", reason }, { status });
}

function failed(reason: "invalid" | "api" | "too_long" | "refusal", status = 200) {
  return NextResponse.json({ kind: "failed", reason }, { status });
}

function modelFromEnv(): KakakModel {
  const model = process.env.KAKAK_MODEL;
  return model && model in PRICES ? (model as KakakModel) : "claude-opus-5-5";
}

function effortFromEnv(): KakakEffort {
  const effort = process.env.KAKAK_EFFORT as KakakEffort | undefined;
  return effort && EFFORTS.includes(effort) ? effort : "low";
}

async function readRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  householdId: string,
): Promise<ContextRows> {
  const [staff, pets, rooms, items] = await Promise.all([
    supabase
      .from("staff_profiles")
      // Named columns: pin is revoked from every client role (migrations/096).
      .select("id, name, created_at, user_id, archived_at")
      .eq("household_id", householdId),
    supabase.from("task_entities").select("id, name, created_at, entity_type, metadata").eq("household_id", householdId).eq("entity_type", "pet"),
    supabase.from("household_locations").select("id, name, created_at").eq("household_id", householdId),
    supabase.from("inventory_items").select("id, name, scope, created_at").eq("household_id", householdId),
  ]);
  for (const result of [staff, pets, rooms, items]) if (result.error) throw result.error;
  const petIds = (pets.data ?? []).map((p) => p.id as string);
  const schedules = petIds.length
    ? await supabase
        .from("master_schedules")
        .select("entity_id, title, frequency_type, fixed_times, is_active, expires_at")
        .in("entity_id", petIds)
    : { data: [], error: null };
  if (schedules.error) throw schedules.error;
  return {
    staff: staff.data ?? [],
    pets: pets.data ?? [],
    schedules: schedules.data ?? [],
    rooms: rooms.data ?? [],
    items: items.data ?? [],
  } as ContextRows;
}

export async function POST(request: NextRequest) {
  // The kill switch: off unless the server says on.
  if (process.env.KAKAK_ENABLED !== "true" || !process.env.ANTHROPIC_API_KEY) {
    return refused("unavailable", 503);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }

  let body: { householdId?: unknown; history?: unknown; reply?: unknown; locale?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const householdId = typeof body.householdId === "string" && UUID.test(body.householdId) ? body.householdId : null;
  const reply = typeof body.reply === "string" ? body.reply : "";
  if (!householdId) return NextResponse.json({ error: "bad request" }, { status: 400 });
  // Check the turn's shape before anything is counted or read.
  try {
    nextUserTurn(checkHistory(body.history), reply);
  } catch (error) {
    if (error instanceof BadTurnError) return NextResponse.json({ error: "bad request" }, { status: 400 });
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  // Fails early, and free, for a staff phone or a household that is off; each
  // call to Claude below still goes through kakak_begin.
  const status = await supabase.rpc("kakak_status", { p_household: householdId });
  if (status.error) return refused("not_admin", 403);
  const row = (Array.isArray(status.data) ? status.data[0] : status.data) as
    | { allowed: boolean; enabled: boolean; calls_left: number }
    | undefined;
  if (!row?.allowed) return refused("not_allowed", 403);
  if (!row.enabled) return refused("off", 403);
  if (row.calls_left <= 0) return refused("limit", 429);

  let rows: ContextRows;
  try {
    rows = await readRows(supabase, householdId);
  } catch (error) {
    console.error("kakak: could not read the household", (error as { code?: string }).code ?? "unknown");
    return failed("api", 500);
  }
  const { today, now } = jakartaNow();
  // The account's own choice (migrations/114), not the phone's word for it.
  const locale = await supabase.rpc("my_locale");
  const ownerLocale = locale.data === "id" ? "id" : locale.data === "en" ? "en" : body.locale === "id" ? "id" : "en";
  const built = buildContext(rows, { today, now, ownerLocale, callerUserId: auth.user.id });

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    authToken: null,
    // Fixed: the key and the household's words only ever go to Anthropic.
    baseURL: "https://api.anthropic.com",
    timeout: 30_000,
    maxRetries: 1,
  });

  const begin = async (): Promise<BeginResult> => {
    const { data, error } = await supabase.rpc("kakak_begin", { p_household: householdId });
    if (error || !data) return { ok: false, reason: "not_admin" };
    const result = data as { ok: boolean; request_id?: string; calls_left?: number; reason?: RefusalReason };
    return result.ok && result.request_id
      ? { ok: true, requestId: result.request_id, callsLeft: result.calls_left ?? 0 }
      : { ok: false, reason: result.reason ?? "not_admin" };
  };
  const record = async (requestId: string, call: CallRecord) => {
    const { error } = await supabase.rpc("kakak_record", {
      p_request: requestId,
      p_model: call.model,
      p_outcome: call.outcome,
      p_tools: call.tools,
      p_input_tokens: call.inputTokens,
      p_cache_read_tokens: call.cacheReadTokens,
      p_cache_write_tokens: call.cacheWriteTokens,
      p_output_tokens: call.outputTokens,
      p_cost_micro_usd: call.costMicroUsd,
      p_latency_ms: call.latencyMs,
    });
    // Statistics only: a failed record never fails the owner's request.
    if (error) console.error("kakak: could not record", requestId, error.code);
    console.info("kakak", requestId, call.outcome, call.model, call.inputTokens, call.outputTokens, call.latencyMs);
  };

  try {
    const result = await runKakakTurn(
      { client, model: modelFromEnv(), effort: effortFromEnv(), household: built.household, refs: built.refs, names: built.names, begin, record },
      body.history,
      reply,
    );
    if (result.kind === "refused") {
      if (result.reason === "busy") console.error("kakak: the global daily cap was reached");
      return refused(result.reason, result.reason === "limit" || result.reason === "busy" ? 429 : 403);
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BadTurnError) return NextResponse.json({ error: "bad request" }, { status: 400 });
    const kind = error instanceof Anthropic.APIError ? `${error.status ?? "?"} ${error.name}` : (error as Error)?.name;
    console.error("kakak: call failed", kind);
    return failed("api", 502);
  }
}
