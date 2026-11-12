import type { BrowserContext, Route } from "@playwright/test";
import { BENTO, HOUSEHOLD_ID, MOCHI, SCHEDULES } from "../fixtures/household";
import { applyAmountRules, convertAmount } from "../../src/lib/kitchen-units";
import type { InventoryItem } from "../../src/types/database";

/**
 * A pretend Supabase for the browser tests (Phases 146–147).
 *
 * The app under test is built with NEXT_PUBLIC_SUPABASE_URL=http://supabase.test
 * (see playwright.config.ts), and every request to that host is answered here.
 * The network can be cut per part: the token endpoint, the data API, sign-up.
 * RLS is played the way production plays it: a request carrying only the
 * public key sees no rows.
 *
 * Nothing reaches a real project. Any request to a supabase.co host is aborted
 * and recorded, and every test fails on one (see `expectNoRealBackend`).
 */
export const STUB_URL = "http://supabase.test";
export const ANON_KEY = "anon-test-key";
export const STAFF_ID = "00000000-0000-4000-8000-00000000c001";
/** The identity the phone already has. */
export const USER = "00000000-0000-4000-8000-00000000d001";
/** What a fresh anonymous sign-in would create instead. */
export const NEW_USER = "00000000-0000-4000-8000-00000000d002";
/**
 * The household's admin, signed in with Google (R6). The server half of the
 * stub (server-stub.cjs) knows this id too: it is the one account the
 * middleware finds a household for.
 */
export const OWNER = "00000000-0000-4000-8000-00000000e001";
export const OWNER_PROFILE_ID = "00000000-0000-4000-8000-00000000c0e1";

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSeconds = () => Math.floor(Date.now() / 1000);

export function session(userId: string, expiresAt: number, anonymous = true) {
  const claims = { sub: userId, role: "authenticated", is_anonymous: anonymous, exp: expiresAt, aud: "authenticated" };
  return {
    access_token: `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.sig`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: `refresh-${userId}-${expiresAt}`,
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      is_anonymous: anonymous,
      ...(anonymous ? {} : { email: "owner@example.test" }),
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-10-01T00:00:00Z",
    },
  };
}

/** A stored session whose access token is still good for 50 minutes. */
export const freshSession = (userId = USER, anonymous = true) =>
  session(userId, nowSeconds() + 3000, anonymous);
/** A stored session whose access token ran out ten minutes ago — the first open of the morning. */
export const expiredSession = (userId = USER) => session(userId, nowSeconds() - 600);

export interface StubOptions {
  /** The session already on the phone, if any. */
  stored?: ReturnType<typeof session> | null;
  /** Mark the phone as a bound staff device for HOUSEHOLD_ID with a chosen name. */
  staffPhone?: boolean;
  redeem?: "ok" | "used";
  /** Whether device_sessions says this phone is bound. */
  bound?: boolean;
  /**
   * Sign this phone in as the household's admin (R6): a Google session for
   * OWNER, their membership, and their saved language.
   */
  owner?: { locale: "en" | "id" };
  /** Kakak's household switch as kakak_status reports it to the admin (migrations/126). */
  kakak?: { allowed: boolean; enabled: boolean };
  /** household_locations rows the household already has (Phase 158). */
  rooms?: Record<string, unknown>[];
  /** bill_payments rows the household already has (Phase 164 PR B). */
  billPayments?: Record<string, unknown>[];
  /** household_tasks rows the household already has (Phase 158). */
  chores?: Record<string, unknown>[];
  /** Answer the room list with a server error until set back (Phase 158). */
  roomsFail?: { on: boolean };
  /** repairs rows the household already has (Phase 159); changed in place. */
  repairs?: Record<string, unknown>[];
  /**
   * "Who lives here?" (Phase 162): households.has_pets, and whether the
   * household has its two pets (default) or none at all.
   */
  household?: { hasPets: boolean | null; pets?: boolean; createdAt?: string };
  /**
   * Household → Features (Phase 171, migrations/145): household_features
   * rows by feature. Absent = no rows (everything on). Changed in place by
   * set_household_feature, so a staff phone in the same test reads the new value.
   */
  features?: Record<string, boolean>;
  /**
   * inventory_items rows the household already has (Phase 170 PR A). The
   * stub then holds them: updates, adjust_inventory_quantity and
   * record_purchase change them in place, with migrations/148's amount rules
   * and owner guard (a staff phone can't change tracking, units or low levels).
   */
  items?: Record<string, unknown>[];
  /**
   * recipes rows, each with an `ingredients` array (Phase 170 PR B,
   * migrations/151). save_recipe changes them in place (owners only, as the
   * database), so a staff phone in the same test reads what the owner saved.
   */
  recipes?: Record<string, unknown>[];
  /**
   * menu_dishes rows (Phase 170 PR C, migrations/153). Owners plan; the
   * cook functions change them in place, so a staff phone and the owner in
   * one test see the same menu. `kitchenNotes`: the household's note.
   */
  menu?: Record<string, unknown>[];
  kitchenNotes?: string | null;
  /** Hold the recipes read until `releaseRecipes()` (cooking must wait for it; Codex, PR #101). */
  holdRecipes?: boolean;
  /** Hold the kitchen notes read until `releaseKitchenNotes()` (the editor must wait for it). */
  holdKitchenNotes?: boolean;
  /** The VAPID public key get_push_public_key returns to the admin (push set up on the server). */
  pushKey?: string;
  /** Leave the Add to Home Screen tip showing (owner phones have it closed by default). */
  installTip?: boolean;
  /** leave_requests rows the household already has (Phase 163: leave cover). */
  leaves?: Record<string, unknown>[];
  /**
   * Leave the first-run checklist to the household's data (audit B1). Owner
   * phones have it closed by default, like the install tip: not under test.
   * Also leaves the household's setup stage unknown on the phone (Phase 172,
   * lib/calm-start), so What's new and the Home Screen tips wait for Today.
   */
  firstRun?: boolean;
  /**
   * The What's new card that holds this week on the phone (Phase 172: one
   * card a week), for a test about that card while others could show too.
   */
  whatsNewWeek?: string;
  /** The roster in place of Ari (audit B1); changed in place, so a reload sees it. */
  staff?: Record<string, unknown>[];
  /** Mochi's and Bento's names for this test (the demo's Mocha and Matcha; Phase 173 PR B). */
  petNames?: [string, string];
  /** What list_linked_phones answers the admin (audit B1); changed in place. */
  linkedPhones?: Record<string, unknown>[];
  /** task_logs rows already on record (audit B1: a household past setup). */
  logs?: Record<string, unknown>[];
  /**
   * Routines on top of the fixture's (Phase 173). The stub then holds
   * master_schedules itself: the admin adds, changes and removes rows; any
   * other session is refused, as migrations/144's policies do.
   */
  schedules?: Record<string, unknown>[];
  /** task_exceptions rows already on record (Phase 165); changed in place. */
  exceptions?: Record<string, unknown>[];
  /** repair_visits rows (walk-ins, Phase 174); changed in place. */
  walkIns?: Record<string, unknown>[];
  /** repair_supervision rows (Phase 174); changed in place by the stub's "triggers". */
  supervision?: Record<string, unknown>[];
  /** The admin's notification switches (Phase 165); changed in place. */
  notificationPrefs?: { evening_summary_hour: number | null; staff_request_pushes: boolean };
  /** What household_requests_push_on answers a staff phone (Phase 165). */
  requestsPushOn?: boolean;
  /**
   * Leave the staff "Tidak bisa dikerjakan" tip to show (Phase 165). Staff
   * phones have it closed by default: it is the newest tip, and would take
   * the one tip slot the older tests look at.
   */
  couldntTip?: boolean;
  /**
   * Notifications on a staff phone (Phase 166, migrations/141): what
   * my_phone_push_people answers the phone; with pushKey, the phone also
   * gets the VAPID key. set_my_push_person calls are recorded in seen.
   */
  staffPush?: {
    people: { staff_id: string; name: string }[];
    shared: boolean;
    household_on: boolean;
  };
}

/**
 * A weak signal on writes to one table (Phase 161), while the browser still
 * says it is online: `drop` aborts the request unanswered (a timeout);
 * `lostReply` saves it and then drops the answer (a reply lost on the way
 * back). Counts go down as they are used: lost replies first, then drops.
 */
export interface WriteTrouble {
  drop?: number;
  lostReply?: number;
}

