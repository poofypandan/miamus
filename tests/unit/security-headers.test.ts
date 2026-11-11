import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, SECURITY_HEADERS } from "../../next.config";

// Pre-launch audit M8.
describe("security headers", () => {
  const header = (key: string) => SECURITY_HEADERS.find((h) => h.key === key)?.value;

  it("refuse framing by any other site, enforced", () => {
    expect(header("X-Frame-Options")).toBe("DENY");
    expect(header("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  it("stop MIME sniffing and keep paths out of other sites' referrers", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("keep the camera and microphone (Kakak's voice) for this site only", () => {
    const policy = header("Permissions-Policy") ?? "";
    expect(policy).toContain("camera=(self)");
    expect(policy).toContain("microphone=(self)");
    expect(policy).toContain("geolocation=()");
  });

  it("report, not enforce, the full policy, with no eval in production", () => {
    expect(header("Content-Security-Policy-Report-Only")).toBeTruthy();
    const production = contentSecurityPolicy(false);
    expect(production).toContain("default-src 'self'");
    expect(production).toContain("object-src 'none'");
    expect(production).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy(true)).toContain("unsafe-eval");
  });
});
