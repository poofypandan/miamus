// ============================================================================
// Generates a VAPID key pair for Web Push and prints the SQL that stores it
// in Supabase Vault (Phase 119).
//
//   node scripts/generate-vapid-keys.mjs [subject]
//
// subject: who the push services (Google, Apple, Mozilla) should contact
// about this sender — "mailto:you@example.com" or an https URL. Defaults to
// the Supabase project URL, which is valid but reaches nobody; Apple rejects
// a missing or malformed subject, so do not leave it blank.
//
// No dependencies: a VAPID key is an ordinary P-256 key pair, encoded the way
// the web-push library and PushManager.subscribe() expect —
//   public  = base64url(0x04 || x || y)   65 bytes, uncompressed point
//   private = base64url(d)                32 bytes
//
// Run the printed SQL in the Supabase SQL editor. Nothing is written to disk
// and nothing should be committed: the private key belongs in Vault only.
//
// ROTATING. Re-running and storing a new pair invalidates every existing
// subscription (each was created against the old public key). Devices
// re-subscribe the next time the owner opens the dashboard (see
// usePushResync), so rotate only when the old private key may have leaked.
// ============================================================================
import { generateKeyPairSync } from "node:crypto";

const subject = process.argv[2] ?? "https://ozsegmpxluxirkasaqzz.supabase.co";
if (!/^(mailto:|https:\/\/)/.test(subject)) {
  console.error('The subject must start with "mailto:" or "https://".');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const fromB64url = (s) => Buffer.from(s, "base64url");

const publicKeyB64 = b64url(Buffer.concat([Buffer.from([4]), fromB64url(pub.x), fromB64url(pub.y)]));
const privateKeyB64 = priv.d;

const sqlString = (s) => `'${s.replaceAll("'", "''")}'`;

console.log(`-- VAPID public key (also served to the app by get_push_public_key):
--   ${publicKeyB64}

-- Phase 119: Web Push keys and the dispatch secret, into Vault.
-- Safe to re-run: the key pair and subject are replaced, the dispatch secret
-- is kept if it already exists.
do $$
declare
  existing uuid;
  entry record;
begin
  for entry in
    select * from (values
      ('push_vapid_public_key',  ${sqlString(publicKeyB64)}, 'VAPID public key (Phase 119)'),
      ('push_vapid_private_key', ${sqlString(privateKeyB64)}, 'VAPID private key (Phase 119)'),
      ('push_vapid_subject',     ${sqlString(subject)}, 'VAPID contact: mailto: or https: (Phase 119)')
    ) as t(name, value, description)
  loop
    select id into existing from vault.secrets where name = entry.name;
    if existing is null then
      perform vault.create_secret(entry.value, entry.name, entry.description);
    else
      perform vault.update_secret(existing, entry.value, entry.name, entry.description);
    end if;
  end loop;

  if not exists (select 1 from vault.secrets where name = 'push_dispatch_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'push_dispatch_secret',
      'Authorises calls to the send-push Edge Function (migrations/103)'
    );
  end if;
end;
$$;`);
