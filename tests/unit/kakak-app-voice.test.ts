import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_WAIT_MS,
  MAX_SPEAK_CHARS,
  decide,
  fetchKakakAudio,
  silentWav,
  spokenText,
} from "@/lib/kakak/app-voice";
import {
  DEFAULT_DAILY_CHARS,
  DEFAULT_VOICE_MODEL,
  ELEVENLABS_API,
  FORGET_DELAYS_MS,
  MAX_DAILY_CHARS,
  appVoiceConfig,
  dailyCharsFrom,
  forget,
  handleSpeak,
  handleVoiceCheck,
  type SpeakDeps,
  type SpendResult,
} from "@/lib/kakak/app-voice-server";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const ENV = { ELEVENLABS_API_KEY: "test-key", KAKAK_VOICE_ID: "LylyVoiceId123" };

// ---- The phone: what is sent, and when the phone's voice takes over ---------

describe("spokenText", () => {
  it("sends the words the phone's voice would read: times in words, never a card's rows", () => {
    expect(spokenText("Beres. Syam diingatkan jam 21.30 → cek di HP.", "id")).toBe(
      "Beres. Syam diingatkan jam setengah sepuluh malam, lalu cek di ha-pe."
    );
    expect(spokenText("Done. The reminder is at 21:30.", "en")).toBe("Done. The reminder is at nine thirty in the evening.");
  });

  it("keeps a short opener and two sentences, like the phone's voice", () => {
    expect(spokenText("Okay. One. Two. Three.", "en")).toBe("Okay. One. Two.");
  });

  it("caps a long reply at a sentence or word that fits", () => {
    const long = `${"word ".repeat(200).trim()}.`;
    const said = spokenText(long, "en");
    expect(said.length).toBeLessThanOrEqual(MAX_SPEAK_CHARS);
    expect(said.endsWith(" ")).toBe(false);
    const sentences = `${"A fairly long sentence about the dogs and their dinner. ".repeat(8)}`;
    const cut = spokenText(sentences.replace(/\. /g, ", ").replace(/, $/, "."), "en");
    expect(cut.length).toBeLessThanOrEqual(MAX_SPEAK_CHARS);
  });

  it("is empty for an empty reply", () => {
    expect(spokenText("", "en")).toBe("");
  });
});

describe("decide", () => {
  it("plays audio, and otherwise uses the phone's voice", () => {
    expect(decide(200)).toBe("play");
    expect(decide("timeout")).toBe("phone");
    expect(decide("offline")).toBe("phone");
    expect(decide("error")).toBe("phone");
    expect(decide(502)).toBe("phone");
    expect(decide(500)).toBe("phone");
    expect(decide(400)).toBe("phone");
  });

  it("stops asking for the visit when the voice is off, the budget used or the caller not allowed", () => {
    for (const status of [401, 403, 429, 503]) expect(decide(status)).toBe("phone_today");
  });
});

function audioResponse(bytes = 32) {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "audio/mpeg" } });
}

