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
