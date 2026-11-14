// The Kakak test run on GitHub (.github/workflows/kakak-eval.yml and
// tests/kakak/run-from-github.sh) spends money with a key the owner stored,
// in a public repository. These hold the rules that keep that safe: started
// by hand and by nothing else, the least permissions, the key given to one
// step and one program, what was typed checked and never run, a ceiling on
// the budget, only the dev split, and nothing uploaded that holds the key.

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const workflow = readFileSync(join(root, ".github", "workflows", "kakak-eval.yml"), "utf8");
const checks = readFileSync(join(root, ".github", "workflows", "checks.yml"), "utf8");
const scriptPath = join(root, "tests", "kakak", "run-from-github.sh");
const script = readFileSync(scriptPath, "utf8");

/** A file's lines without its comment lines and blank lines. */
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
    const lines = code(workflow).map((line) => line.trim());
    // No job or step asks for more, and the checkout leaves no token behind.
    expect(lines.filter((line) => line.startsWith("permissions:"))).toHaveLength(1);
    expect(lines).toContain("persist-credentials: false");
  });

  it("keeps the key to one environment, one step and one value, and never pastes what was typed into a command", () => {
    const lines = code(workflow).map((line) => line.trim());
    // The job names the environment the owner stores the key in, and can protect.
    expect(lines).toContain("environment: kakak-eval");
    // Every expression in the file. The run's name is one of two fixed strings.
    expect(lines.filter((line) => line.includes("${{"))).toEqual([
      "run-name: ${{ inputs.cases == '' && 'Kakak test run, the whole dev split' || 'Kakak test run, chosen sentences only' }}",
      "ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_EVAL_KEY }}",
      "CASES: ${{ inputs.cases }}",
      "BUDGET: ${{ inputs.budget }}",
      "KAKAK_UPLOAD_DIR: ${{ runner.temp }}/kakak-upload",
      "path: ${{ runner.temp }}/kakak-upload/",
    ]);
    // Every command the workflow runs, in order: none is built from the form.
    const commands = code(workflow)
      .filter((line) => /^\s+(- )?run:/.test(line))
      .map((line) => line.replace(/^\s+(- )?run:\s*/, ""));
    expect(commands).toEqual([
      "npm ci --ignore-scripts",
      "npx tsx tests/kakak/run-test-set.ts --check",
      "bash tests/kakak/run-from-github.sh",
    ]);
  });

  it("pins every action to one exact commit", () => {
    const uses = code(workflow)
      .map((line) => line.trim().replace(/^- /, ""))
      .filter((line) => line.startsWith("uses:"));
    expect(uses).toHaveLength(3);
    for (const line of uses) expect(line).toMatch(/^uses: actions\/[a-z-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  });

  it("uploads only the folder the script fills after its search for the key", () => {
    const lines = code(workflow).map((line) => line.trim());
    expect(lines.filter((line) => line.startsWith("path:"))).toEqual(["path: ${{ runner.temp }}/kakak-upload/"]);
    expect(lines).not.toContain("path: tests/kakak/results/");
  });

  it("leaves the everyday checks without any secret", () => {
    expect(code(checks).join("\n")).not.toMatch(/secrets\./);
  });

  it("can only ever send the made-up household: real photos, voices and saved runs are not in the repository", () => {
    const ignored = readFileSync(join(root, ".gitignore"), "utf8").split("\n");
    expect(ignored).toContain("/tests/kakak/media/");
    expect(ignored).toContain("/tests/kakak/results/");
    // The script names one runner, the test set's, and never the photo or voice ones.
    expect(script).toContain("npx tsx tests/kakak/run-test-set.ts");
    expect(script).not.toMatch(/run-photos|run-voice|run-comparison/);
  });
});