describe("fetchKakakAudio", () => {
  const base = { householdId: HOUSEHOLD, text: "Hello.", locale: "en" as const, online: () => true };

  it("returns the audio, sending the household, the words and the language", async () => {
    const fetchFn = vi.fn(async () => audioResponse());
    const result = await fetchKakakAudio({ ...base, signal: new AbortController().signal, fetch: fetchFn });
    expect(result.kind).toBe("audio");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/kakak/speak");
    expect(JSON.parse(init.body as string)).toEqual({ householdId: HOUSEHOLD, text: "Hello.", locale: "en" });
  });

  it("uses the phone's voice offline, without asking", async () => {
    const fetchFn = vi.fn();
    const result = await fetchKakakAudio({ ...base, online: () => false, signal: new AbortController().signal, fetch: fetchFn });
    expect(result).toEqual({ kind: "phone" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("uses the phone's voice for the visit on a refusal or the budget", async () => {
    for (const status of [401, 403, 429, 503]) {
      const fetchFn = vi.fn(async () => Response.json({ kind: "budget" }, { status }));
      expect(await fetchKakakAudio({ ...base, signal: new AbortController().signal, fetch: fetchFn })).toEqual({
        kind: "phone_today",
      });
    }
  });

  it("uses the phone's voice on a failure, a network error or a body that isn't audio", async () => {
    const failed = vi.fn(async () => Response.json({ kind: "failed" }, { status: 502 }));
    expect(await fetchKakakAudio({ ...base, signal: new AbortController().signal, fetch: failed })).toEqual({ kind: "phone" });
    const thrown = vi.fn(async () => {
      throw new TypeError("network");
    });
    expect(await fetchKakakAudio({ ...base, signal: new AbortController().signal, fetch: thrown })).toEqual({ kind: "phone" });
    const notAudio = vi.fn(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect(await fetchKakakAudio({ ...base, signal: new AbortController().signal, fetch: notAudio })).toEqual({ kind: "phone" });
    const empty = vi.fn(async () => audioResponse(0));
    expect(await fetchKakakAudio({ ...base, signal: new AbortController().signal, fetch: empty })).toEqual({ kind: "phone" });
  });

  it("gives up after AUDIO_WAIT_MS and uses the phone's voice", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const fetchFn = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new DOMException("aborted", "AbortError"));
            });
          })
      );
      const pending = fetchKakakAudio({ ...base, signal: new AbortController().signal, fetch: fetchFn as unknown as typeof fetch });
      await vi.advanceTimersByTimeAsync(AUDIO_WAIT_MS - 1);
      expect(aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({ kind: "phone" });
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops asking when the reply is no longer wanted", async () => {
    const wanted = new AbortController();
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        })
    );
    const pending = fetchKakakAudio({ ...base, signal: wanted.signal, fetch: fetchFn as unknown as typeof fetch });
    wanted.abort();
    expect(await pending).toEqual({ kind: "phone" });
  });
});

describe("silentWav", () => {
  it("is a short WAV data URL", () => {
    const url = silentWav();
    expect(url.startsWith("data:audio/wav;base64,")).toBe(true);
    const bytes = Buffer.from(url.split(",")[1], "base64");
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
    expect(bytes.length).toBe(844);
  });
});

// ---- The server: settings, budget, who may call it ------------------------------

describe("appVoiceConfig", () => {
  it("is off without the key or the voice", () => {
    expect(appVoiceConfig({})).toBeNull();
    expect(appVoiceConfig({ ELEVENLABS_API_KEY: "k" })).toBeNull();
    expect(appVoiceConfig({ KAKAK_VOICE_ID: "v" })).toBeNull();
    expect(appVoiceConfig({ ELEVENLABS_API_KEY: " ", KAKAK_VOICE_ID: "v" })).toBeNull();
    expect(appVoiceConfig({ ELEVENLABS_API_KEY: "k", KAKAK_VOICE_ID: "not/a voice" })).toBeNull();
  });

  it("uses eleven_v4 and the default budget unless the env says otherwise", () => {
    expect(appVoiceConfig(ENV)).toEqual({ apiKey: "test-key", voiceId: "LylyVoiceId123", model: DEFAULT_VOICE_MODEL, dailyChars: DEFAULT_DAILY_CHARS });
    expect(DEFAULT_VOICE_MODEL).toBe("eleven_v4");
    expect(appVoiceConfig({ ...ENV, KAKAK_VOICE_MODEL: "eleven_flash_v2_5", KAKAK_VOICE_DAILY_CHARS: "5000" })).toMatchObject({
      model: "eleven_flash_v2_5",
      dailyChars: 5000,
    });
    expect(appVoiceConfig({ ...ENV, KAKAK_VOICE_MODEL: "bad model!" })?.model).toBe(DEFAULT_VOICE_MODEL);
  });
});

