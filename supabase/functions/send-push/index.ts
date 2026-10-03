/**
 * Sends a Web Push notification to a household's devices (Phase 119).
 *
 * Called only by the database, through queue_push (migrations/103): the
 * sick-report trigger and the Access tab's "Send test". Deployed with
 * verify_jwt off, because the caller is Postgres, not a user; the
 * x-push-secret header is passed straight to push_dispatch_plan, which
 * compares it with the Vault secret and refuses otherwise. Without it this
 * endpoint can neither look up a device nor send anything.
 *
 * POST { household_id, target_role: "owner" | "staff" | "all", title, body,
 *        url?, tag?, user_id?, exclude_user_id? }
 *   → { sent, failed, removed }
 *
 * GET → a self-test of the web-push library in this runtime: it encrypts and
 *   signs a message for a throwaway subscription with throwaway keys, and
 *   sends nothing. No secret needed, because it touches no data.
 *
 * The VAPID keys come from Vault with the target list, not from function
 * secrets, so one SQL edit rotates them for the sender and the app at once.
 */
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

// The same allow-list as is_push_endpoint() in migrations/103, checked again
// here: this function makes outbound requests to whatever a row says, so it
// does not take the database's word for it alone.
const PUSH_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

// An emergency that reaches a phone switched off for the night is still worth
// showing in the morning; one that arrives two days late is noise.
const TTL_SECONDS = 12 * 60 * 60;

type Target = {
  id: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
};
type Plan = {
  vapid: { public_key: string | null; private_key: string | null; subject: string | null };
  targets: Target[];
};

function adminKey(): string {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    const key = JSON.parse(secretKeys).default;
    if (key) return key;
  }
  // Legacy service_role key — retired by Supabase at the end of 2026.
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

Deno.serve(async (req) => {
  if (req.method === "GET") return selfTest();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = req.headers.get("x-push-secret") ?? "";
  const input = await req.json().catch(() => null);

  const householdId = uuid(input?.household_id);
  const targetRole = input?.target_role;
  const title = text(input?.title, 120);
  const body = text(input?.body, 400);
  if (!householdId || !["owner", "staff", "all"].includes(targetRole) || !title || !body) {
    return json({ error: "household_id, target_role, title and body are required" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, adminKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("push_dispatch_plan", {
    p_secret: secret,
    p_household_id: householdId,
    p_target_role: targetRole,
    p_user_id: uuid(input?.user_id),
    p_exclude_user_id: uuid(input?.exclude_user_id),
  });
  if (error) return failure(error);

  const plan = data as Plan;
  const { public_key, private_key, subject } = plan.vapid ?? {};
  if (!public_key || !private_key || !subject) {
    console.error("send-push: VAPID keys are not in Vault");
    return json({ error: "Push is not configured" }, 503);
  }
  const targets = plan.targets.filter((t) => PUSH_ENDPOINT.test(t.subscription.endpoint));
  if (targets.length === 0) return json({ sent: 0, failed: 0, removed: 0 });

  webpush.setVapidDetails(subject, public_key, private_key);
  // What sw.js reads. `tag` collapses repeats — the same report re-sent
  // replaces its notification instead of stacking a second one.
  const payload = JSON.stringify({
    title,
    body,
    url: typeof input?.url === "string" && input.url.startsWith("/") ? input.url : "/",
    tag: text(input?.tag, 100),
  });

  const results = await Promise.allSettled(
    targets.map((t) =>
      webpush.sendNotification(t.subscription, payload, { TTL: TTL_SECONDS, urgency: "high" })
    )
  );

  // 404 / 410: the browser has dropped this subscription for good. Anything
  // else (a 5xx, a timeout) is the push service's bad moment, not the
  // device's, and the row is kept for next time.
  const gone: string[] = [];
  let sent = 0;
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      sent++;
      return;
    }
    const status = (result.reason as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) gone.push(targets[i].id);
    else console.error("send-push: delivery failed", status, String(result.reason));
  });

  let removed = 0;
  if (gone.length > 0) {
    const { data: count, error: forgetError } = await admin.rpc("push_forget_subscriptions", {
      p_secret: secret,
      p_ids: gone,
    });
    if (forgetError) console.error("send-push: could not forget dead subscriptions", forgetError);
    else removed = count as number;
  }

  const result = { sent, failed: targets.length - sent, removed };
  console.log("send-push", result);
  return json(result);
});

/**
 * Proves the library's crypto works in this runtime — the ECDH, HKDF and
 * AES-GCM behind payload encryption and the ES256 VAPID signature — without a
 * network call. web-push is a Node library; this is the check that Deno's
 * node: compatibility carries all of it.
 */
async function selfTest() {
  try {
    const vapid = webpush.generateVAPIDKeys();
    const device = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ]);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", device.publicKey));
    const b64url = (bytes: Uint8Array) =>
      btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const details = webpush.generateRequestDetails(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/self-test",
        keys: { p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) },
      },
      JSON.stringify({ title: "self-test", body: "self-test" }),
      { vapidDetails: { subject: "https://example.com", publicKey: vapid.publicKey, privateKey: vapid.privateKey } }
    );
    return json({
      ok: true,
      encryptedBytes: (details.body as Uint8Array).length,
      signed: String(details.headers.Authorization ?? "").startsWith("vapid t="),
    });
  } catch (err) {
    console.error("send-push self-test failed", err);
    return json({ ok: false, error: String(err) }, 500);
  }
}

function failure(error: { code?: string; message: string }) {
  if (error.code === "42501") return json({ error: "Forbidden" }, 403);
  console.error(error);
  return json({ error: error.message }, 500);
}
