"use client";

/**
 * The opt-in app lock's settings and its biometric half (Phase 93).
 *
 * Until now the dashboard demanded a PIN on every visit, which bought very
 * little: Google sign-in already decides who gets in, and the middleware
 * enforces it. What a lock is actually for is the phone sitting unlocked on a
 * table — a physical problem, on one device, which is why every setting here
 * is local to the device rather than a household-wide preference.
 *
 * HOW MUCH SECURITY THIS IS, PLAINLY: the biometric check runs entirely in
 * the browser and nothing on the server depends on its result — no token is
 * withheld, no query is blocked. Anyone who can run devtools against this
 * origin can skip it. It stops the person holding the phone, which is the
 * threat it is for. The data itself is held by RLS (Phase 88/90), and that is
 * untouched by any of this.
 */

const ENABLED_KEY = "miamus_app_lock_enabled";
const CREDENTIAL_KEY = "miamus_app_lock_credential";

/** How long the app may sit in the background before it locks again. */
export const RELOCK_AFTER_MS = 5 * 60 * 1000;

export function isAppLockEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setAppLockEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(ENABLED_KEY, "true");
    else {
      window.localStorage.removeItem(ENABLED_KEY);
      window.localStorage.removeItem(CREDENTIAL_KEY);
    }
  } catch {
    // Blocked storage: the toggle simply doesn't stick on this device.
  }
}

function readCredentialId(): string | null {
  try {
    return window.localStorage.getItem(CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

export function hasBiometricCredential(): boolean {
  return typeof window !== "undefined" && !!readCredentialId();
}

/** Whether this device has a fingerprint/face sensor the browser will use. */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// WebAuthn speaks ArrayBuffers; localStorage speaks strings.
function toBase64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ArrayBuffer rather than a view: WebAuthn's types accept both, but the DOM
// lib insists a view be backed by a plain ArrayBuffer (not a SharedArrayBuffer)
// and a bare buffer sidesteps the argument.
function fromBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "="
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

function randomChallenge(): ArrayBuffer {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes.buffer as ArrayBuffer;
}

/**
 * Enrols this device's fingerprint or face, so unlocking can use it.
 *
 * The challenge is random but unverified — there is no server in this loop,
 * and pretending otherwise by shipping a fake attestation check would be
 * theatre. What the credential buys is the platform's own prompt: the OS
 * verifies the user, and the browser only resolves if it succeeded.
 */
export async function registerBiometric(label: string): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false;
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: "Miamus", id: window.location.hostname },
        user: {
          // Local to this device, and never sent anywhere.
          id: randomChallenge(),
          name: label,
          displayName: label,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          // The sensor in this phone, not a roaming key on someone's keyring.
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "discouraged",
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return false;
    window.localStorage.setItem(CREDENTIAL_KEY, toBase64Url(credential.rawId));
    return true;
  } catch (err) {
    // Cancelled, unsupported, or refused. The PIN still guards the app.
    console.error("Biometric enrolment failed", err);
    return false;
  }
}

/**
 * Asks the platform to verify whoever is holding the phone.
 *
 * Resolves true only when the OS prompt succeeded. A cancelled prompt is a
 * false, not an error — the caller offers the PIN instead.
 */
export async function verifyBiometric(): Promise<boolean> {
  const credentialId = readCredentialId();
  if (!credentialId || !window.PublicKeyCredential) return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ id: fromBase64Url(credentialId), type: "public-key" }],
        userVerification: "required",
        // Shorter than the enrolment timeout on purpose: this fires on every
        // unlock, and a phone whose sensor never answers should fall through
        // to the pad in a few seconds rather than a minute. The "Use PIN
        // instead" button is on screen throughout either way.
        timeout: 20_000,
      },
    });
    return !!assertion;
  } catch (err) {
    console.error("Biometric check failed", err);
    return false;
  }
}