describe("dailyCharsFrom", () => {
  it("reads a whole number, clamped, with a safe default", () => {
    expect(dailyCharsFrom(undefined)).toBe(DEFAULT_DAILY_CHARS);
    expect(dailyCharsFrom("")).toBe(DEFAULT_DAILY_CHARS);
    expect(dailyCharsFrom("abc")).toBe(DEFAULT_DAILY_CHARS);
    expect(dailyCharsFrom("-5")).toBe(DEFAULT_DAILY_CHARS);
    expect(dailyCharsFrom("1.5")).toBe(DEFAULT_DAILY_CHARS);
    expect(dailyCharsFrom("0")).toBe(0);
    expect(dailyCharsFrom("8000")).toBe(8000);
    expect(dailyCharsFrom("99999999")).toBe(MAX_DAILY_CHARS);
  });
});

function speakRequest(body: unknown, init: RequestInit = {}) {
  return new Request("http://localhost/api/kakak/speak", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}

function deps(overrides: Partial<SpeakDeps> = {}): SpeakDeps & { later: ReturnType<typeof vi.fn> } {
  const later = vi.fn();
  return {
    env: ENV,
    userId: async () => "user-1",
    spend: vi.fn(async (): Promise<SpendResult> => ({ ok: true })),
    fetch: vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg", "history-item-id": "hist123" } })
    ) as unknown as typeof fetch,
    later,
    ...overrides,
  } as SpeakDeps & { later: ReturnType<typeof vi.fn> };
}

const GOOD = { householdId: HOUSEHOLD, text: "Beres. Syam diingatkan.", locale: "id" };

