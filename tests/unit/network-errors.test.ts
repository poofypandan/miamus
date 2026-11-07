import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { isConnectionError } from "@/lib/network-errors";

// Phase 146: "no answer from the server" and "the server said no" lead to
// opposite advice on screen, so the line between them is tested directly.
describe("isConnectionError", () => {
  it.each([
    ["Chrome's fetch failure", new TypeError("Failed to fetch")],
    ["Safari's fetch failure", new TypeError("Load failed")],
    ["Firefox's fetch failure", new TypeError("NetworkError when attempting to fetch resource.")],
    ["PostgREST's shape for a failed fetch", { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" }],
    ["auth-js, token endpoint unreachable", new AuthRetryableFetchError("Failed to fetch", 0)],
    ["a timed-out request", Object.assign(new Error("signal timed out"), { name: "TimeoutError" })],
  ])("%s → offline", (_label, err) => {
    expect(isConnectionError(err)).toBe(true);
  });

  it.each([
    ["a used or expired invite", { message: "invalid_or_expired_invite", code: "22023", details: null, hint: null }],
    ["a permission refusal", { message: "permission denied for table staff_profiles", code: "42501" }],
    ["auth-js refusing a refresh token", new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found")],
    ["a programming error", new TypeError("Cannot read properties of undefined (reading 'id')")],
    ["nothing at all", null],
  ])("%s → not offline", (_label, err) => {
    expect(isConnectionError(err)).toBe(false);
  });
});
