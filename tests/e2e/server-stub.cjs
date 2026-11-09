/**
 * The server half of the browser tests' pretend Supabase (R6).
 *
 * Playwright's stub (stub-backend.ts) answers what the *browser* asks. The
 * middleware asks from the *server* — "who is this cookie?" and "are they in
 * a household?" — and those requests never pass through the browser, so
 * until now every owner screen bounced to "/" in the tests.
 *
 * playwright.config.ts preloads this file into `next start` (NODE_OPTIONS
 * --require) with E2E_SERVER_STUB=1. It starts a tiny HTTP server inside the
 * Next process and points connections for the build's fake host,
 * supabase.test, at it. Nothing else is touched; any other host connects as
 * normal. It is never loaded outside the browser tests.
 *
 * What it answers, as the real services would:
 *   GET /auth/v1/user               the token's own user (401 if expired)
 *   GET /rest/v1/household_members  the owner's membership, for OWNER only
 *   Kakak's route in practice mode (KAKAK_PRACTICE=true in the test server):
 *   POST /rest/v1/rpc/kakak_status  allowed and on, for OWNER only
 *   POST /rest/v1/rpc/my_locale     "id"
 *   GET  staff_profiles, task_entities, household_locations,
 *        inventory_items, master_schedules  a small fixed household
 *   GET /storage/v1/object/household-logs/<household>/...
 *        a 1080x810 JPEG, for OWNER only (storage RLS in miniature)
 *   GET /storage/v1/render/...      500: the app resizes photos itself now
 *                                   (Phase 160), so nothing may ask for this
 *   anything else                   404
 *
 * Tokens are the stub's unsigned test JWTs; only their claims are read.
 */
"use strict";

const http = require("node:http");
const net = require("node:net");

const FAKE_HOST = "supabase.test";
// Keep in step with tests/e2e/stub-backend.ts and tests/fixtures/household.ts.
const OWNER = "00000000-0000-4000-8000-00000000e001";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_ID = "00000000-0000-4000-8000-00000000c001";
const TERRACE = "00000000-0000-4000-8000-000000000120";

// What Kakak's route reads about the household (tests/e2e/kakak.spec.ts).
const HOUSEHOLD = {
  staff_profiles: [{ id: STAFF_ID, name: "Ari", created_at: "2026-10-01T00:00:00Z", user_id: null, archived_at: null }],
  task_entities: [],
  household_locations: [{ id: TERRACE, name: "Teras", created_at: "2026-10-01T00:00:00Z" }],
  inventory_items: [],
  master_schedules: [],
};

function claimsOf(req) {
  const token = (req.headers.authorization || "").split(" ")[1] || "";
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function install() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${FAKE_HOST}`);
    const claims = claimsOf(req);
    const live = claims && typeof claims.exp === "number" && claims.exp * 1000 > Date.now();

    if (url.pathname === "/auth/v1/user") {
      if (!live || !claims.sub) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      return send(res, 200, {
        id: claims.sub,
        aud: "authenticated",
        role: "authenticated",
        is_anonymous: !!claims.is_anonymous,
        ...(claims.is_anonymous ? {} : { email: "owner@example.test" }),
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-10-01T00:00:00Z",
      });
    }

    if (url.pathname === "/rest/v1/household_members") {
      const member = live && !claims.is_anonymous && claims.sub === OWNER;
      const rows = member ? [{ household_id: HOUSEHOLD_ID }] : [];
      if ((req.headers.accept || "").includes("vnd.pgrst.object")) {
        return rows.length
          ? send(res, 200, rows[0])
          : send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      }
      return send(res, 200, rows);
    }

    const owner = live && !claims.is_anonymous && claims.sub === OWNER;
    if (url.pathname === "/rest/v1/rpc/kakak_status") {
      if (!owner) return send(res, 403, { code: "42501", message: "not_admin" });
      return send(res, 200, [
        { allowed: true, enabled: true, enabled_by: OWNER, enabled_at: "2026-11-08T03:00:00Z", daily_limit: 40, calls_left: 40 },
      ]);
    }
    // Photos (Phase 160). /api/photo downloads the original and resizes it
    // itself; a request for Supabase's resizer would be a regression.
    if (url.pathname.startsWith("/storage/v1/render/")) return send(res, 500, { message: "render not allowed" });
    const photo = /^\/storage\/v1\/object\/(?:authenticated\/)?household-logs\/(.+)$/.exec(url.pathname);
    if (photo) {
      if (!owner || !decodeURIComponent(photo[1]).startsWith(`${HOUSEHOLD_ID}/`)) {
        return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      }
      // Loaded only here: the stub stays free of native modules otherwise.
      const sharp = require("sharp");
      sharp({ create: { width: 1080, height: 810, channels: 3, background: { r: 30, g: 140, b: 90 } } })
        .jpeg()
        .toBuffer()
        .then((jpeg) => {
          res.writeHead(200, { "content-type": "image/jpeg", "content-length": String(jpeg.length) });
          res.end(jpeg);
        });
      return;
    }
    if (url.pathname === "/rest/v1/rpc/my_locale") return send(res, 200, owner ? "id" : null);
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    if (owner && Object.prototype.hasOwnProperty.call(HOUSEHOLD, table)) return send(res, 200, HOUSEHOLD[table]);

    return send(res, 404, {});
  });
  server.listen(0, "127.0.0.1");
  // Never keeps the process alive on its own.
  server.unref();

  function redirect(args) {
    const port = server.address() && server.address().port;
    if (!port) return args;
    const [first, ...rest] = args;
    if (first && typeof first === "object" && first.host === FAKE_HOST) {
      return [{ ...first, host: "127.0.0.1", port, servername: undefined }, ...rest];
    }
    if (typeof first === "number" && rest[0] === FAKE_HOST) {
      return [port, "127.0.0.1", ...rest.slice(1)];
    }
    return args;
  }

  const originalConnect = net.connect;
  const originalCreateConnection = net.createConnection;
  net.connect = function connect(...args) {
    return originalConnect.apply(this, redirect(args));
  };
  net.createConnection = function createConnection(...args) {
    return originalCreateConnection.apply(this, redirect(args));
  };
}

if (process.env.E2E_SERVER_STUB === "1") install();