export interface Stub {
  net: { token: boolean; rest: boolean; signup: boolean };
  /** Weak signal per table, for writes only (Phase 161). */
  trouble: Record<string, WriteTrouble>;
  /** Every write request that reached a table, in order: [method, table]. */
  writes: [string, string][];
  /** task_logs rows saved on this phone (Phase 161). */
  logs: Record<string, unknown>[];
  /** master_schedules as the stub holds them (Phase 173): the fixture's, the test's, and the admin's writes. */
  schedules: Record<string, unknown>[];
  /** task_entities as the stub holds them (Phase 173 PR B): Mochi, Bento, and pets the admin adds. */
  entities: Record<string, unknown>[];
  seen: {
    signups: number;
    tokenRefreshes: number;
    /** Who each invite redemption ran as. */
    redeemedAs: string[];
    /** Tables queried with only the public key. */
    anonTables: string[];
    realBackend: string[];
    /** set_my_push_person calls from a staff phone (Phase 166). */
    pushPeople: Record<string, unknown>[];
    /** The op id of each eat_food_portion call, resends included (Phase 170 PR A). */
    portionCalls: string[];
    /** The op id of each undo_food_portion call. */
    portionUndos: string[];
  };
  /** food_items rows as the stub holds them (Phase 156). */
  foods: Record<string, unknown>[];
  /** Set lostReplies to drop that many eat_food_portion answers after counting them. */
  portionTrouble: { lostReplies: number };
  /** household_tasks rows created on this phone (Kakak's saves). */
  tasks: Record<string, unknown>[];
  /** inventory_items rows added on this phone (Phase 164: gas and gallons). */
  supplies: Record<string, unknown>[];
  /** Kakak's switch, as the admin last set it. */
  kakak: { allowed: boolean; enabled: boolean };
  /** households.has_pets as the admin last set it (Phase 162). */
  household: { hasPets: boolean | null };
  /** household_features as the admin last set them (Phase 171). */
  features: Record<string, boolean>;
  /** repairs rows as the stub holds them (Phase 159). */
  repairs: Record<string, unknown>[];
  /** repair_costs and repair_notes rows (Phase 159 PR B). */
  repairCosts: Record<string, unknown>[];
  /** bill_payments rows (Phase 164 PR B), and who asked for them. */
  billPayments: Record<string, unknown>[];
  billPaymentReads: string[];
  /** Storage uploads and removals, as "bucket/path". */
  uploads: string[];
  removed: string[];
  repairNotes: Record<string, unknown>[];
  /** task_exceptions rows as the stub holds them (Phase 165). */
  exceptions: Record<string, unknown>[];
  /** repair_visits and repair_supervision as the stub holds them (Phase 174). */
  walkIns: Record<string, unknown>[];
  supervision: Record<string, unknown>[];
  /** The admin's notification switches as last saved (Phase 165). */
  notificationPrefs: { evening_summary_hour: number | null; staff_request_pushes: boolean };
  /** The admin's walk-in repair push switches as last saved (Phase 174 PR B). */
  repairPushPrefs: { repair_arrival_pushes: boolean; repair_done_pushes: boolean };
  /** recipes, each with its ingredients, as the stub holds them (Phase 170 PR B). */
  recipes: Record<string, unknown>[];
  /** menu_dishes as the stub holds them, and the household's kitchen note (Phase 170 PR C). */
  menu: Record<string, unknown>[];
  kitchen: { notes: string | null; confirmedAt: string | null };
  /** Answer the recipes reads held by `holdRecipes`. */
  releaseRecipes(): void;
  /** Answer the kitchen notes reads held by `holdKitchenNotes`. */
  releaseKitchenNotes(): void;
  setNetwork(up: boolean): void;
  /** Whose session the phone holds now, read from its cookie. */
  sessionUser(): Promise<string | null>;
}

const TABLES: Record<string, unknown[]> = {
  task_entities: [MOCHI, BENTO],
  master_schedules: SCHEDULES,
  staff_profiles: [
    { id: STAFF_ID, household_id: HOUSEHOLD_ID, name: "Ari", has_pin: true, user_id: null, archived_at: null, created_at: "2026-10-01T00:00:00Z" },
  ],
  households: [{ id: HOUSEHOLD_ID, name: "Rumah Uji" }],
};

function subOf(authorization: string | undefined): string {
  const token = authorization?.split(" ")[1] ?? "";
  if (token === ANON_KEY) return "anon";
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
  } catch {
    return "anon";
  }
}

