import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildContext, jakartaNow, type ContextRows } from "@/lib/kakak/context";
import type { KakakModel } from "@/lib/kakak/cost";
import { PRICES } from "@/lib/kakak/cost";
import { classifyApiError } from "@/lib/kakak/api-errors";
import { practiceAllowed, practiceClient } from "@/lib/kakak/practice";
import {
  BadTurnError,
  StaleConversationError,
  checkHistory,
  conversationStart,
  nextUserTurn,
  runKakakTurn,
  type BeginResult,
  type CallRecord,
  type KakakEffort,
  type KakakHistory,
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
// Seconds Vercel lets this route run (route segment config, Next 15). A slow
// call plus the engine's one retry must not be cut off by the Hobby default.
export const maxDuration = 60;

const MAX_BODY_BYTES = 256_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EFFORTS: KakakEffort[] = ["low", "medium", "high"];

function refused(reason: RefusalReason | "unavailable", status: number) {
  return NextResponse.json({ kind: "refused", reason }, { status });
}

function failed(reason: "invalid" | "api" | "too_long" | "refusal" | "stale" | "cap" | "slow", status = 200) {
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

/** A feature's explicit switch from household_features rows, or null when it has no row. */
function featureRow(rows: unknown, feature: string): boolean | null {
  const row = ((rows ?? []) as { feature: string; enabled: boolean }[]).find((r) => r.feature === feature);
  return typeof row?.enabled === "boolean" ? row.enabled : null;
}

/**
 * Shopping items, with each one's shelf and, since migrations/154, where it
 * is kept and its date (Phase 176). On a database without 154 the columns
 * don't exist (Postgres 42703): read the items as before, so Kakak keeps
 * working while the migration rolls out, with no ingredient places.
 */
async function readItems(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, householdId: string) {
  const items = await supabase
    .from("inventory_items")
    .select("id, name, scope, created_at, category, stock_status, kept_in, expires_on")
    .eq("household_id", householdId);
  if (items.error?.code !== "42703") return items;
  console.error("Kakak: ingredient places not read", items.error.message);
  return supabase.from("inventory_items").select("id, name, scope, created_at, category, stock_status").eq("household_id", householdId);
}

/**
 * The roster, with what each person sees (Phase 178, migrations/165). On a
 * database without 165 the column doesn't exist (Postgres 42703): read the
 * roster as before, so Kakak keeps working with everyone seeing everything.
 */
async function readStaff(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, householdId: string) {
  // Named columns: pin is revoked from every client role (migrations/096).
  const staff = await supabase
    .from("staff_profiles")
    .select("id, name, created_at, user_id, archived_at, hidden_areas")
    .eq("household_id", householdId);
  if (staff.error?.code !== "42703") return staff;
  console.error("Kakak: staff areas not read", staff.error.message);
  return supabase.from("staff_profiles").select("id, name, created_at, user_id, archived_at").eq("household_id", householdId);
}

async function readRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  householdId: string,
): Promise<ContextRows> {
  const [staff, pets, rooms, items, household, food] = await Promise.all([
    readStaff(supabase, householdId),
    supabase.from("task_entities").select("id, name, created_at, entity_type, metadata").eq("household_id", householdId).eq("entity_type", "pet"),
    supabase.from("household_locations").select("id, name, created_at, kind, parent_id").eq("household_id", householdId),
    readItems(supabase, householdId),
    // "Who lives here?" (Phase 162): pets switched off means no pet routines.
    supabase.from("households").select("has_pets").eq("id", householdId).maybeSingle(),
    // Household → Features (Phase 171): Food at home switched off means no
    // add_food; Kitchen amounts on as well means ingredients (Phase 176);
    // Repairs off leaves its row off the staff-areas card (Phase 178).
    supabase
      .from("household_features")
      .select("feature, enabled")
      .eq("household_id", householdId)
      .in("feature", ["food", "kitchen", "repairs"]),
  ]);
  for (const result of [staff, pets, rooms, items]) if (result.error) throw result.error;
  // Optional: a failed read (or a database without migrations/133) leaves
  // pets on, as before this phase, rather than failing Kakak's turn.
  if (household.error) console.error("Kakak: who lives here not read", household.error.message);
  if (food.error) console.error("Kakak: features not read", food.error.message);
  const petIds = (pets.data ?? []).map((p) => p.id as string);
  const schedules = petIds.length
    ? await supabase
        .from("master_schedules")
        .select("entity_id, title, frequency_type, fixed_times, is_active, expires_at, kind, days_of_week, created_at")
        .in("entity_id", petIds)
    : { data: [], error: null };
  if (schedules.error) throw schedules.error;
  return {
    staff: staff.data ?? [],
    pets: pets.data ?? [],
    schedules: schedules.data ?? [],
    rooms: rooms.data ?? [],
    items: items.data ?? [],
    hasPets: household.error ? null : ((household.data as { has_pets: boolean | null } | null)?.has_pets ?? null),
    foodOn: food.error ? null : featureRow(food.data, "food"),
    kitchenOn: food.error ? null : featureRow(food.data, "kitchen"),
    repairsOn: food.error ? null : featureRow(food.data, "repairs"),
  } as ContextRows;
}

export async function POST(request: NextRequest) {
  // Practice mode (KAKAK_PRACTICE=true, never on production): scripted
  // answers, nothing sent to Anthropic, no key needed, nothing counted or
  // recorded. Who may use Kakak is still checked, as below.
  const practice = practiceAllowed(process.env);
  if (process.env.KAKAK_PRACTICE === "true" && !practice) {
    console.error("kakak: KAKAK_PRACTICE is ignored on production");
  }
  // The kill switch: off unless the server says on.
  if (!practice && (process.env.KAKAK_ENABLED !== "true" || !process.env.ANTHROPIC_API_KEY)) {
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
  let history: KakakHistory;
  try {
    history = checkHistory(body.history);
    nextUserTurn(history, reply);
  } catch (error) {
    if (error instanceof StaleConversationError) return failed("stale");
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
  // The conversation's start, not the clock: the household block (and so
  // the system prompt) must be byte-identical on every turn of one
  // conversation, or the thinking blocks in the history are refused.
  const startedAt = conversationStart(history);
  const { today, now } = jakartaNow(startedAt);
  // The account's own choice (migrations/114), not the phone's word for it.
  const locale = await supabase.rpc("my_locale");
  const ownerLocale = locale.data === "id" ? "id" : locale.data === "en" ? "en" : body.locale === "id" ? "id" : "en";
  const built = buildContext(rows, { today, now, ownerLocale, callerUserId: auth.user.id });

  const client = practice
    ? practiceClient(built.household)
    : new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        authToken: null,
        // Fixed: the key and the household's words only ever go to Anthropic.
        baseURL: "https://api.anthropic.com",
        timeout: 30_000,
        maxRetries: 1,
      });

  // Practice: no call is counted against the limits and nothing is recorded,
  // so practising never uses up the household's day.
  const practiceBegin = async (): Promise<BeginResult> => ({
    ok: true,
    requestId: crypto.randomUUID(),
    callsLeft: row.calls_left,
  });
  const practiceRecord = async (requestId: string, call: CallRecord) => {
    console.info("kakak practice", requestId, call.outcome);
  };

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
      {
        client,
        model: modelFromEnv(),
        effort: effortFromEnv(),
        household: built.household,
        refs: built.refs,
        names: built.names,
        begin: practice ? practiceBegin : begin,
        record: practice ? practiceRecord : record,
        startedAt: startedAt.toISOString(),
      },
      body.history,
      reply,
    );
    if (result.kind === "refused") {
      if (result.reason === "busy") console.error("kakak: the global daily cap was reached");
      return refused(result.reason, result.reason === "limit" || result.reason === "busy" ? 429 : 403);
    }
    return NextResponse.json(practice ? { ...result, practice: true } : result);
  } catch (error) {
    if (error instanceof StaleConversationError) return failed("stale");
    if (error instanceof BadTurnError) return NextResponse.json({ error: "bad request" }, { status: 400 });
    // The spend limit, a bad key, rate limits and timeouts each get their own
    // plain sentence on the phone (lib/kakak/api-errors.ts).
    const { body: failure, status: code, log } = classifyApiError(error);
    console.error("kakak: call failed", log);
    return NextResponse.json(failure, { status: code });
  }
}