describe("handleSpeak", () => {
  it("is off without the key, before reading anything or asking anyone", async () => {
    const d = deps({ env: {} });
    const response = await handleSpeak(speakRequest(GOOD), d);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ kind: "off" });
    expect(d.spend).not.toHaveBeenCalled();
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("is off when the daily budget is set to 0", async () => {
    const d = deps({ env: { ...ENV, KAKAK_VOICE_DAILY_CHARS: "0" } });
    expect((await handleSpeak(speakRequest(GOOD), d)).status).toBe(503);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("refuses someone signed out", async () => {
    const d = deps({ userId: async () => null });
    const response = await handleSpeak(speakRequest(GOOD), d);
    expect(response.status).toBe(401);
    expect(d.spend).not.toHaveBeenCalled();
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("refuses a staff phone, a household without Kakak, or Kakak switched off", async () => {
    for (const reason of ["not_admin", "not_allowed", "off"] as const) {
      const d = deps({ spend: vi.fn(async (): Promise<SpendResult> => ({ ok: false, reason })) });
      const response = await handleSpeak(speakRequest(GOOD), d);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ kind: "refused" });
      expect(d.fetch).not.toHaveBeenCalled();
    }
  });

  it("answers budget, without calling ElevenLabs, once the day's characters are used", async () => {
    const d = deps({ spend: vi.fn(async (): Promise<SpendResult> => ({ ok: false, reason: "budget" })) });
    const response = await handleSpeak(speakRequest(GOOD), d);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ kind: "budget" });
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("stays off on a database without the budget function", async () => {
    const d = deps({ spend: vi.fn(async (): Promise<SpendResult> => ({ ok: false, reason: "unavailable" })) });
    expect((await handleSpeak(speakRequest(GOOD), d)).status).toBe(503);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("refuses a bad body: no household, a bad language, no words, too many words, not JSON, too big", async () => {
    const bad = [
      { ...GOOD, householdId: "nope" },
      { ...GOOD, locale: "fr" },
      { ...GOOD, text: "   " },
      { ...GOOD, text: 42 },
      { ...GOOD, text: "a".repeat(MAX_SPEAK_CHARS + 1) },
      "not json",
      "null",
    ];
    for (const body of bad) {
      const d = deps();
      const response = await handleSpeak(speakRequest(body), d);
      expect(response.status).toBe(400);
      expect(d.spend).not.toHaveBeenCalled();
    }
    const big = deps();
    expect((await handleSpeak(speakRequest({ ...GOOD, text: "a".repeat(5000) }), big)).status).toBe(413);
  });

  it("counts the reply's characters against the env's budget, then streams ElevenLabs' audio back", async () => {
    const d = deps({ env: { ...ENV, KAKAK_VOICE_DAILY_CHARS: "4000" } });
    const response = await handleSpeak(speakRequest({ ...GOOD, text: "  Beres.   Syam diingatkan. " }), d);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(d.spend).toHaveBeenCalledWith(HOUSEHOLD, "Beres. Syam diingatkan.".length, 4000);

    const [url, init] = (d.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ELEVENLABS_API}/v1/text-to-speech/LylyVoiceId123/stream?output_format=mp3_44100_64`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body as string)).toEqual({ text: "Beres. Syam diingatkan.", model_id: "eleven_v4", language_code: "id" });
  });

  it("asks ElevenLabs to delete the generation from its history after answering", async () => {
    const d = deps();
    await handleSpeak(speakRequest(GOOD), d);
    expect(d.later).toHaveBeenCalledTimes(1);
  });

  it("answers failed, logging only the status, when ElevenLabs refuses or doesn't answer", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const refused = deps({
        fetch: vi.fn(async () => Response.json({ detail: { message: "Beres. Syam diingatkan." } }, { status: 401 })) as unknown as typeof fetch,
      });
      const response = await handleSpeak(speakRequest(GOOD), refused);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ kind: "failed" });
      expect(refused.later).not.toHaveBeenCalled();
      const thrown = deps({
        fetch: vi.fn(async () => {
          throw new TypeError("fetch failed");
        }) as unknown as typeof fetch,
      });
      expect((await handleSpeak(speakRequest(GOOD), thrown)).status).toBe(502);
      for (const call of error.mock.calls) expect(JSON.stringify(call)).not.toContain("Syam");
    } finally {
      error.mockRestore();
    }
  });
});

describe("handleVoiceCheck", () => {
  it("says on only when the voice is set up and someone is signed in", async () => {
    const kind = async (env: Record<string, string>, user: string | null) =>
      (await (await handleVoiceCheck({ env, userId: async () => user })).json()).kind;
    expect(await kind({}, "u")).toBe("off");
    expect(await kind(ENV, null)).toBe("off");
    expect(await kind({ ...ENV, KAKAK_VOICE_DAILY_CHARS: "0" }, "u")).toBe("off");
    expect(await kind(ENV, "u")).toBe("on");
  });
});

describe("forget", () => {
  const noWait = async () => {};

  it("deletes the history item once it is there", async () => {
    const fetchFn = vi.fn(async () => Response.json({ status: "ok" }));
    await forget(fetchFn as unknown as typeof fetch, "k", "hist123", noWait);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ELEVENLABS_API}/v1/history/hist123`);
    expect(init.method).toBe("DELETE");
  });

  it("tries again when the item isn't in the history yet, then stops", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fetchFn = vi.fn(async () => new Response("", { status: 404 }));
      await forget(fetchFn as unknown as typeof fetch, "k", "hist123", noWait);
      expect(fetchFn).toHaveBeenCalledTimes(FORGET_DELAYS_MS.length);
    } finally {
      error.mockRestore();
    }
  });
});

// ---- The migration: numbers only, admin-guarded, no public execute -------------

describe("migrations/172", () => {
  // The statements, without the comments (which name what is NOT done).
  const sql = readFileSync("supabase/migrations/172_kakak_voice_budget.sql", "utf8").replace(/--.*$/gm, "");

  it("adds a number, never text", () => {
    expect(sql).toMatch(/add column if not exists voice_chars int not null default 0/);
    expect(sql).not.toMatch(/\btext\b\s*(not null|,|\))/i);
  });

  it("checks household admins (never get_user_household_ids) and revokes public execute", () => {
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/household_members m\s+where m\.user_id = v_uid and m\.household_id = p_household/);
    expect(sql).not.toMatch(/get_user_household_ids/);
    expect(sql).toMatch(/revoke all on function public\.kakak_voice_spend\(uuid, int, int\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.kakak_voice_spend\(uuid, int, int\) to authenticated;/);
  });
});