export async function installStub(context: BrowserContext, options: StubOptions = {}): Promise<Stub> {
  const net = { token: true, rest: true, signup: true };
  const trouble: Record<string, WriteTrouble> = {};
  const writes: [string, string][] = [];
  const logs: Record<string, unknown>[] = options.logs ?? [];
  const schedules: Record<string, unknown>[] = [...(SCHEDULES as unknown as Record<string, unknown>[]), ...(options.schedules ?? [])];
  const entities: Record<string, unknown>[] = [MOCHI, BENTO].map(
    (p, i) => ({ ...p, name: options.petNames?.[i] ?? p.name }) as unknown as Record<string, unknown>
  );
  const seen: Stub["seen"] = { signups: 0, tokenRefreshes: 0, redeemedAs: [], anonTables: [], realBackend: [], pushPeople: [], portionCalls: [], portionUndos: [] };
  const foods: Record<string, unknown>[] = [];
  const recipes: Record<string, unknown>[] = options.recipes ?? [];
  const portionOps = new Map<string, { consumed: number; finished: boolean; undone: boolean }>();
  /** eat_food_portion answers to drop after counting (a reply lost on the way back). */
  const portionTrouble = { lostReplies: 0 };
  const tasks: Record<string, unknown>[] = [];
  const supplies: Record<string, unknown>[] = options.items ? options.items.map((row) => ({ ...row })) : [];
  const alerts: Record<string, unknown>[] = [];
  let release: () => void = () => undefined;
  const recipesHeld = { on: !!options.holdRecipes, wait: new Promise<void>((r) => (release = r)) };
  let releaseNotes: () => void = () => undefined;
  const notesHeld = { on: !!options.holdKitchenNotes, wait: new Promise<void>((r) => (releaseNotes = r)) };
  const menu: Record<string, unknown>[] = options.menu ? options.menu.map((row) => ({ ...row })) : [];
  const kitchen = { notes: options.kitchenNotes ?? null, confirmedAt: options.kitchenNotes ? "2026-11-10T00:00:00Z" : null };
  const repairs: Record<string, unknown>[] = options.repairs ?? [];
  const repairCosts: Record<string, unknown>[] = [];
  const billPayments: Record<string, unknown>[] = options.billPayments ? [...options.billPayments] : [];
  const billPaymentReads: string[] = [];
  const uploads: string[] = [];
  const removed: string[] = [];
  const repairNotes: Record<string, unknown>[] = [];
  const exceptions: Record<string, unknown>[] = options.exceptions ?? [];
  const walkIns: Record<string, unknown>[] = options.walkIns ?? [];
  const supervision: Record<string, unknown>[] = options.supervision ?? [];
  const notificationPrefs = options.notificationPrefs ?? { evening_summary_hour: 19, staff_request_pushes: true };
  const repairPushPrefs = { repair_arrival_pushes: true, repair_done_pushes: true };
  const kakak = { allowed: false, enabled: false, ...options.kakak };
  // An established household by default (Phase 172's calm first screen
  // shows What's new only to households 14+ days old and past setup).
  const household = {
    hasPets: options.household?.hasPets ?? null,
    createdAt: options.household?.createdAt ?? "2026-10-01T00:00:00Z",
  };
  const withPets = options.household?.pets !== false;
  const features: Record<string, boolean> = options.features ?? {};
  if (options.owner && !options.stored) options = { ...options, stored: freshSession(OWNER, false) };

  if (options.owner) {
    await context.addInitScript(
      ({ locale, installTip, firstRun, firstRunKey, stageKey, whatsNewWeek }) => {
        if (whatsNewWeek) {
          const d = new Date();
          const on = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          localStorage.setItem("miamus.whats-new.week", JSON.stringify({ id: whatsNewWeek, on }));
        }
        // The banner about adding staff, already dismissed: not under test.
        if (!installTip) localStorage.setItem("b11_onboarding_dismissed", "true");
        // The first-run checklist likewise, unless the test is about it; and
        // then the household is past setup on this phone (Phase 172).
        if (!firstRun) {
          localStorage.setItem(firstRunKey, "finished");
          if (!localStorage.getItem(stageKey)) localStorage.setItem(stageKey, "past");
        }
        localStorage.setItem("miamus.owner-locale", locale);
      },
      {
        locale: options.owner.locale,
        installTip: Boolean(options.installTip),
        firstRun: Boolean(options.firstRun),
        firstRunKey: `miamus.first-run.${OWNER_PROFILE_ID}`,
        stageKey: `miamus.setup-stage.${HOUSEHOLD_ID}`,
        whatsNewWeek: options.whatsNewWeek ?? null,
      }
    );
  }

  if (options.stored) {
    await context.addCookies([
      { name: "sb-supabase-auth-token", value: `base64-${b64u(options.stored)}`, domain: "localhost", path: "/" },
    ]);
  }
  if (options.staffPhone) {
    await context.addInitScript(
      ([household, staff, couldntTip, staffName]) => {
        // Only on the first load of each test: a reload must see what the
        // app itself wrote since.
        if (sessionStorage.getItem("stub-seeded")) return;
        sessionStorage.setItem("stub-seeded", "1");
        localStorage.setItem("miamus_tenant_id", household);
        localStorage.setItem("banyuwangi11:staffId", staff);
        localStorage.setItem("banyuwangi11:staffName", staffName);
        if (!couldntTip) localStorage.setItem("miamus.whats-new.staff-couldnt-do-2026-11", "seen");
      },
      // The phone's own person: Ari, or the first of options.staff (the demo's Syam).
      [HOUSEHOLD_ID, STAFF_ID, options.couldntTip ? "1" : "", String(options.staff?.[0]?.name ?? "Ari")]
    );
  }

  /** The writes the weak-signal tests use, answered as the stub would. */
  function answerWrite(route: Route, table: string, who: string) {
    if (table === "food_items") return answerFood(route, foods, false);
    if (table === "task_logs") return answerLogs(route, logs);
    if (table === "household_tasks") return answerTasks(route, tasks, options.chores, who);
    if (table === "task_exceptions") return answerExceptions(route, exceptions);
    return route.fulfill({ json: [] });
  }

  // Registered first, so the stub below takes precedence for its own host.
  await context.route(/^https?:\/\/[^/]*supabase\.(co|in)\//, (route: Route) => {
    seen.realBackend.push(route.request().url());
    return route.abort("blockedbyclient");
  });

  await context.route(`${STUB_URL}/**`, async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.startsWith("/auth/v1/signup")) {
      if (!net.signup) return route.abort("internetdisconnected");
      seen.signups += 1;
      return route.fulfill({ json: session(NEW_USER, nowSeconds() + 3600) });
    }
    if (path.startsWith("/auth/v1/token")) {
      if (!net.token) return route.abort("internetdisconnected");
      seen.tokenRefreshes += 1;
      return route.fulfill({ json: session(options.stored?.user.id ?? USER, nowSeconds() + 3600) });
    }
    // Storage (Phase 164 PR B): uploads and removals, recorded.
    if (path.startsWith("/storage/v1/object/")) {
      const rest = decodeURIComponent(path.slice("/storage/v1/object/".length));
      if (request.method() === "POST" || request.method() === "PUT") {
        uploads.push(rest);
        return route.fulfill({ json: { Key: rest, Id: rest } });
      }
      if (request.method() === "DELETE") {
        const prefixes: string[] = request.postDataJSON()?.prefixes ?? [];
        for (const p of prefixes) removed.push(`${rest}/${p}`);
        return route.fulfill({ json: prefixes.map((name) => ({ name })) });
      }
    }
    if (path.startsWith("/rest/v1/")) {
      if (!net.rest) return route.abort("internetdisconnected");
      const who = subOf(request.headers()["authorization"]);
      const table = path.slice("/rest/v1/".length);
      if (table === "rpc/redeem_staff_invite") {
        seen.redeemedAs.push(who);
        if (options.redeem === "used") {
          return route.fulfill({
            status: 400,
            json: { code: "22023", message: "invalid_or_expired_invite", details: null, hint: null },
          });
        }
        return route.fulfill({ json: HOUSEHOLD_ID });
      }
      if (who === "anon") {
        seen.anonTables.push(table);
        return route.fulfill({ json: [] });
      }
      if (options.owner && who === OWNER && table === "rpc/kakak_status") {
        return route.fulfill({
          json: [{ ...kakak, enabled_by: kakak.enabled ? OWNER : null, enabled_at: kakak.enabled ? "2026-11-08T03:00:00Z" : null, daily_limit: 40, calls_left: kakak.allowed ? 40 : 0 }],
        });
      }
      if (options.owner && who === OWNER && table === "rpc/get_push_public_key" && options.pushKey) {
        return route.fulfill({ json: options.pushKey });
      }
      if (options.staffPush && who !== OWNER) {
        if (table === "rpc/get_push_public_key" && options.pushKey) return route.fulfill({ json: options.pushKey });
        if (table === "rpc/my_phone_push_people") return route.fulfill({ json: options.staffPush });
        if (table === "rpc/set_my_push_person") {
          seen.pushPeople.push(request.postDataJSON());
          return route.fulfill({ json: { status: "ok" } });
        }
      }
      if (table === "rpc/set_household_feature") {
        // Owners only, as migrations/145 checks.
        if (who !== OWNER) {
          return route.fulfill({ status: 403, json: { code: "42501", message: "not_admin", details: null, hint: null } });
        }
        const body = request.postDataJSON();
        features[String(body?.p_feature)] = Boolean(body?.p_on);
        return route.fulfill({ status: 204, body: "" });
      }
      if (table === "household_features") {
        return route.fulfill({
          json: Object.entries(features).map(([feature, enabled]) => ({ feature, enabled })),
        });
      }
      if (options.owner && who === OWNER && table === "rpc/set_household_has_pets") {
        household.hasPets = Boolean(request.postDataJSON()?.p_on);
        return route.fulfill({ status: 204, body: "" });
      }
      if (options.owner && who === OWNER && table === "rpc/list_linked_phones") {
        return route.fulfill({ json: options.linkedPhones ?? [] });
      }
      if (table === "staff_profiles" && options.staff) {
        const one = (request.headers()["accept"] ?? "").includes("pgrst.object");
        return route.fulfill({ json: one ? (options.staff[0] ?? null) : options.staff });
      }
      if (table === "households") {
        if (notesHeld.on && (new URL(request.url()).searchParams.get("select") ?? "").includes("kitchen_notes")) {
          await notesHeld.wait;
        }
        const row = {
          id: HOUSEHOLD_ID,
          name: "Rumah Uji",
          has_pets: household.hasPets,
          created_at: household.createdAt,
          kitchen_notes: kitchen.notes,
          kitchen_notes_confirmed_at: kitchen.confirmedAt,
        };
        const one = (request.headers()["accept"] ?? "").includes("pgrst.object");
        return route.fulfill({ json: one ? row : [row] });
      }
      if (table === "task_entities" && !withPets) return route.fulfill({ json: [] });
      if (options.owner && who === OWNER && table === "rpc/set_kakak_enabled") {
        kakak.enabled = Boolean(request.postDataJSON()?.p_on);
        return route.fulfill({ status: 204, body: "" });
      }
      if (request.method() !== "GET") {
        writes.push([request.method(), table]);
        const t = trouble[table];
        if (t?.lostReply) {
          t.lostReply -= 1;
          // Saved, then the answer never arrives.
          await answerWrite(silent(route), table, who);
          return route.abort("connectionreset");
        }
        if (t?.drop) {
          t.drop -= 1;
          return route.abort("timedout");
        }
      }
      if (table === "task_logs") return answerLogs(route, logs);
      if (table === "master_schedules") return answerSchedules(route, schedules, who === OWNER);
      // Shopping notes (Phase 154's quick add; the menu's "Not in your Ingredients",
      // Phase 170 PR C): added here and read back once there are any.
      if (table === "inventory_alerts" && request.method() === "POST") {
        const body = request.postDataJSON();
        const row: Record<string, unknown> = {
          id: `00000000-0000-4000-8000-${String(700 + alerts.length).padStart(12, "0")}`,
          household_id: HOUSEHOLD_ID,
          status: "pending",
          resolved: false,
          staff_id: null,
          created_at: new Date().toISOString(),
          ...(Array.isArray(body) ? body[0] : body),
        };
        alerts.push(row);
        const object = (request.headers()["accept"] ?? "").includes("pgrst.object");
        return route.fulfill({ json: object ? row : [row] });
      }
      if (table === "inventory_alerts" && request.method() === "GET" && alerts.length > 0) {
        return route.fulfill({ json: alerts });
      }
      if (table === "task_entities") return answerEntities(route, entities);
      // Supplies added here (Phase 164), and read back once there are any.
      if (table === "inventory_items" && request.method() === "POST") {
        const body = request.postDataJSON();
        const row: Record<string, unknown> = {
          id: `00000000-0000-4000-8000-${String(600 + supplies.length).padStart(12, "0")}`,
          household_id: HOUSEHOLD_ID,
          stock_status: "ok",
          created_at: new Date().toISOString(),
          ...(Array.isArray(body) ? body[0] : body),
        };
        supplies.push(row);
        const object = (request.headers()["accept"] ?? "").includes("pgrst.object");
        return route.fulfill({ json: object ? row : [row] });
      }
      // Kitchen amounts (Phase 170 PR A, migrations/148).
      if (table === "inventory_items" && request.method() === "PATCH") {
        const itemId = (new URL(request.url()).searchParams.get("id") ?? "").replace(/^eq\./, "");
        const index = supplies.findIndex((row) => row.id === itemId);
        const patch = request.postDataJSON() as Record<string, unknown>;
        const before = supplies[index] as unknown as InventoryItem | undefined;
        if (!before) return route.fulfill({ json: [] });
        const ownerOnly = ["track_amount", "unit", "min_threshold", "name", "category", "scope", "photo_url", "notes"];
        if (who !== OWNER && ownerOnly.some((key) => key in patch && patch[key] !== (before as unknown as Record<string, unknown>)[key])) {
          return route.fulfill({ status: 403, json: { code: "42501", message: "inventory_owner_only", details: null, hint: null } });
        }
        const after = applyAmountRules(before, { ...before, ...patch } as InventoryItem);
        supplies[index] = after as unknown as Record<string, unknown>;
        const object = (request.headers()["accept"] ?? "").includes("pgrst.object");
        return route.fulfill({ json: object ? after : [after] });
      }
      if (table === "rpc/adjust_inventory_quantity" || table === "rpc/record_purchase") {
        const body = request.postDataJSON() as Record<string, unknown>;
        const index = supplies.findIndex((row) => row.id === body.p_item_id);
        const before = supplies[index] as unknown as InventoryItem | undefined;
        if (!before) return route.fulfill({ json: [] });
        let after: InventoryItem;
        if (table === "rpc/adjust_inventory_quantity") {
          after = applyAmountRules(before, {
            ...before,
            quantity: Math.max(0, before.quantity + Number(body.p_delta)),
            amount_set_by: (body.p_staff_id as string | null) ?? null,
          });
        } else {
          const amount = body.p_amount === null || body.p_amount === undefined ? null : Number(body.p_amount);
          const adds = before.track_amount === true && amount !== null;
          after = applyAmountRules(before, {
            ...before,
            quantity: adds ? before.quantity + amount! : before.quantity,
            last_bought_amount: adds ? amount : (before.last_bought_amount ?? null),
            amount_set_by: adds ? ((body.p_staff_id as string | null) ?? null) : (before.amount_set_by ?? null),
            stock_status: "ok",
            stock_status_by: (body.p_staff_id as string | null) ?? null,
            to_buy_amount: null,
          });
        }
        supplies[index] = after as unknown as Record<string, unknown>;
        const object = (request.headers()["accept"] ?? "").includes("pgrst.object");
        return route.fulfill({ json: object ? after : [after] });
      }
      // Recipes (Phase 170 PR B, migrations/151): every session reads;
      // owners write the recipe and all its lines through save_recipe.
      if (table === "recipes" && request.method() === "GET") {
        if (recipesHeld.on) await recipesHeld.wait;
        return route.fulfill({ json: recipes.map(({ ingredients: _lines, ...row }) => row) });
      }
      if (table === "recipe_ingredients" && request.method() === "GET") {
        return route.fulfill({ json: recipes.flatMap((r) => (r.ingredients as Record<string, unknown>[]) ?? []) });
      }
      if (table === "rpc/save_recipe" || (table === "recipes" && request.method() === "DELETE")) {
        if (who !== OWNER) {
          return route.fulfill({ status: 403, json: { code: "42501", message: "recipes_owner_only", details: null, hint: null } });
        }
        if (table === "recipes") {
          const id = (new URL(request.url()).searchParams.get("id") ?? "").replace(/^eq\./, "");
          const index = recipes.findIndex((r) => r.id === id);
          if (index < 0) return route.fulfill({ json: [] });
          recipes.splice(index, 1);
          return route.fulfill({ json: [{ id }] });
        }
        const body = request.postDataJSON() as { p_recipe: Record<string, unknown>; p_ingredients: Record<string, unknown>[] };
        const id = (body.p_recipe.id as string | null) ?? `00000000-0000-4000-8000-${String(151000 + recipes.length).padStart(12, "0")}`;
        const index = recipes.findIndex((r) => r.id === id);
        const now = new Date().toISOString();
        const ingredients = (body.p_ingredients ?? []).map((line, position) => ({
          id: `${id.slice(0, 24)}${String(position).padStart(12, "0")}`,
          household_id: HOUSEHOLD_ID,
          recipe_id: id,
          item_id: null,
          name_id: null,
          amount: null,
          unit: null,
          ...line,
          position,
        }));
        const recipe = {
          servings: 4,
          steps: null,
          written_in: "id",
          name_id: null,
          steps_id: null,
          ...(index >= 0 ? recipes[index] : { created_at: now, created_by: OWNER }),
          ...body.p_recipe,
          id,
          household_id: HOUSEHOLD_ID,
          updated_at: now,
          ingredients,
        };
        if (index >= 0) recipes[index] = recipe;
        else recipes.push(recipe);
        const { ingredients: lines, ...row } = recipe;
        return route.fulfill({ json: { recipe: row, ingredients: lines } });
      }
      // The weekly menu (Phase 170 PR C, migrations/153): every session
      // reads; owners write; anyone cooks through the two functions.
      if (table === "menu_dishes") {
        const params = new URL(request.url()).searchParams;
        if (request.method() === "GET") return route.fulfill({ json: filterRows(menu, params) });
        if (who !== OWNER) {
          return route.fulfill({ status: 403, json: { code: "42501", message: "new row violates row-level security policy", details: null, hint: null } });
        }
        if (request.method() === "POST") {
          const body = request.postDataJSON();
          const rows = (Array.isArray(body) ? body : [body]).map((fields: Record<string, unknown>, i: number) => {
            const now = new Date().toISOString();
            const row = {
              id: `00000000-0000-4000-8000-${String(153000 + menu.length + i).padStart(12, "0")}`,
              household_id: HOUSEHOLD_ID,
              notes: null,
              servings: null,
              recipe_id: null,
              position: 0,
              ...fields,
              cooked_at: null,
              cooked_by: null,
              cooked_uses: null,
              created_by: OWNER,
              created_at: now,
              updated_at: now,
            };
            return row;
          });
          menu.push(...rows);
          return route.fulfill({ json: rows });
        }
        if (request.method() === "PATCH") {
          const id = (params.get("id") ?? "").replace(/^eq\./, "");
          const index = menu.findIndex((d) => d.id === id);
          const patch = request.postDataJSON() as Record<string, unknown>;
          if (["cooked_at", "cooked_by", "cooked_uses"].some((key) => key in patch)) {
            return route.fulfill({ status: 403, json: { code: "42501", message: "cooked_through_functions_only", details: null, hint: null } });
          }
          if (index < 0) return route.fulfill({ status: 406, json: { code: "PGRST116", message: "no rows", details: null, hint: null } });
          menu[index] = { ...menu[index], ...patch, updated_at: new Date().toISOString() };
          return route.fulfill({ json: menu[index] });
        }
        if (request.method() === "DELETE") {
          const raw = params.get("id") ?? "";
          const ids = raw.startsWith("in.") ? raw.slice(4, -1).split(",").map((v) => v.replace(/"/g, "")) : [raw.replace(/^eq\./, "")];
          const gone = menu.filter((d) => ids.includes(String(d.id)));
          for (const dish of gone) menu.splice(menu.indexOf(dish), 1);
          return route.fulfill({ json: gone.map((d) => ({ id: d.id })) });
        }
      }
      if (table === "rpc/cook_menu_dish" || table === "rpc/uncook_menu_dish") {
        const body = request.postDataJSON() as {
          p_dish_id: string;
          p_uses?: { item_id: string; amount: number; unit?: string }[];
          p_staff_id?: string | null;
        };
        const index = menu.findIndex((d) => d.id === body.p_dish_id);
        if (index < 0) return route.fulfill({ status: 403, json: { code: "42501", message: "not_found", details: null, hint: null } });
        const dish = menu[index];
        const changed: Record<string, unknown>[] = [];
        const skipped: Record<string, unknown>[] = [];
        if (table === "rpc/cook_menu_dish") {
          if (dish.cooked_at) return route.fulfill({ status: 400, json: { code: "55000", message: "already_cooked", details: null, hint: null } });
          const took: { item_id: string; amount: number; unit: string }[] = [];
          for (const use of body.p_uses ?? []) {
            const at = supplies.findIndex((row) => row.id === use.item_id);
            const before = supplies[at] as unknown as InventoryItem | undefined;
            if (!before || before.track_amount !== true) {
              return route.fulfill({ status: 403, json: { code: "42501", message: "item_not_tracked", details: null, hint: null } });
            }
            const amount = use.unit ? convertAmount(use.amount, use.unit as InventoryItem["unit"], before.unit) : use.amount;
            if (amount === null) {
              return route.fulfill({ status: 400, json: { code: "22023", message: "unit_mismatch", details: null, hint: null } });
            }
            const taken = Math.min(before.quantity, amount);
            if (taken <= 0) continue;
            const after = applyAmountRules(before, { ...before, quantity: before.quantity - taken, amount_set_by: body.p_staff_id ?? null });
            supplies[at] = after as unknown as Record<string, unknown>;
            changed.push(supplies[at]);
            took.push({ item_id: use.item_id, amount: taken, unit: before.unit });
          }
          menu[index] = { ...dish, cooked_at: new Date().toISOString(), cooked_by: body.p_staff_id ?? null, cooked_uses: took };
        } else {
          for (const use of (dish.cooked_uses as { item_id: string; amount: number; unit?: string }[] | null) ?? []) {
            const at = supplies.findIndex((row) => row.id === use.item_id);
            const before = supplies[at] as unknown as InventoryItem | undefined;
            if (!before || before.track_amount !== true) continue;
            const back = use.unit ? convertAmount(use.amount, use.unit as InventoryItem["unit"], before.unit) : use.amount;
            if (back === null) {
              skipped.push(use);
              continue;
            }
            supplies[at] = applyAmountRules(before, { ...before, quantity: before.quantity + back }) as unknown as Record<string, unknown>;
            changed.push(supplies[at]);
          }
          menu[index] = { ...dish, cooked_at: null, cooked_by: null, cooked_uses: null };
        }
        return route.fulfill({ json: { dish: menu[index], items: changed, skipped } });
      }
      if (table === "rpc/set_kitchen_notes") {
        if (who !== OWNER) return route.fulfill({ status: 403, json: { code: "42501", message: "admins_only", details: null, hint: null } });
        const body = request.postDataJSON() as { p_notes: string | null; p_confirm?: boolean };
        kitchen.notes = body.p_notes?.trim() || null;
        if (body.p_confirm && !kitchen.confirmedAt) kitchen.confirmedAt = new Date().toISOString();
        return route.fulfill({ json: { kitchen_notes: kitchen.notes, kitchen_notes_confirmed_at: kitchen.confirmedAt } });
      }
      // Ate 1 portion and its Undo (migrations/148): decided here, once per op id.
      if (table === "rpc/eat_food_portion" || table === "rpc/undo_food_portion") {
        const body = request.postDataJSON() as Record<string, unknown>;
        const food = foods.find((row) => row.id === body.p_food_id);
        if (!food) return route.fulfill({ status: 403, json: { code: "42501", message: "not_found", details: null, hint: null } });
        const opId = String(body.p_op_id);
        const op = portionOps.get(opId);
        let answer: Record<string, unknown>;
        if (table === "rpc/eat_food_portion") {
          seen.portionCalls.push(opId);
          if (op) {
            answer = { food, consumed: op.consumed };
          } else {
            const takes = typeof food.portions === "number" && (food.portions as number) > 0 && !food.outcome;
            const ends = takes && food.portions === 1;
            portionOps.set(opId, { consumed: takes ? 1 : 0, finished: ends, undone: false });
            if (takes) {
              food.portions = (food.portions as number) - 1;
              if (ends) Object.assign(food, { outcome: "eaten", finished_at: new Date().toISOString() });
            }
            answer = { food, consumed: takes ? 1 : 0 };
          }
          if (portionTrouble.lostReplies > 0) {
            portionTrouble.lostReplies -= 1;
            return route.abort("connectionreset");
          }
        } else {
          seen.portionUndos.push(opId);
          let restored = 0;
          if (!op) {
            portionOps.set(opId, { consumed: 0, finished: false, undone: true });
          } else if (!op.undone) {
            op.undone = true;
            if (op.consumed === 1) {
              restored = 1;
              food.portions = Math.min(99, ((food.portions as number) ?? 0) + 1);
              if (op.finished && food.outcome === "eaten") Object.assign(food, { outcome: null, finished_at: null });
            }
          }
          answer = { food, restored };
        }
        return route.fulfill({ json: answer });
      }
      if (table === "inventory_items" && request.method() === "GET" && supplies.length > 0) {
        return route.fulfill({ json: supplies });
      }
      if (table === "household_tasks" && request.method() !== "GET") return answerTasks(route, tasks, options.chores, who);
      if (table === "household_tasks" && options.chores) {
        // The simple PostgREST filters the app's chore reads use (eq, neq,
        // lt, lte, gt, gte, is), so each read returns what the real backend
        // would: the week read misses a chore set up for later (Codex, #30).
        const rows = filterRows([...options.chores, ...tasks], new URL(request.url()).searchParams);
        // .single() asks for one object, not a list.
        const one = (request.headers()["accept"] ?? "").includes("pgrst.object");
        return route.fulfill({ json: one ? (rows[0] ?? null) : rows });
      }
      if (table === "leave_requests" && options.leaves) return route.fulfill({ json: options.leaves });
      if (table === "household_locations" && options.roomsFail?.on) {
        return route.fulfill({ status: 500, json: { message: "stub: rooms unavailable" } });
      }
      if (table === "household_locations" && options.rooms) return answerRooms(route, options.rooms);
      if (table === "repairs") return answerRepairs(route, repairs, who === OWNER);
      if (table === "repair_costs") return answerRepairCosts(route, repairCosts, who === OWNER);
      // migrations/138: payment removed and day reopened together, owners only.
      if (table === "rpc/reopen_bill_day") {
        const taskId = request.postDataJSON()?.p_task_id;
        const row = [...tasks, ...(options.chores ?? [])].find((t) => t.id === taskId);
        if (who !== OWNER || !row) return route.fulfill({ status: 403, json: { code: "42501", message: "chore_not_updated" } });
        const index = billPayments.findIndex((p) => p.task_id === taskId);
        const payment = index === -1 ? null : billPayments.splice(index, 1)[0];
        Object.assign(row, {
          status: "pending",
          completed_at: null,
          completed_by: null,
          photo_url: null,
          before_photo_url: null,
          after_photo_url: null,
        });
        return route.fulfill({ json: { task: row, payment } });
      }
      if (table === "bill_payments") {
        billPaymentReads.push(who === OWNER ? "owner" : "other");
        return answerBillPayments(route, billPayments, who === OWNER, (id) =>
          [...tasks, ...(options.chores ?? [])].some((t) => t.id === id && t.status === "completed")
        );
      }
      if (table === "repair_notes") return answerRepairNotes(route, repairNotes);
      // Phase 174 (migrations/149): walk-ins and supervising stretches.
      if (table === "repair_visits") return answerWalkIns(route, walkIns, supervision, who === OWNER);
      if (table === "repair_supervision") return answerSupervision(route, walkIns, supervision);
      // Phase 165 (migrations/139): couldn't-do records and the admin's switches.
      if (table === "task_exceptions") return answerExceptions(route, exceptions);
      if (table === "rpc/my_notification_prefs" && who === OWNER) return route.fulfill({ json: [notificationPrefs] });
      if (table === "rpc/set_my_notification_prefs" && who === OWNER) {
        const body = request.postDataJSON() ?? {};
        notificationPrefs.evening_summary_hour = body.p_hour ?? null;
        notificationPrefs.staff_request_pushes = Boolean(body.p_requests);
        return route.fulfill({ json: [notificationPrefs] });
      }
      if (table === "rpc/my_repair_push_prefs" && who === OWNER) return route.fulfill({ json: [repairPushPrefs] });
      if (table === "rpc/set_my_repair_push_prefs" && who === OWNER) {
        const body = request.postDataJSON() ?? {};
        repairPushPrefs.repair_arrival_pushes = Boolean(body.p_arrival);
        repairPushPrefs.repair_done_pushes = Boolean(body.p_done);
        return route.fulfill({ json: [repairPushPrefs] });
      }
      if (table === "rpc/household_requests_push_on") return route.fulfill({ json: Boolean(options.requestsPushOn) });
      if (table === "rpc/organise_rooms" && options.rooms) {
        return route.fulfill({ json: organise(request.postDataJSON()?.p_plan, options.rooms, options.chores ?? []) });
      }
      if (options.owner && who === OWNER) {
        const answer = ownerAnswer(table, options.owner.locale);
        if (answer !== undefined) return route.fulfill({ json: answer });
      }
      if (table === "device_sessions") {
        return route.fulfill({ json: options.bound ? [{ household_id: HOUSEHOLD_ID }] : [] });
      }
      const wantsObject = (request.headers()["accept"] ?? "").includes("pgrst.object");
      if (table === "food_items") return answerFood(route, foods, wantsObject);
      const rows = TABLES[table] ?? [];
      const wantsObjectRow = (request.headers()["accept"] ?? "").includes("pgrst.object");
      return route.fulfill({ json: wantsObjectRow ? (rows[0] ?? null) : rows });
    }
    return route.fulfill({ json: {} });
  });

  return {
    net,
    trouble,
    writes,
    logs,
    schedules,
    entities,
    seen,
    foods,
    portionTrouble,
    tasks,
    supplies,
    repairs,
    repairCosts,
    billPayments,
    billPaymentReads,
    uploads,
    removed,
    repairNotes,
    exceptions,
    walkIns,
    supervision,
    notificationPrefs,
    repairPushPrefs,
    kakak,
    household,
    features,
    recipes,
    menu,
    kitchen,
    releaseRecipes: () => {
      recipesHeld.on = false;
      release();
    },
    releaseKitchenNotes: () => {
      notesHeld.on = false;
      releaseNotes();
    },
    setNetwork(up: boolean) {
      net.token = net.rest = net.signup = up;
    },
    async sessionUser() {
      const cookie = (await context.cookies()).find((c) => c.name.startsWith("sb-supabase-auth-token"));
      if (!cookie) return null;
      try {
        return JSON.parse(Buffer.from(cookie.value.replace(/^base64-/, ""), "base64url").toString()).user.id;
      } catch {
        return null;
      }
    },
  };
}

