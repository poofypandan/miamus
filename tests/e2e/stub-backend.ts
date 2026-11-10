import type { BrowserContext, Route } from "@playwright/test";
import { BENTO, HOUSEHOLD_ID, MOCHI, SCHEDULES } from "../fixtures/household";

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
  household?: { hasPets: boolean | null; pets?: boolean };
  /** The VAPID public key get_push_public_key returns to the admin (push set up on the server). */
  pushKey?: string;
  /** Leave the Add to Home Screen tip showing (owner phones have it closed by default). */
  installTip?: boolean;
  /** leave_requests rows the household already has (Phase 163: leave cover). */
  leaves?: Record<string, unknown>[];
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
  seen: {
    signups: number;
    tokenRefreshes: number;
    /** Who each invite redemption ran as. */
    redeemedAs: string[];
    /** Tables queried with only the public key. */
    anonTables: string[];
    realBackend: string[];
  };
  /** food_items rows as the stub holds them (Phase 156). */
  foods: Record<string, unknown>[];
  /** household_tasks rows created on this phone (Kakak's saves). */
  tasks: Record<string, unknown>[];
  /** inventory_items rows added on this phone (Phase 164: gas and gallons). */
  supplies: Record<string, unknown>[];
  /** Kakak's switch, as the admin last set it. */
  kakak: { allowed: boolean; enabled: boolean };
  /** households.has_pets as the admin last set it (Phase 162). */
  household: { hasPets: boolean | null };
  /** repairs rows as the stub holds them (Phase 159). */
  repairs: Record<string, unknown>[];
  /** repair_costs and repair_notes rows (Phase 159 PR B). */
  repairCosts: Record<string, unknown>[];
  repairNotes: Record<string, unknown>[];
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
  const logs: Record<string, unknown>[] = [];
  const seen: Stub["seen"] = { signups: 0, tokenRefreshes: 0, redeemedAs: [], anonTables: [], realBackend: [] };
  const foods: Record<string, unknown>[] = [];
  const tasks: Record<string, unknown>[] = [];
  const supplies: Record<string, unknown>[] = [];
  const repairs: Record<string, unknown>[] = options.repairs ?? [];
  const repairCosts: Record<string, unknown>[] = [];
  const repairNotes: Record<string, unknown>[] = [];
  const kakak = { allowed: false, enabled: false, ...options.kakak };
  const household = { hasPets: options.household?.hasPets ?? null };
  const withPets = options.household?.pets !== false;
  if (options.owner && !options.stored) options = { ...options, stored: freshSession(OWNER, false) };

  if (options.owner) {
    await context.addInitScript(
      ({ locale, installTip }) => {
        // The banner about adding staff, already dismissed: not under test.
        if (!installTip) localStorage.setItem("b11_onboarding_dismissed", "true");
        localStorage.setItem("miamus.owner-locale", locale);
      },
      { locale: options.owner.locale, installTip: Boolean(options.installTip) }
    );
  }

  if (options.stored) {
    await context.addCookies([
      { name: "sb-supabase-auth-token", value: `base64-${b64u(options.stored)}`, domain: "localhost", path: "/" },
    ]);
  }
  if (options.staffPhone) {
    await context.addInitScript(
      ([household, staff]) => {
        // Only on the first load of each test: a reload must see what the
        // app itself wrote since.
        if (sessionStorage.getItem("stub-seeded")) return;
        sessionStorage.setItem("stub-seeded", "1");
        localStorage.setItem("miamus_tenant_id", household);
        localStorage.setItem("banyuwangi11:staffId", staff);
        localStorage.setItem("banyuwangi11:staffName", "Ari");
      },
      [HOUSEHOLD_ID, STAFF_ID]
    );
  }

  /** The writes the weak-signal tests use, answered as the stub would. */
  function answerWrite(route: Route, table: string, who: string) {
    if (table === "food_items") return answerFood(route, foods, false);
    if (table === "task_logs") return answerLogs(route, logs);
    if (table === "household_tasks") return answerTasks(route, tasks, options.chores, who);
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
      if (options.owner && who === OWNER && table === "rpc/set_household_has_pets") {
        household.hasPets = Boolean(request.postDataJSON()?.p_on);
        return route.fulfill({ status: 204, body: "" });
      }
      if (table === "households") {
        const row = { id: HOUSEHOLD_ID, name: "Rumah Uji", has_pets: household.hasPets };
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
      if (table === "repair_notes") return answerRepairNotes(route, repairNotes);
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
    seen,
    foods,
    tasks,
    supplies,
    repairs,
    repairCosts,
    repairNotes,
    kakak,
    household,
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
 * its rooms to "no floor", as migrations/129 does.
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
    for (const r of rooms) if (r.parent_id === id) r.parent_id = null;
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
  if (request.method() === "GET") return route.fulfill({ json: logs });
  if (request.method() !== "POST") return route.fulfill({ json: [] });
  const body = request.postDataJSON();
  const rows: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
  if (rows.some((row) => row.id && logs.some((l) => l.id === row.id))) return duplicateKey(route, "task_logs_pkey");
  const saved = rows.map((row, i) => ({
    id: row.id ?? `00000000-0000-4000-8000-${String(800 + logs.length + i).padStart(12, "0")}`,
    sub_type: "complete",
    ...row,
  }));
  logs.push(...saved);
  return route.fulfill({ json: saved });
}