describe("the script GitHub runs (tests/kakak/run-from-github.sh)", () => {
  const KEY = "sk-ant-test-0000-not-a-real-key";
  const RESULTS = join(root, "tests", "kakak", "results");
  const RUNNER_OUTPUT = [
    "",
    "opus-medium: 3 cases (dev, chosen)…",
    "  K131 pass",
    "  K146 fail: expected put_away_ingredient",
    "  K147 MUST-NEVER: shows a note to self (reference)",
    "",
    "opus-medium: 1/3 passed, 1 must-never (K147), $0.04.",
    "  about_miamus: 1/1",
    "RESULT (opus-medium): NOT PASSED (chosen sentences): 1 of 3 passed, under 90%; must-never: K147.",
    "",
    "Counted against the budget: $0.04 of $2.5, over 4 request(s) sent.",
    "",
  ].join("\n");

  const made: string[] = [];
  let counter = 0;
  /** A file name in the runner's results folder that only this test uses. */
  const resultName = () => {
    counter += 1;
    const name = `zz-unit-${process.pid}-${counter}.json`;
    made.push(join(RESULTS, name));
    return name;
  };
  afterEach(() => {
    for (const path of made.splice(0)) rmSync(path, { force: true });
  });

  /**
   * Plays the script with stand-ins on its PATH: `npx` records how it was
   * called and whether it was given the key, and can save a conversation;
   * `tee` records whether it was given the key, then does its job.
   */
  function play(
    env: Record<string, string>,
    runner: { exit?: number; output?: string; result?: { name: string; body: string } } = {},
  ) {
    const dir = mkdtempSync(join(tmpdir(), "kakak-eval-"));
    const calls = join(dir, "calls.txt");
    const output = join(dir, "runner-output.txt");
    const summary = join(dir, "summary.md");
    const upload = join(dir, "upload");
    writeFileSync(output, runner.output ?? "");
    writeFileSync(
      join(dir, "npx"),
      [
        "#!/bin/sh",
        'printf \'%s\\n\' "$*" >> "$FAKE_CALLS"',
        'if [ -n "${ANTHROPIC_API_KEY:-}" ]; then echo "runner: key given" >> "$FAKE_CALLS"; fi',
        'if [ -n "${FAKE_RESULT:-}" ]; then printf \'%s\' "$FAKE_RESULT_BODY" > "tests/kakak/results/$FAKE_RESULT"; fi',
        'cat "$FAKE_OUTPUT"',
        'exit "${FAKE_EXIT:-0}"',
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "tee"),
      [
        "#!/bin/sh",
        'if [ -n "${ANTHROPIC_API_KEY:-}" ]; then echo "tee: key given" >> "$FAKE_CALLS"; fi',
        'exec /usr/bin/tee "$@"',
        "",
      ].join("\n"),
    );
    chmodSync(join(dir, "npx"), 0o755);
    chmodSync(join(dir, "tee"), 0o755);
    const result = spawnSync("bash", [scriptPath], {
      encoding: "utf8",
      timeout: 20_000,
      // Only these: the script must not lean on anything else in the environment.
      env: {
        NODE_ENV: "test",
        PATH: `${dir}:/usr/bin:/bin`,
        HOME: dir,
        RUNNER_TEMP: dir,
        GITHUB_STEP_SUMMARY: summary,
        KAKAK_UPLOAD_DIR: upload,
        FAKE_CALLS: calls,
        FAKE_OUTPUT: output,
        FAKE_EXIT: String(runner.exit ?? 0),
        ...(runner.result ? { FAKE_RESULT: runner.result.name, FAKE_RESULT_BODY: runner.result.body } : {}),
        ...env,
      },
    });
    return {
      status: result.status,
      out: `${result.stdout}${result.stderr}`,
      calls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [],
      summary: existsSync(summary) ? readFileSync(summary, "utf8") : "",
      uploaded: existsSync(upload) ? readdirSync(upload) : [],
      upload,
    };
  }

  it("runs the dev split on the setup production uses, inside the budget, and asks for the verdict", () => {
    const run = play({ ANTHROPIC_API_KEY: KEY, CASES: "", BUDGET: "2.5" });
    expect(run.status).toBe(0);
    expect(run.calls).toEqual([
      "tsx tests/kakak/run-test-set.ts --split dev --model opus --effort medium --budget 2.5 --bar",
      "runner: key given",
    ]);
  });

  it("plays only the sentences asked for, still of the dev split, and never the holdout", () => {
    const run = play({ ANTHROPIC_API_KEY: KEY, CASES: "K131,K146", BUDGET: "1" });
    expect(run.calls[0]).toBe(
      "tsx tests/kakak/run-test-set.ts --split dev --model opus --effort medium --budget 1 --bar --cases K131,K146",
    );
    expect(run.calls.join(" ")).not.toMatch(/--split (holdout|all)|--all-variants/);
    expect(code(script).join("\n")).not.toMatch(/--split (holdout|all)|--all-variants/);
  });

  it("gives the key to the runner alone: not to the other programs it starts, and not to its own later steps", () => {
    const run = play({ ANTHROPIC_API_KEY: KEY, CASES: "", BUDGET: "2.5" }, { output: RUNNER_OUTPUT });
    expect(run.calls).toContain("runner: key given");
    expect(run.calls).not.toContain("tee: key given");
    // Read once, then taken out of the script's environment before anything else happens.
    const lines = code(script);
    const read = lines.indexOf('key="${ANTHROPIC_API_KEY:-}"');
    expect(read).toBeGreaterThan(-1);
    expect(lines[read + 1]).toBe("unset ANTHROPIC_API_KEY");
    expect(lines.filter((line) => line.includes("ANTHROPIC_API_KEY")).slice(2)).toEqual([
      'ANTHROPIC_API_KEY="$key" npx tsx tests/kakak/run-test-set.ts "${args[@]}" 2>&1 | tee "$log" || status=$?',
    ]);
  });

  it("passes on the runner's verdict, and puts it first on the run's front page, with the misses", () => {
    const run = play({ ANTHROPIC_API_KEY: KEY, CASES: "K131,K146,K147", BUDGET: "2.5" }, { exit: 2, output: RUNNER_OUTPUT });
    expect(run.status).toBe(2);
    const lines = run.summary.split("\n");
    expect(lines[0]).toBe("## Kakak test run: chosen sentences only (not a full evaluation)");
    expect(lines[2]).toBe(
      "**RESULT (opus-medium): NOT PASSED (chosen sentences): 1 of 3 passed, under 90%; must-never: K147.**",
    );
    expect(run.summary).toContain("opus-medium: 1/3 passed, 1 must-never (K147), $0.04.");
    expect(run.summary).toContain("Counted against the budget: $0.04 of $2.5, over 4 request(s) sent.");
    expect(run.summary).toContain("### Sentences that did not pass");
    expect(run.summary).toContain("  K146 fail: expected put_away_ingredient");
    expect(run.summary).toContain("  K147 MUST-NEVER: shows a note to self (reference)");
    expect(run.summary).not.toContain("K131 pass");
  });

  it("names a run of the whole dev split as that, and a run with no result as that", () => {
    const whole = play({ ANTHROPIC_API_KEY: KEY, CASES: "", BUDGET: "2.5" }, { output: RUNNER_OUTPUT });
    expect(whole.summary.split("\n")[0]).toBe("## Kakak test run: the whole dev split");
    const died = play(
      { ANTHROPIC_API_KEY: KEY, CASES: "K101", BUDGET: "2.5" },
      { exit: 1, output: "Held out, so not played: K101.\n" },
    );
    expect(died.status).toBe(1);
    expect(died.summary).toContain("**No result.** The run ended before one.");
    expect(died.summary).toContain("Held out, so not played: K101.");
    expect(died.summary).not.toContain("PASSED");
  });

  it("spends nothing without a key, or with something that is not an Anthropic key", () => {
    for (const key of ["", "not-a-key"]) {
      const run = play({ ANTHROPIC_API_KEY: key, CASES: "", BUDGET: "2.5" });
      expect(run.status, key).toBe(1);
      expect(run.calls, key).toEqual([]);
      expect(run.out, key).toContain("Nothing was run and nothing was spent.");
      expect(run.summary, key).toContain("**Nothing was run and nothing was spent.**");
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
      expect(run.calls[0], budget).toContain(`--budget ${budget} --bar`);
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

  it("keeps for upload only this run's conversations, and only after searching them for the key", () => {
    mkdirSync(RESULTS, { recursive: true });
    const earlier = resultName();
    writeFileSync(join(RESULTS, earlier), '{"from":"an earlier run"}');
    const fresh = resultName();
    const run = play(
      { ANTHROPIC_API_KEY: KEY, CASES: "", BUDGET: "2.5" },
      { output: RUNNER_OUTPUT, result: { name: fresh, body: '{"verdict":"saved by this run"}' } },
    );
    expect(run.status).toBe(0);
    expect(run.uploaded).toEqual([fresh]);
    expect(readFileSync(join(run.upload, fresh), "utf8")).toBe('{"verdict":"saved by this run"}');
  });

  it("keeps nothing, and says why, if the key is in a saved conversation", () => {
    const leaky = resultName();
    const run = play(
      { ANTHROPIC_API_KEY: KEY, CASES: "", BUDGET: "2.5" },
      { output: RUNNER_OUTPUT, result: { name: leaky, body: `{"error":"x-api-key ${KEY} refused"}` } },
    );
    expect(run.status).toBe(1);
    expect(run.uploaded).toEqual([]);
    expect(run.out).toContain("The key was found in the run's output. Nothing was kept for upload.");
    expect(run.summary).toContain("**The key was found in the run's output, so nothing was kept or uploaded.**");
    expect(run.summary).not.toContain("RESULT");
    expect(run.out).not.toContain(KEY);
    expect(run.summary).not.toContain(KEY);
  });

  it("keeps nothing if the key is in what the runner printed", () => {
    const clean = resultName();
    const run = play(
      { ANTHROPIC_API_KEY: KEY, CASES: "", BUDGET: "2.5" },
      { output: `${RUNNER_OUTPUT}debug: ${KEY}\n`, result: { name: clean, body: "{}" } },
    );
    expect(run.status).toBe(1);
    expect(run.uploaded).toEqual([]);
    // GitHub hides a secret in its log; the front page and the upload must not rely on that.
    expect(run.summary).not.toContain(KEY);
    expect(run.summary).toContain("nothing was kept or uploaded");
  });
});
