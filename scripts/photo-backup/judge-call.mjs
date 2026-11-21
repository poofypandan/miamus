// Whether one call to the photo-backup Edge Function counts as a backup
// answer, for trigger.mjs. Plain Node, no packages; unit-tested in
// tests/unit/photo-backup.test.ts.
//
// A call counts only when the HTTP status is a success AND the body is the
// function's own answer: ok is a boolean, remaining a number, summary an
// object. Anything else (a 503 boot failure answering {"code","message"},
// a gateway page, a timeout) is a problem, reported by its status and
// code only, never the body itself.

/**
 * @param {number} status HTTP status (0 when the call never got an answer)
 * @param {unknown} body the parsed JSON, or null
 * @returns {{ valid: boolean, summary: any, remaining: number, problem: string | null }}
 */
export function judgeCall(status, body) {
  const b = body && typeof body === "object" ? body : {};
  const valid =
    status >= 200 &&
    status < 300 &&
    typeof b.ok === "boolean" &&
    typeof b.remaining === "number" &&
    b.summary !== null &&
    typeof b.summary === "object";
  if (valid) return { valid, summary: b.summary, remaining: b.remaining, problem: null };

  const code = typeof b.code === "string" ? b.code : typeof b.error === "string" ? b.error : null;
  const reason = code ? code.slice(0, 200) : "no backup answer";
  return {
    valid: false,
    summary: null,
    remaining: 0,
    problem: status ? `HTTP ${status}: ${reason}` : `the call failed: ${reason}`,
  };
}