/**
 * What the admin's own lookups return (R6). Undefined: fall through to the
 * shared tables.
 */
function ownerAnswer(table: string, locale: "en" | "id"): unknown {
  switch (table) {
    case "household_members":
      return [{ household_id: HOUSEHOLD_ID, role: "owner" }];
    case "rpc/my_locale":
      return locale;
    case "rpc/my_household_access":
      return "member";
    case "rpc/ensure_my_member_profile":
      return [
        {
          id: OWNER_PROFILE_ID,
          household_id: HOUSEHOLD_ID,
          name: "Owner",
          has_pin: false,
          user_id: OWNER,
          archived_at: null,
          created_at: "2026-10-01T00:00:00Z",
        },
      ];
    case "rpc/list_household_members":
      return [
        {
          user_id: OWNER,
          email: "owner@example.test",
          role: "owner",
          joined_at: "2026-10-01T00:00:00Z",
          is_founder: true,
          is_self: true,
        },
      ];
    default:
      return undefined;
  }
}

/**
 * Applies a request's simple column filters (`col=op.value`) to stub rows.
 * `or=(…)`, `not.…` and anything else unknown are left out: rows are kept,
 * so a test can only see more than the real backend would, never less.
 */
function filterRows(rows: Record<string, unknown>[], params: URLSearchParams): Record<string, unknown>[] {
  const ops: Record<string, (a: string | null, b: string) => boolean> = {
    eq: (a, b) => a === b,
    neq: (a, b) => a !== null && a !== b,
    lt: (a, b) => a !== null && a < b,
    lte: (a, b) => a !== null && a <= b,
    gt: (a, b) => a !== null && a > b,
    gte: (a, b) => a !== null && a >= b,
    is: (a, b) => (b === "null" ? a === null : String(a) === b),
  };
  const filters: [string, (a: string | null, b: string) => boolean, string][] = [];
  for (const [column, rawValue] of params.entries()) {
    if (["select", "order", "limit", "offset", "or", "and"].includes(column)) continue;
    // "not.is.null" (the repair visits' read, Phase 159): the inner filter, negated.
    const negate = rawValue.startsWith("not.");
    const raw = negate ? rawValue.slice(4) : rawValue;
    const dot = raw.indexOf(".");
    const name = raw.slice(0, dot);
    const inner = name in ops ? ops[name] : undefined;
    const op = inner === undefined ? undefined : negate ? (a: string | null, b: string) => !inner(a, b) : inner;
    if (dot > 0 && op) filters.push([column, op, raw.slice(dot + 1)]);
  }
  return rows.filter((row) =>
    filters.every(([column, op, value]) => op(row[column] == null ? null : String(row[column]), value))
  );
}

