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
}

export interface Stub {
  net: { token: boolean; rest: boolean; signup: boolean };
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
  /** Kakak's switch, as the admin last set it. */
  kakak: { allowed: boolean; enabled: boolean };
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
  const seen: Stub["seen"] = { signups: 0, tokenRefreshes: 0, redeemedAs: [], anonTables: [], realBackend: [] };
  const foods: Record<string, unknown>[] = [];
  const tasks: Record<string, unknown>[] = [];
  const kakak = { allowed: false, enabled: false, ...options.kakak };
  if (options.owner && !options.stored) options = { ...options, stored: freshSession(OWNER, false) };

  if (options.owner) {
    await context.addInitScript((locale) => {
      // The banner about adding staff, already dismissed: not under test.
      localStorage.setItem("b11_onboarding_dismissed", "true");
      localStorage.setItem("miamus.owner-locale", locale);
    }, options.owner.locale);
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
      if (options.owner && who === OWNER && table === "rpc/set_kakak_enabled") {
        kakak.enabled = Boolean(request.postDataJSON()?.p_on);
        return route.fulfill({ status: 204, body: "" });
      }
      if (table === "household_tasks" && request.method() !== "GET") return answerTasks(route, tasks);
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
    seen,
    foods,
    tasks,
    kakak,
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

/** household_tasks writes, enough for a chore saved and undone (Kakak). */
function answerTasks(route: Route, tasks: Record<string, unknown>[]) {
  const request = route.request();
  const wantsObject = (request.headers()["accept"] ?? "").includes("pgrst.object");
  const reply = (rows: Record<string, unknown>[]) => route.fulfill({ json: wantsObject ? (rows[0] ?? null) : rows });
  if (request.method() === "POST") {
    const body = request.postDataJSON();
    const row: Record<string, unknown> = {
      id: `00000000-0000-4000-8000-${String(900 + tasks.length).padStart(12, "0")}`,
      household_id: HOUSEHOLD_ID,
      status: "pending",
      completed_at: null,
      completed_by: null,
      photo_url: null,
      parent_task_id: null,
      created_at: new Date().toISOString(),
      ...(Array.isArray(body) ? body[0] : body),
    };
    tasks.push(row);
    return reply([row]);
  }
  const id = new URL(request.url()).searchParams.get("id")?.replace(/^eq\./, "");
  const index = tasks.findIndex((t) => t.id === id);
  if (request.method() === "DELETE") return reply(index === -1 ? [] : tasks.splice(index, 1));
  return reply(index === -1 ? [] : [tasks[index]]);
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

