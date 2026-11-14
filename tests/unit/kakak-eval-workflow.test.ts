// The Kakak test run on GitHub (.github/workflows/kakak-eval.yml) spends
// money with a key the owner stored, in a public repository. These hold the
// rules that keep that safe: started by hand and by nothing else, the key
// given to one step, what was typed checked and never run, a ceiling on the
// budget, and the pass mark decided by whole numbers.

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keyWasRefused, meetsBar, PASS_MARK_PERCENT } from "../kakak/report";

const root = join(__dirname, "..", "..");
const workflow = readFileSync(join(root, ".github", "workflows", "kakak-eval.yml"), "utf8");
const checks = readFileSync(join(root, ".github", "workflows", "checks.yml"), "utf8");

/** A file's lines without its comments and blank lines. */
const code = (text: string) => text.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#"));

/** The lines under one top-level key. */
function block(text: string, key: string): string[] {
  const lines = code(text);
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start === -1) throw new Error(`no ${key}: in the workflow`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\S/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

describe("the Kakak test run on GitHub", () => {
  it("is started by hand, and by nothing else", () => {
    const triggers = block(workflow, "on")
      .filter((line) => /^ {2}\S/.test(line))
      .map((line) => line.trim().replace(/:.*$/, ""));
    expect(triggers).toEqual(["workflow_dispatch"]);
    for (const line of code(workflow)) {
      expect(line).not.toMatch(
        /\b(pull_request|pull_request_target|push|schedule|workflow_run|workflow_call|repository_dispatch|issue_comment)\s*:/,
      );
    }
  });

  it("can read the repository and nothing more, one run at a time", () => {
    expect(block(workflow, "permissions")).toEqual(["  contents: read"]);
    expect(block(workflow, "concurrency")).toEqual(["  group: kakak-eval", "  cancel-in-progress: false"]);
    expect(code(workflow).join("\n")).toContain("persist-credentials: false");
  });

  it("gives the key to one step, and never pastes what was typed into a command", () => {
    const lines = code(workflow);
    const expressions = lines.filter((line) => line.includes("${{"));
    expect(expressions.map((line) => line.trim())).toEqual([
      "ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_EVAL_KEY }}",
      "CASES: ${{ inputs.cases }}",
      "BUDGET: ${{ inputs.budget }}",
    ]);
    // Every command the workflow runs, in order: none is built from the form.
    const commands = lines.filter((line) => /^\s+(- )?run:/.test(line)).map((line) => line.replace(/^\s+(- )?run:\s*/, ""));
    expect(commands).toEqual([
      "npm ci",
      "npx tsx tests/kakak/run-test-set.ts --check",
      "bash tests/kakak/run-from-github.sh",
    ]);
  });

  it("leaves the everyday checks without any secret", () => {
    expect(code(checks).join("\n")).not.toMatch(/secrets\./);
  });
});

describe("the script GitHub runs (tests/kakak/run-from-github.sh)", () => {
  const script = join(root, "tests", "kakak", "run-from-github.sh");
  const KEY = "sk-ant-test-0000-not-a-real-key";
  const RUNNER_OUTPUT = [
    "",
    "opus-medium: 3 cases (dev, chosen)…",
    "  K131 pass",
    "  K146 fail: expected put_away_ingredient",
    "  K147 MUST-NEVER: shows a note to self (reference)",
    "",
    "opus-medium: 1/3 passed, 1 must-never (K147), $0.04.",
    "  about_miamus: 1/1",
    "  pass mark (90% or more, no must-never): NOT met (1 of 3 passed, under 90%; must-never: K147)",
    "",
  ].join("\n");

  /** Plays the script with a stand-in for `npx` that records how it was called. */
  function play(env: Record<string, string>, runner: { exit?: number; output?: string } = {}) {
    const dir = mkdtempSync(join(tmpdir(), "kakak-eval-"));
    const calls = join(dir, "calls.txt");
    const output = join(dir, "runner-output.txt");
    const summary = join(dir, "summary.md");
    writeFileSync(output, runner.output ?? "");
    writeFileSync(
      join(dir, "npx"),
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$FAKE_CALLS"\ncat "$FAKE_OUTPUT"\nexit "${FAKE_EXIT:-0}"\n',
    );
    chmodSync(join(dir, "npx"), 0o755);
    const result = spawnSync("bash", [script], {
      encoding: "utf8",
      timeout: 20_000,
      // Only these: the script must not lean on anything else in the environment.
      env: {
        NODE_ENV: "test",
        PATH: `${dir}:/usr/bin:/bin`,
        HOME: dir,
        RUNNER_TEMP: dir,
        GITHUB_STEP_SUMMARY: summary,
        FAKE_CALLS: calls,
        FAKE_OUTPUT: output,
        FAKE_EXIT: String(runner.exit ?? 0),
        ...env,
      },
    });
    return {
      dir,
      status: result.status,
      out: `${result.stdout}${result.stderr}`,
      calls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [],
      summary: existsSync(summary) ? readFileSync(summary, "utf8") : "",
    };
  }

  it("runs the dev split on the setup production uses, inside the budget, and asks for the pass mark", () => {
    const run = play({ ANTHROPIC_API_KEY: KEY, CASES: "", BUDGET: "2.5" });
    expect(run.status).toBe(0);
    expect(run.calls).toEqual(["tsx tests/kakak/run-test-set.ts --model opus --effort medium --budget 2.5 --bar"]);
  });

  it("plays only the sentences asked for, and never the holdout", () => {
    const run = play({ ANTHROPIC_API_KEY: KEY, CASES: "K131,K146", BUDGET: "1" });
    expect(run.calls).toEqual([
      "tsx tests/kakak/run-test-set.ts --model opus --effort medium --budget 1 --bar --cases K131,K146",
    ]);
    expect(run.calls.join(" ")).not.toMatch(/--split|--all-variants|holdout/);
  });

  it("passes on the runner's verdict, and puts the result and the misses on the run's front page", () => {
    const run = play({ ANTHROPIC_API_KEY: KEY, CASES: "K131,K146,K147", BUDGET: "2.5" }, { exit: 2, output: RUNNER_OUTPUT });
    expect(run.status).toBe(2);
    expect(run.summary).toContain("opus-medium: 1/3 passed, 1 must-never (K147), $0.04.");
    expect(run.summary).toContain("pass mark (90% or more, no must-never): NOT met");
    expect(run.summary).toContain("### Sentences that did not pass");
    expect(run.summary).toContain("  K146 fail: expected put_away_ingredient");
    expect(run.summary).toContain("  K147 MUST-NEVER: shows a note to self (reference)");
    expect(run.summary).not.toContain("K131 pass");
  });

  it("spends nothing without a key, or with something that is not an Anthropic key", () => {
    for (const key of ["", "not-a-key"]) {
      const run = play({ ANTHROPIC_API_KEY: key, CASES: "", BUDGET: "2.5" });
      expect(run.status, key).toBe(1);
      expect(run.calls, key).toEqual([]);
      expect(run.out, key).toContain("Nothing was run and nothing was spent.");
      expect(run.summary, key).toContain("Nothing was run and nothing was spent.");
    }
    expect(play({ ANTHROPIC_API_KEY: "", CASES: "", BUDGET: "2.5" }).out).toContain("ANTHROPIC_EVAL_KEY is not set");
  });

  it("refuses anything typed that is not a list of sentences, and runs none of it", () => {
    const dir = mkdtempSync(join(tmpdir(), "kakak-eval-marker-"));
    const marker = join(dir, "ran");
    for (const cases of ["K1", "K131, K146", "K131;K146", `K131;touch ${marker}`, `$(touch ${marker})`, "--split holdout", "all"]) {
      const run = play({ ANTHROPIC_API_KEY: KEY, CASES: cases, BUDGET: "2.5" });
      expect(run.status, cases).toBe(1);
      expect(run.calls, cases).toEqual([]);
    }
    expect(existsSync(marker)).toBe(false);
  });

  it("holds the budget above 0 and at most US$5", () => {
    for (const budget of ["0", "0.00", "5.01", "6", "20", "-1", "abc", "1e3", "2.5 --all-variants", "2.5;echo"]) {
      const run = play({ ANTHROPIC_API_KEY: KEY, CASES: "", BUDGET: budget });
      expect(run.status, budget).toBe(1);
      expect(run.calls, budget).toEqual([]);
    }
    for (const budget of ["0.5", "5", "5.00"]) {
      const run = play({ ANTHROPIC_API_KEY: KEY, CASES: "", BUDGET: budget });
      expect(run.status, budget).toBe(0);
      expect(run.calls.join(" "), budget).toContain(`--budget ${budget} --bar`);
    }
  });

  it("never prints the key", () => {
    for (const run of [
      play({ ANTHROPIC_API_KEY: KEY, CASES: "", BUDGET: "2.5" }, { output: RUNNER_OUTPUT }),
      play({ ANTHROPIC_API_KEY: KEY, CASES: "nope", BUDGET: "2.5" }),
      play({ ANTHROPIC_API_KEY: KEY, CASES: "", BUDGET: "99" }),
    ]) {
      expect(run.out).not.toContain(KEY);
      expect(run.summary).not.toContain(KEY);
      expect(run.calls.join(" ")).not.toContain(KEY);
    }
  });
});

describe("the pass mark", () => {
  const run = (cases: number, passed: number, mustNeverCases: string[] = []) => ({ cases, passed, mustNeverCases });

  it("is 90% or more of the sentences, counted in whole numbers", () => {
    expect(PASS_MARK_PERCENT).toBe(90);
    expect(meetsBar(run(110, 99), 110)).toEqual({ met: true, reasons: [] });
    expect(meetsBar(run(109, 106), 109).met).toBe(true);
    expect(meetsBar(run(110, 98), 110)).toEqual({ met: false, reasons: ["98 of 110 passed, under 90%"] });
    expect(meetsBar(run(2, 1), 2).met).toBe(false);
  });

  it("is missed by one must-never, whatever else passed", () => {
    expect(meetsBar(run(109, 109, ["K021"]), 109)).toEqual({ met: false, reasons: ["must-never: K021"] });
  });

  it("is missed by a run that did not play every sentence", () => {
    expect(meetsBar(run(60, 60), 109, true)).toEqual({
      met: false,
      reasons: ["only 60 of 109 sentences were played (the budget was reached)"],
    });
    expect(meetsBar(run(108, 108), 109).met).toBe(false);
    expect(meetsBar(run(0, 0), 0).met).toBe(false);
  });

  it("is missed by a run that stopped because the key was refused", () => {
    // Wrong, deleted or expired (401), or not allowed (403): the run stops there.
    expect([401, 403].map(keyWasRefused)).toEqual([true, true]);
    // The settings refused (400), busy (429, 529) or no error: the run goes on.
    expect([400, 429, 500, 529, undefined].map(keyWasRefused)).toEqual([false, false, false, false, false]);
    expect(meetsBar(run(4, 0), 109).reasons).toEqual([
      "only 4 of 109 sentences were played",
      "0 of 4 passed, under 90%",
    ]);
  });
});