/**
 * household_locations reads and owner writes (Phase 158): the stub's rooms
 * array is changed in place, so later reads see it. Deleting a floor moves
 * its rooms to "no floor", as migrations/129 does; deleting a room moves its
 * rooms inside out (Phase 168).
 */
function answerRooms(route: Route, rooms: Record<string, unknown>[]) {
  const request = route.request();
  const wantsObject = (request.headers()["accept"] ?? "").includes("pgrst.object");
  const reply = (rows: Record<string, unknown>[]) => route.fulfill({ json: wantsObject ? (rows[0] ?? null) : rows });
  const id = new URL(request.url()).searchParams.get("id")?.replace(/^eq\./, "");
  if (request.method() === "GET") return route.fulfill({ json: rooms });
  if (request.method() === "POST") {
    const body = request.postDataJSON();
    const row = {
      id: `00000000-0000-4000-8000-${String(700 + rooms.length).padStart(12, "0")}`,
      kind: "room",
      parent_id: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
      ...(Array.isArray(body) ? body[0] : body),
    };
    rooms.push(row);
    return reply([row]);
  }
  const index = rooms.findIndex((r) => r.id === id);
  if (index === -1) return reply([]);
  if (request.method() === "DELETE") {
    // A room's rooms inside move to where it was, with its name in front
    // ("GB1 Bathroom"), as the rooms-inside-rooms migration does.
    const gone = rooms[index];
    for (const r of rooms) {
      if (r.parent_id !== id) continue;
      if (gone.kind === "floor") {
        r.parent_id = null;
      } else {
        r.parent_id = gone.parent_id ?? null;
        r.name = `${String(gone.name).trim()} ${String(r.name).trim()}`.slice(0, 60).trim();
      }
    }
    return reply(rooms.splice(index, 1));
  }
  Object.assign(rooms[index], request.postDataJSON() ?? {});
  return reply([rooms[index]]);
}

/** organise_rooms (migrations/129), applied to the stub's rooms and chores. */
function organise(
  plan: {
    places?: Record<string, unknown>[];
    merges?: { from: string; into: string; spot: string }[];
    chores?: Record<string, unknown>[];
    delete?: string[];
  },
  rooms: Record<string, unknown>[],
  chores: Record<string, unknown>[]
) {
  for (const place of plan.places ?? []) {
    const room = rooms.find((r) => r.id === place.id);
    if (room) Object.assign(room, place);
    else rooms.push({ kind: "room", parent_id: null, sort_order: 0, created_at: new Date().toISOString(), ...place });
  }
  const moved: Record<string, unknown>[] = [];
  for (const merge of plan.merges ?? []) {
    for (const chore of chores) {
      if (chore.location_id !== merge.from) continue;
      moved.push({ id: chore.id, location_id: chore.location_id, spot: chore.spot ?? null });
      chore.location_id = merge.into;
      chore.spot = chore.spot ?? merge.spot;
    }
  }
  for (const change of plan.chores ?? []) {
    const chore = chores.find((c) => c.id === change.id);
    if (chore) Object.assign(chore, change);
  }
  for (const id of plan.delete ?? []) {
    const index = rooms.findIndex((r) => r.id === id);
    if (index !== -1) rooms.splice(index, 1);
  }
  return { moved };
}

/**
 * The proof-photo rule as migrations/104 and 136 enforce it: becoming
 * completed needs both photos, except an admin finishing their own (or an
 * unassigned) chore with none at all. Returns the refusal, or null.
 */
function photoRefusal(
  row: Record<string, unknown>,
  patch: Record<string, unknown>,
  who: string
): { code: string; message: string } | null {
  if (patch.status !== "completed" || row.status === "completed") return null;
  const before = patch.before_photo_url ?? null;
  const after = patch.after_photo_url ?? null;
  if (before && after) return null;
  const mine = (id: unknown) => id === null || id === undefined || id === OWNER_PROFILE_ID;
  const ownPhotoFree =
    !before &&
    !after &&
    who === OWNER &&
    patch.completed_by === OWNER_PROFILE_ID &&
    mine(row.assigned_to) &&
    ("assigned_to" in patch ? mine(patch.assigned_to) : true);
  return ownPhotoFree ? null : { code: "23514", message: "A chore is completed with both a before and an after photo" };
}

/** household_tasks writes, enough for a chore saved and undone (Kakak). */
function answerTasks(
  route: Route,
  tasks: Record<string, unknown>[],
  seeded: Record<string, unknown>[] = [],
  who = ""
) {
  const request = route.request();
  const wantsObject = (request.headers()["accept"] ?? "").includes("pgrst.object");
  const reply = (rows: Record<string, unknown>[]) => route.fulfill({ json: wantsObject ? (rows[0] ?? null) : rows });
  if (request.method() === "POST") {
    const body = request.postDataJSON();
    // One insert may carry several chores (one per room, Phase 158).
    const rows = (Array.isArray(body) ? body : [body]).map((fields: Record<string, unknown>) => {
      const row: Record<string, unknown> = {
        id: `00000000-0000-4000-8000-${String(900 + tasks.length).padStart(12, "0")}`,
        household_id: HOUSEHOLD_ID,
        status: "pending",
        completed_at: null,
        completed_by: null,
        photo_url: null,
        parent_task_id: null,
        created_at: new Date().toISOString(),
        ...fields,
      };
      tasks.push(row);
      return row;
    });
    return reply(rows);
  }
  const id = new URL(request.url()).searchParams.get("id")?.replace(/^eq\./, "");
  const index = tasks.findIndex((t) => t.id === id);
  if (request.method() === "DELETE") return reply(index === -1 ? [] : tasks.splice(index, 1));
  // An edit (PATCH) applies to a chore created here or one the household
  // already had (Phase 158's seeded chores).
  const row = index === -1 ? seeded.find((t) => t.id === id) : tasks[index];
  if (row && request.method() === "PATCH") {
    const patch = request.postDataJSON() ?? {};
    const refusal = photoRefusal(row, patch, who);
    if (refusal) return route.fulfill({ status: 400, json: { ...refusal, details: null, hint: null } });
    Object.assign(row, patch);
  }
  return reply(row ? [row] : []);
}

/**
 * repairs (migrations/130), enough for the Repairs screens: list, report,
 * change by id, delete by id. The server's fields are stamped as 130's
 * guard does; a staff phone's report waits ("reported").
 */
function answerRepairs(route: Route, repairs: Record<string, unknown>[], owner: boolean) {
  const request = route.request();
  const wantsObject = (request.headers()["accept"] ?? "").includes("pgrst.object");
  const reply = (rows: Record<string, unknown>[]) => route.fulfill({ json: wantsObject ? (rows[0] ?? null) : rows });
  const id = new URL(request.url()).searchParams.get("id")?.replace(/^eq\./, "");
  const now = new Date().toISOString();
  if (request.method() === "GET") return reply(repairs);
  if (request.method() === "POST") {
    const body = request.postDataJSON();
    const fields = Array.isArray(body) ? body[0] : body;
    if (owner ? fields.status !== "open" : fields.status !== "reported") {
      return route.fulfill({ status: 403, json: { message: owner ? "repair_owner_reports_open" : "repair_staff_report_only" } });
    }
    const row: Record<string, unknown> = {
      id: `00000000-0000-4000-8000-${String(500 + repairs.length).padStart(12, "0")}`,
      household_id: HOUSEHOLD_ID,
      location_id: null,
      spot: null,
      details: null,
      photo_url: null,
      urgent: false,
      reported_by_staff: null,
      created_by: null,
      created_at: now,
      updated_at: now,
      decided_by: null,
      decided_at: null,
      dismiss_reason: null,
      fixed_by_name: null,
      closed_at: null,
      ...fields,
    };
    repairs.push(row);
    return reply([row]);
  }
  const index = repairs.findIndex((r) => r.id === id);
  if (request.method() === "DELETE") return reply(index === -1 ? [] : repairs.splice(index, 1));
  if (index === -1 || !owner) return reply([]);
  const patch = request.postDataJSON() ?? {};
  const row = repairs[index];
  if (patch.status && patch.status !== row.status) {
    if (row.status === "reported") row.decided_at = now;
    row.closed_at = patch.status === "fixed" || patch.status === "dismissed" ? now : null;
  }
  Object.assign(row, patch, { updated_at: now });
  if (row.status !== "dismissed") row.dismiss_reason = null;
  return reply([row]);
}

/** repair_costs (migrations/131): owners only; one row per repair, upserted. */
function answerRepairCosts(route: Route, costs: Record<string, unknown>[], owner: boolean) {
  const request = route.request();
  const wantsObject = (request.headers()["accept"] ?? "").includes("pgrst.object");
  const reply = (rows: Record<string, unknown>[]) => route.fulfill({ json: wantsObject ? (rows[0] ?? null) : rows });
  if (!owner) return reply([]);
  if (request.method() === "GET") {
    const id = new URL(request.url()).searchParams.get("repair_id")?.replace(/^eq\./, "");
    return reply(costs.filter((c) => c.repair_id === id));
  }
  const body = request.postDataJSON();
  const fields = Array.isArray(body) ? body[0] : body;
  const index = costs.findIndex((c) => c.repair_id === fields.repair_id);
  const row = { ...(index === -1 ? {} : costs[index]), ...fields, updated_at: new Date().toISOString() };
  if (index === -1) costs.push(row);
  else costs[index] = row;
  return reply([row]);
}

/**
 * bill_payments (migrations/138): owners only, as its policy; anyone else
 * reads nothing and writes nothing. Upsert by task_id, delete by task_id;
 * the server's fields stamped as 138's trigger does.
 */
function answerBillPayments(
  route: Route,
  payments: Record<string, unknown>[],
  owner: boolean,
  isPaid: (taskId: unknown) => boolean
) {
  const request = route.request();
  const wantsObject = (request.headers()["accept"] ?? "").includes("pgrst.object");
  const reply = (rows: Record<string, unknown>[]) => route.fulfill({ json: wantsObject ? (rows[0] ?? null) : rows });
  if (!owner) {
    if (request.method() === "GET") return reply([]);
    return route.fulfill({ status: 403, json: { code: "42501", message: "new row violates row-level security policy" } });
  }
  if (request.method() === "GET") return reply([...payments].sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at))));
  const taskId = new URL(request.url()).searchParams.get("task_id")?.replace(/^eq\./, "");
  if (request.method() === "DELETE") {
    const index = payments.findIndex((p) => p.task_id === taskId);
    return reply(index === -1 ? [] : payments.splice(index, 1));
  }
  const body = request.postDataJSON();
  const fields = Array.isArray(body) ? body[0] : body;
  // 138's trigger: only for a day that is done.
  if (!isPaid(fields.task_id)) {
    return route.fulfill({ status: 400, json: { code: "23514", message: "bill_payment_needs_paid_day", details: null, hint: null } });
  }
  const index = payments.findIndex((p) => p.task_id === fields.task_id);
  const now = new Date().toISOString();
  const row =
    index === -1
      ? { id: `00000000-0000-4000-8000-${String(400 + payments.length).padStart(12, "0")}`, series_id: fields.series_id ?? null, paid_at: now, ...fields, updated_at: now }
      : { ...payments[index], ...fields, updated_at: now };
  if (index === -1) payments.push(row);
  else payments[index] = row;
  return reply([row]);
}

/** repair_notes (migrations/131): read, add, delete by id. */
function answerRepairNotes(route: Route, notes: Record<string, unknown>[]) {
  const request = route.request();
  const wantsObject = (request.headers()["accept"] ?? "").includes("pgrst.object");
  const reply = (rows: Record<string, unknown>[]) => route.fulfill({ json: wantsObject ? (rows[0] ?? null) : rows });
  if (request.method() === "GET") return reply(notes);
  if (request.method() === "POST") {
    const body = request.postDataJSON();
    const fields = Array.isArray(body) ? body[0] : body;
    const row = {
      id: `00000000-0000-4000-8000-${String(600 + notes.length).padStart(12, "0")}`,
      photo_url: null,
      staff_id: null,
      created_by: null,
      created_at: new Date().toISOString(),
      ...fields,
      body: String(fields.body ?? "").trim(),
    };
    notes.push(row);
    return reply([row]);
  }
  const id = new URL(request.url()).searchParams.get("id")?.replace(/^eq\./, "");
  const index = notes.findIndex((n) => n.id === id);
  if (request.method() === "DELETE" && index !== -1) return reply(notes.splice(index, 1));
  return reply([]);
}

/**
 * food_items (migrations/123), enough of PostgREST for the Kitchen: list,
 * insert, update by id. The server's own fields are stamped as 123's
 * trigger does. Filters other than id are left to the app.
 */
function answerFood(route: Route, foods: Record<string, unknown>[], wantsObject: boolean) {
  const request = route.request();
  const method = request.method();
  const reply = (rows: Record<string, unknown>[]) =>
    route.fulfill({ json: wantsObject ? (rows[0] ?? null) : rows });
  if (method === "GET") return reply(foods);
  const now = new Date().toISOString();
  if (method === "POST") {
    const body = request.postDataJSON();
    const fields = Array.isArray(body) ? body[0] : body;
    // The primary key, as Postgres refuses a second copy (Phase 161).
    if (fields?.id && foods.some((f) => f.id === fields.id)) return duplicateKey(route, "food_items_pkey");
    const row: Record<string, unknown> = {
      id: `00000000-0000-4000-8000-${String(foods.length + 1).padStart(12, "0")}`,
      photo_url: null,
      kept_in: "fridge",
      expires_on: null,
      expiry_unknown: false,
      source: null,
      from_whom: null,
      return_container: false,
      container_returned_at: null,
      notes: null,
      added_by: null,
      created_by: USER,
      outcome: null,
      finished_at: null,
      finished_by: null,
      ...(Array.isArray(body) ? body[0] : body),
      created_at: now,
      updated_at: now,
    };
    foods.push(row);
    return reply([row]);
  }
  const id = new URL(request.url()).searchParams.get("id")?.replace(/^eq\./, "");
  const index = foods.findIndex((f) => f.id === id);
  if (index === -1) return reply([]);
  if (method === "PATCH") {
    const patch = request.postDataJSON();
    const before = foods[index];
    const row = { ...before, ...patch, updated_at: now };
    if ("outcome" in patch && patch.outcome !== before.outcome) {
      row.finished_at = patch.outcome ? now : null;
      if (!patch.outcome) row.finished_by = null;
    }
    foods[index] = row;
    return reply([row]);
  }
  if (method === "DELETE") return reply(foods.splice(index, 1));
  return reply([]);
}

/** The lists the household provider loads; none may go out with only the public key. */
export const HOUSEHOLD_TABLES = [
  "task_entities",
  "master_schedules",
  "task_logs",
  "medical_records",
  "inventory_alerts",
  "routine_proposals",
  "inventory_items",
  "inventory_audit_logs",
  "household_tasks",
  "leave_requests",
  "food_items",
];


/** Postgres's unique violation, as PostgREST answers it. */
function duplicateKey(route: Route, constraint: string) {
  return route.fulfill({
    status: 409,
    json: { code: "23505", message: `duplicate key value violates unique constraint "${constraint}"`, details: null, hint: null },
  });
}

/** A route whose answer goes nowhere: the write happens, the reply is lost. */
function silent(route: Route): Route {
  return { request: () => route.request(), fulfill: async () => undefined } as unknown as Route;
}

/**
 * task_logs (Phase 161): reads, and inserts that keep the phone's ids and
 * refuse a second copy of one, as the primary key does.
 */
function answerLogs(route: Route, logs: Record<string, unknown>[]) {
  const request = route.request();
  if (request.method() === "GET") {
    // "Has this routine any history?" (Phase 173) asks per schedule_id.
    const params = new URL(request.url()).searchParams;
    return route.fulfill({ json: params.has("schedule_id") ? filterRows(logs, params) : logs });
  }
  // Deletes by id (an undo, a cancelled walk; Phase 173), answered with what went.
  if (request.method() === "DELETE") {
    const gone = filterRows(logs, new URL(request.url()).searchParams);
    for (const row of gone) logs.splice(logs.indexOf(row), 1);
    return route.fulfill({ json: gone });
  }
  if (request.method() !== "POST") return route.fulfill({ json: [] });
  const body = request.postDataJSON();
  const rows: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
  if (rows.some((row) => row.id && logs.some((l) => l.id === row.id))) return duplicateKey(route, "task_logs_pkey");
  const saved = rows.map((row, i) => ({
    id: row.id ?? `00000000-0000-4000-8000-${String(800 + logs.length + i).padStart(12, "0")}`,
    sub_type: "complete",
    ...row,
    // Stamped by the database whatever the phone sent (migrations/144).
    received_at: new Date().toISOString(),
  }));
  logs.push(...saved);
  return route.fulfill({ json: saved });
}

/** task_entities (Phase 173 PR B): reads, a pet added (Add pet), and changes to one. */
function answerEntities(route: Route, rows: Record<string, unknown>[]) {
  const request = route.request();
  const method = request.method();
  const one = (request.headers()["accept"] ?? "").includes("pgrst.object");
  if (method === "GET") return route.fulfill({ json: one ? (rows[0] ?? null) : rows });
  if (method === "POST") {
    const body = request.postDataJSON();
    const saved = (Array.isArray(body) ? body : [body]).map((row: Record<string, unknown>, i: number) => ({
      id: `00000000-0000-4000-8000-${String(500 + rows.length + i).padStart(12, "0")}`,
      household_id: HOUSEHOLD_ID,
      created_at: new Date().toISOString(),
      metadata: {},
      ...row,
    }));
    rows.push(...saved);
    return route.fulfill({ json: one ? saved[0] : saved });
  }
  const matched = filterRows(rows, new URL(request.url()).searchParams);
  if (method === "PATCH") {
    const patch = request.postDataJSON();
    for (const row of matched) Object.assign(row, patch);
    return route.fulfill({ json: one ? (matched[0] ?? null) : matched });
  }
  return route.fulfill({ json: [] });
}

/**
 * master_schedules (Phase 173, migrations/144): everyone reads; only the
 * household's admin writes (a staff phone is refused, as the policies do).
 */
function answerSchedules(route: Route, rows: Record<string, unknown>[], admin: boolean) {
  const request = route.request();
  const method = request.method();
  const one = (request.headers()["accept"] ?? "").includes("pgrst.object");
  if (method === "GET") return route.fulfill({ json: one ? (rows[0] ?? null) : rows });
  if (!admin) {
    return route.fulfill({
      status: 403,
      json: { code: "42501", message: 'new row violates row-level security policy for table "master_schedules"' },
    });
  }
  const params = new URL(request.url()).searchParams;
  if (method === "POST") {
    const body = request.postDataJSON();
    const saved = (Array.isArray(body) ? body : [body]).map((row: Record<string, unknown>, i: number) => ({
      id: `00000000-0000-4000-8000-${String(700 + rows.length + i).padStart(12, "0")}`,
      interval_hours: null,
      start_time: null,
      end_time: null,
      is_active: true,
      expires_at: null,
      created_at: new Date().toISOString(),
      kind: null,
      routine_group_id: null,
      days_of_week: null,
      note: null,
      staff_id: null,
      proof: "photo",
      ...row,
    }));
    rows.push(...saved);
    return route.fulfill({ json: one ? saved[0] : saved });
  }
  const matched = filterRows(rows, params);
  if (method === "PATCH") {
    const patch = request.postDataJSON();
    for (const row of matched) Object.assign(row, patch);
    return route.fulfill({ json: one ? (matched[0] ?? null) : matched });
  }
  if (method === "DELETE") {
    for (const row of matched) rows.splice(rows.indexOf(row), 1);
    return route.fulfill({ json: matched });
  }
  return route.fulfill({ json: [] });
}

/**
 * task_exceptions (Phase 165, migrations/139): reads; inserts that keep the
 * phone's id, refuse a second copy of it (the primary key) and a second
 * record for the same task-day; deletes only within 5 minutes, answered with
 * what went (an RLS-filtered delete returns nothing).
 */
function answerExceptions(route: Route, rows: Record<string, unknown>[]) {
  const request = route.request();
  const method = request.method();
  const one = (request.headers()["accept"] ?? "").includes("pgrst.object");
  if (method === "GET") return route.fulfill({ json: rows });
  if (method === "POST") {
    const body = request.postDataJSON();
    const row: Record<string, unknown> = {
      chore_id: null,
      schedule_id: null,
      entity_id: null,
      slot_time: null,
      note: null,
      photo_url: null,
      inventory_item_id: null,
      staff_id: null,
      ...(Array.isArray(body) ? body[0] : body),
      created_at: new Date().toISOString(),
    };
    if (rows.some((r) => r.id === row.id)) return duplicateKey(route, "task_exceptions_pkey");
    if (row.chore_id && rows.some((r) => r.chore_id === row.chore_id && r.occurs_on === row.occurs_on)) {
      return duplicateKey(route, "task_exceptions_chore_day_key");
    }
    rows.push(row);
    return route.fulfill({ json: one ? row : [row] });
  }
  if (method === "DELETE") {
    const id = new URL(request.url()).searchParams.get("id")?.replace(/^eq\./, "");
    const index = rows.findIndex(
      (r) => r.id === id && Date.now() - new Date(String(r.created_at)).getTime() < 5 * 60 * 1000
    );
    return route.fulfill({ json: index === -1 ? [] : rows.splice(index, 1).map((r) => ({ id: r.id })) });
  }
  return route.fulfill({ json: [] });
}

function stubError(route: Route, status: number, code: string, message: string) {
  return route.fulfill({ status, json: { code, message, details: null, hint: null } });
}

/**
 * repair_visits (migrations/149), with its triggers in miniature: the server
 * stamps the times, a walk-in opens its logger's stretch (one per person:
 * supervision_busy), Selesai closes it, and a resend of the same id is
 * "already saved" (the primary key).
 */
function answerWalkIns(
  route: Route,
  walkIns: Record<string, unknown>[],
  supervision: Record<string, unknown>[],
  owner: boolean
) {
  const request = route.request();
  const wantsObject = (request.headers()["accept"] ?? "").includes("pgrst.object");
  const reply = (rows: Record<string, unknown>[]) => route.fulfill({ json: wantsObject ? (rows[0] ?? null) : rows });
  const id = new URL(request.url()).searchParams.get("id")?.replace(/^eq\./, "");
  const now = new Date().toISOString();
  if (request.method() === "GET") return reply(walkIns);
  if (request.method() === "POST") {
    const body = request.postDataJSON();
    const fields = Array.isArray(body) ? body[0] : body;
    if (walkIns.some((v) => v.id === fields.id)) {
      return stubError(route, 409, "23505", 'duplicate key value violates unique constraint "repair_visits_pkey"');
    }
    if (fields.logged_by_staff && supervision.some((s) => !s.ended_at && s.staff_id === fields.logged_by_staff)) {
      return stubError(route, 400, "23514", "supervision_busy");
    }
    const row: Record<string, unknown> = {
      worker_name: null,
      created_by: null,
      arrived_phone_at: null,
      left_at: null,
      left_phone_at: null,
      after_photo_url: null,
      outcome: null,
      note: null,
      ...fields,
      arrived_at: now,
    };
    walkIns.push(row);
    if (fields.logged_by_staff) {
      supervision.push({
        id: `00000000-0000-4000-8000-${String(900 + supervision.length).padStart(12, "0")}`,
        household_id: fields.household_id,
        visit_id: fields.id,
        staff_id: fields.logged_by_staff,
        user_id: null,
        started_at: now,
        ended_at: null,
      });
    }
    return reply([row]);
  }
  const index = walkIns.findIndex((v) => v.id === id);
  if (request.method() === "DELETE") {
    if (index === -1) return reply([]);
    supervision.splice(0, supervision.length, ...supervision.filter((s) => s.visit_id !== id));
    return reply(walkIns.splice(index, 1));
  }
  if (index === -1) return reply([]);
  const row = walkIns[index];
  const patch = request.postDataJSON() ?? {};
  if (patch.after_photo_url && !row.after_photo_url) {
    Object.assign(row, patch, { left_at: now });
    for (const s of supervision) if (s.visit_id === id && !s.ended_at) s.ended_at = now;
  } else if (patch.after_photo_url === null && row.after_photo_url) {
    const leftAt = row.left_at;
    Object.assign(row, { after_photo_url: null, left_at: null, left_phone_at: null, outcome: null, note: null });
    const last = supervision.filter((s) => s.visit_id === id && s.ended_at === leftAt).at(-1);
    if (last) last.ended_at = null;
  } else if (owner) {
    Object.assign(row, patch);
  }
  return reply([row]);
}

/** repair_supervision (migrations/149): reads, and the hand-over insert. */
function answerSupervision(route: Route, walkIns: Record<string, unknown>[], supervision: Record<string, unknown>[]) {
  const request = route.request();
  const wantsObject = (request.headers()["accept"] ?? "").includes("pgrst.object");
  const reply = (rows: Record<string, unknown>[]) => route.fulfill({ json: wantsObject ? (rows[0] ?? null) : rows });
  if (request.method() === "GET") return reply(supervision);
  if (request.method() !== "POST") return stubError(route, 403, "42501", "permission denied for table repair_supervision");
  const body = request.postDataJSON();
  const fields = Array.isArray(body) ? body[0] : body;
  if (supervision.some((s) => s.id === fields.id)) {
    return stubError(route, 409, "23505", 'duplicate key value violates unique constraint "repair_supervision_pkey"');
  }
  const visit = walkIns.find((v) => v.id === fields.visit_id);
  if (!visit || visit.after_photo_url) return stubError(route, 400, "23514", "supervision_visit_finished");
  if (supervision.some((s) => !s.ended_at && s.staff_id === fields.staff_id && s.visit_id !== fields.visit_id)) {
    return stubError(route, 400, "23514", "supervision_busy");
  }
  const now = new Date().toISOString();
  for (const s of supervision) if (s.visit_id === fields.visit_id && !s.ended_at) s.ended_at = now;
  const row = { user_id: null, ...fields, started_at: now, ended_at: null };
  supervision.push(row);
  return reply([row]);
}
