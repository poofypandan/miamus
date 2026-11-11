import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FINISH_GRACE_MS,
  SPEAK_KEY,
  findRecognition,
  initialVoiceState,
  joinResults,
  kakakWords,
  listenOnce,
  pickVoice,
  voiceScore,
  problemFor,
  readSpeakChoice,
  speakable,
  voiceReducer,
  writeSpeakChoice,
  type RecognitionLike,
  type RecognitionResultEventLike,
  type VoiceEvent,
  type VoiceState,
} from "@/lib/kakak/voice";

// Talk to Kakak (voice beta): the state machine and the recognizer wrapper,
// with a fake SpeechRecognition standing in for the browser's.

class FakeRecognition implements RecognitionLike {
  static last: FakeRecognition | null = null;
  static throwOnStart = false;
  lang = "";
  continuous = true;
  interimResults = false;
  maxAlternatives = 5;
  onresult: RecognitionLike["onresult"] = null;
  onerror: RecognitionLike["onerror"] = null;
  onend: RecognitionLike["onend"] = null;
  started = 0;
  stopped = 0;
  aborted = 0;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    if (FakeRecognition.throwOnStart) throw new Error("not allowed");
    this.started++;
  }
  stop() {
    this.stopped++;
  }
  abort() {
    this.aborted++;
  }
  // What the browser does:
  hear(...segments: [string, boolean][]) {
    const results = segments.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }));
    this.onresult?.({ resultIndex: 0, results } as RecognitionResultEventLike);
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
  end() {
    this.onend?.();
  }
}

function handlers() {
  return { onHeard: vi.fn(), onFinished: vi.fn(), onProblem: vi.fn() };
}

afterEach(() => {
  FakeRecognition.last = null;
  FakeRecognition.throwOnStart = false;
  vi.useRealTimers();
});

function run(events: VoiceEvent[], from: VoiceState = initialVoiceState(true)) {
  return events.reduce(voiceReducer, from);
}

describe("voiceReducer", () => {
  it("listens, shows what is heard, and goes idle when the owner is done", () => {
    let s = run([{ type: "listen" }]);
    expect(s).toMatchObject({ phase: "listening", transcript: "", problem: null });
    s = run([{ type: "heard", transcript: "Beli telur" }], s);
    expect(s.transcript).toBe("Beli telur");
    s = run([{ type: "done" }], s);
    expect(s.phase).toBe("idle");
  });

  it("goes thinking while Kakak answers, then speaking while her reply is read", () => {
    let s = run([{ type: "listen" }, { type: "done" }, { type: "thinking", on: true }]);
    expect(s.phase).toBe("thinking");
    s = run([{ type: "thinking", on: false }, { type: "speaking", on: true }], s);
    expect(s.phase).toBe("speaking");
    s = run([{ type: "speaking", on: false }], s);
    expect(s.phase).toBe("idle");
  });

  it("never lets reading aloud interrupt listening", () => {
    const s = run([{ type: "listen" }, { type: "speaking", on: true }]);
    expect(s.phase).toBe("listening");
  });

  it("drops a stale 'thinking off' or 'speaking off' that isn't the current phase", () => {
    const s = run([{ type: "listen" }, { type: "thinking", on: false }, { type: "speaking", on: false }]);
    expect(s.phase).toBe("listening");
  });

  it("ignores words that arrive after listening stopped", () => {
    const s = run([{ type: "listen" }, { type: "stop" }, { type: "heard", transcript: "late" }]);
    expect(s).toMatchObject({ phase: "idle", transcript: "" });
  });

  it("shows a problem and clears it on the next try", () => {
    let s = run([{ type: "listen" }, { type: "problem", problem: "quiet" }]);
    expect(s).toMatchObject({ phase: "idle", problem: "quiet", canListen: true });
    s = run([{ type: "listen" }], s);
    expect(s.problem).toBeNull();
  });

  it("stops offering the mic for good once the browser can't listen here", () => {
    const s = run([{ type: "listen" }, { type: "problem", problem: "unavailable" }]);
    expect(s).toMatchObject({ phase: "idle", canListen: false });
    expect(run([{ type: "listen" }], s).phase).toBe("idle");
  });

  it("starts with the tip when the browser has no recognizer", () => {
    const s = run([{ type: "problem", problem: "unavailable" }], initialVoiceState(true));
    expect(s.canListen).toBe(false);
    expect(s.phase).toBe("idle");
  });
});

describe("problemFor", () => {
  it("maps the browser's error codes", () => {
    expect(problemFor("aborted")).toBeNull();
    expect(problemFor("no-speech")).toBe("quiet");
    expect(problemFor("not-allowed")).toBe("blocked");
    expect(problemFor("service-not-allowed")).toBe("unavailable");
    expect(problemFor("language-not-supported")).toBe("unavailable");
    expect(problemFor("audio-capture")).toBe("no_mic");
    expect(problemFor("network")).toBe("offline");
    expect(problemFor("bad-grammar")).toBe("failed");
  });
});

describe("listenOnce", () => {
  it("sets the owner's language and asks for live words, one utterance at a time", () => {
    listenOnce(FakeRecognition, "id-ID", handlers());
    const r = FakeRecognition.last!;
    expect(r).toMatchObject({ lang: "id-ID", continuous: false, interimResults: true, maxAlternatives: 1, started: 1 });
  });

  it("reports words as they form and sends them when the browser ends", () => {
    const h = handlers();
    listenOnce(FakeRecognition, "en-US", h);
    const r = FakeRecognition.last!;
    r.hear(["Buy eggs", false]);
    r.hear(["Buy eggs and", true], [" sugar", false]);
    expect(h.onHeard).toHaveBeenLastCalledWith("Buy eggs and sugar");
    r.end();
    expect(h.onFinished).toHaveBeenCalledWith("Buy eggs and sugar");
    expect(h.onProblem).not.toHaveBeenCalled();
  });

  it("says 'didn't hear anything' when the browser ends with no words", () => {
    const h = handlers();
    listenOnce(FakeRecognition, "en-US", h);
    FakeRecognition.last!.fail("no-speech");
    FakeRecognition.last!.end();
    expect(h.onProblem).toHaveBeenCalledTimes(1);
    expect(h.onProblem).toHaveBeenCalledWith("quiet");
    expect(h.onFinished).not.toHaveBeenCalled();
  });

  it("still sends the words if silence follows them", () => {
    const h = handlers();
    listenOnce(FakeRecognition, "en-US", h);
    const r = FakeRecognition.last!;
    r.hear(["Feed Mochi at 7", true]);
    r.fail("no-speech");
    r.end();
    expect(h.onFinished).toHaveBeenCalledWith("Feed Mochi at 7");
    expect(h.onProblem).not.toHaveBeenCalled();
  });

  it("reports a refused microphone and sends nothing", () => {
    const h = handlers();
    listenOnce(FakeRecognition, "en-US", h);
    const r = FakeRecognition.last!;
    r.hear(["half", false]);
    r.fail("not-allowed");
    r.end();
    expect(h.onProblem).toHaveBeenCalledWith("blocked");
    expect(h.onFinished).not.toHaveBeenCalled();
  });

  it("treats a recognizer that won't start (Siri off, Home Screen app) as unavailable", () => {
    FakeRecognition.throwOnStart = true;
    const h = handlers();
    listenOnce(FakeRecognition, "id-ID", h);
    expect(h.onProblem).toHaveBeenCalledWith("unavailable");
  });

  it("cancel drops what was heard: aborted, nothing sent, no problem shown", () => {
    const h = handlers();
    const listening = listenOnce(FakeRecognition, "en-US", h);
    const r = FakeRecognition.last!;
    r.hear(["Beli", false]);
    listening.cancel();
    r.fail("aborted");
    r.end();
    expect(r.aborted).toBe(1);
    expect(h.onFinished).not.toHaveBeenCalled();
    expect(h.onProblem).not.toHaveBeenCalled();
  });

  it("Stop (finish) asks the browser to stop and sends what was heard on its end", () => {
    const h = handlers();
    const listening = listenOnce(FakeRecognition, "en-US", h);
    const r = FakeRecognition.last!;
    r.hear(["Sari mops the terrace", false]);
    listening.finish();
    expect(r.stopped).toBe(1);
    r.hear(["Sari mops the terrace", true]);
    r.end();
    expect(h.onFinished).toHaveBeenCalledTimes(1);
    expect(h.onFinished).toHaveBeenCalledWith("Sari mops the terrace");
  });

  it("Stop still sends if the browser never fires its end (Safari on iPhone)", () => {
    vi.useFakeTimers();
    const h = handlers();
    const listening = listenOnce(FakeRecognition, "id-ID", h);
    FakeRecognition.last!.hear(["Beli gula", false]);
    listening.finish();
    expect(h.onFinished).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FINISH_GRACE_MS);
    expect(h.onFinished).toHaveBeenCalledWith("Beli gula");
    FakeRecognition.last!.hear(["Beli gula pasir", true]); // late words aren't shown again
    FakeRecognition.last!.fail("network");
    FakeRecognition.last!.end(); // a late end changes nothing
    expect(h.onFinished).toHaveBeenCalledTimes(1);
    expect(h.onHeard).toHaveBeenCalledTimes(1);
    expect(h.onProblem).not.toHaveBeenCalled();
  });
});

describe("findRecognition", () => {
  it("finds the standard or the webkit-prefixed recognizer, or none", () => {
    expect(findRecognition({ SpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(findRecognition({ webkitSpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(findRecognition({})).toBeNull();
    expect(findRecognition(undefined)).toBeNull();
  });
});

describe("joinResults", () => {
  it("joins segments into one tidy line", () => {
    const results = [Object.assign([{ transcript: " Beli  telur" }], { isFinal: true }), Object.assign([{ transcript: "dan gula " }], { isFinal: false })];
    expect(joinResults(results)).toBe("Beli telur dan gula");
  });
});

describe("pickVoice", () => {
  const voices = [
    { name: "Samantha", lang: "en-US", localService: true, default: true },
    { name: "Google US English", lang: "en-US", localService: false },
    { name: "Google UK English Female", lang: "en-GB", localService: false },
    { name: "Damayanti", lang: "id-ID", localService: true },
    { name: "Bahasa Indonesia", lang: "id_ID", localService: true },
    { name: "Thomas", lang: "fr-FR", localService: true },
  ];

  it("prefers a natural voice in the exact language", () => {
    expect(pickVoice(voices, "en")?.name).toBe("Google US English");
    expect(pickVoice(voices, "id")?.name).toBe("Damayanti");
  });

  it("falls back to any voice in the language, then to the browser's choice", () => {
    expect(pickVoice([{ name: "Moira", lang: "en-IE", localService: true }], "en")?.name).toBe("Moira");
    expect(pickVoice([{ name: "Thomas", lang: "fr-FR", localService: true }], "id")).toBeNull();
    expect(pickVoice([], "en")).toBeNull();
  });
});

describe("pickVoice: Kakak reads in a woman's voice", () => {
  const v = (name: string, lang: string, extra: { default?: boolean } = {}) => ({ name, lang, localService: true, ...extra });

  it("never lets a woman's voice in another language win", () => {
    const voices = [v("Damayanti", "id-ID"), v("Samantha", "en-US"), v("Amélie", "fr-CA")];
    expect(pickVoice([v("Daniel", "en-GB"), v("Damayanti", "id-ID")], "en")?.name).toBe("Daniel");
    expect(pickVoice([v("Samantha", "en-US"), v("Google Bahasa Indonesia 3 (Natural)", "id-ID")], "id")?.name).toBe(
      "Google Bahasa Indonesia 3 (Natural)"
    );
    expect(pickVoice(voices, "id")?.name).toBe("Damayanti");
    expect(voiceScore(v("Samantha", "en-US"), "id")).toBe(-1);
    // "en" means English, not any tag that starts with the letters.
    expect(voiceScore(v("Someone", "eng"), "en")).toBe(-1);
  });

  it("prefers a known woman's voice over a man's or an unknown one, on every platform", () => {
    // iPhone and Mac (names as macOS lists them).
    expect(pickVoice([v("Daniel", "en-GB"), v("Fred", "en-US"), v("Samantha (English (US))", "en-US")], "en")?.name).toBe(
      "Samantha (English (US))"
    );
    // Desktop Chrome.
    expect(pickVoice([v("Google UK English Male", "en-GB"), v("Google UK English Female", "en-GB")], "en")?.name).toBe(
      "Google UK English Female"
    );
    // Android: the engine ids, and the numbered Natural voices.
    expect(
      pickVoice(
        [
          v("Android Speech Recognition and Synthesis from Google id-id-x-ide-network", "id-ID"),
          v("Android Speech Recognition and Synthesis from Google id-id-x-idc-network", "id-ID"),
        ],
        "id"
      )?.name
    ).toBe("Android Speech Recognition and Synthesis from Google id-id-x-idc-network");
    expect(pickVoice([v("Google Bahasa Indonesia 4 (Natural)", "id-ID"), v("Google Bahasa Indonesia 2 (Natural)", "id-ID")], "id")?.name).toBe(
      "Google Bahasa Indonesia 2 (Natural)"
    );
    // Windows and Edge.
    expect(pickVoice([v("Microsoft David - English (United States)", "en-US"), v("Microsoft Zira - English (United States)", "en-US")], "en")?.name).toBe(
      "Microsoft Zira - English (United States)"
    );
    expect(
      pickVoice(
        [
          v("Microsoft Ardi Online (Natural) - Indonesian (Indonesia)", "id-ID"),
          v("Microsoft Gadis Online (Natural) - Indonesian (Indonesia)", "id-ID"),
        ],
        "id"
      )?.name
    ).toBe("Microsoft Gadis Online (Natural) - Indonesian (Indonesia)");
    expect(pickVoice([v("Microsoft Guy Online (Natural) - English (United States)", "en-US"), v("Microsoft AvaMultilingual Online (Natural) - English (United States)", "en-US")], "en")?.name).toBe(
      "Microsoft AvaMultilingual Online (Natural) - English (United States)"
    );
  });

  it("takes a woman's voice in another accent over a man's in the exact one", () => {
    expect(pickVoice([v("Microsoft David - English (United States)", "en-US"), v("Karen", "en-AU")], "en")?.name).toBe("Karen");
  });

  it("keeps the exact accent, then a natural voice, among women's voices", () => {
    expect(pickVoice([v("Karen", "en-AU"), v("Samantha", "en-US")], "en")?.name).toBe("Samantha");
    expect(pickVoice([v("Samantha", "en-US", { default: true }), v("Google US English", "en-US")], "en")?.name).toBe("Google US English");
  });

  it("falls back gracefully when no voice is a woman's", () => {
    // An unknown voice (Android's plain language voice) beats a known man's.
    expect(pickVoice([v("Microsoft Ardi Online (Natural) - Indonesian (Indonesia)", "id-ID"), v("Bahasa Indonesia", "id_ID")], "id")?.name).toBe(
      "Bahasa Indonesia"
    );
    // Only men's voices: still the best of them, never null.
    expect(pickVoice([v("Daniel", "en-GB"), v("Google UK English Male", "en-GB")], "en")?.name).toBe("Google UK English Male");
  });

  it("never picks a novelty voice, and a robotic one only when nothing else speaks the language", () => {
    expect(pickVoice([v("Bubbles", "en-US"), v("Bad News", "en-US"), v("Superstar", "en-US")], "en")).toBeNull();
    expect(pickVoice([v("Flo (English (US))", "en-US"), v("Grandma (English (US))", "en-US"), v("Daniel", "en-GB")], "en")?.name).toBe("Daniel");
    expect(pickVoice([v("Bubbles", "en-US"), v("Shelley (English (US))", "en-US")], "en")?.name).toBe("Shelley (English (US))");
  });
});

describe("the speaker switch", () => {
  it("is off until turned on, and remembered on this phone", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readSpeakChoice(storage)).toBe(false);
    writeSpeakChoice(storage, true);
    expect(store.get(SPEAK_KEY)).toBe("on");
    expect(readSpeakChoice(storage)).toBe(true);
    writeSpeakChoice(storage, false);
    expect(readSpeakChoice(storage)).toBe(false);
  });

  it("survives storage that throws (private mode)", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readSpeakChoice(broken)).toBe(false);
    expect(() => writeSpeakChoice(broken, true)).not.toThrow();
    expect(readSpeakChoice(undefined)).toBe(false);
  });
});

describe("what Kakak reads aloud", () => {
  it("reads her question or message as written", () => {
    expect(kakakWords({ kind: "question", question: "Which day?" }, "en")).toBe("Which day?");
    expect(kakakWords({ kind: "message", text: "Kakak perlu internet." }, "id")).toBe("Kakak perlu internet.");
    expect(kakakWords({ kind: "typing" }, "en")).toBe("");
    expect(kakakWords({ kind: "waiting" }, "en")).toBe("");
  });

  it("reads the card's facts and asks if it's right", () => {
    const words = kakakWords(
      {
        kind: "card",
        text: "",
        items: [
          { kind: "shopping", entries: [{ type: "item", itemId: "i1", name: "Telur", status: "out" }] },
        ],
      },
      "id"
    );
    expect(words.startsWith("Ini yang akan Kakak tambahkan: Daftar belanja: Beli Telur.")).toBe(true);
    expect(words.endsWith("Sudah benar?")).toBe(true);
  });

  it("reads a pet routine's pet and times, not just 'Potty break'", () => {
    const words = speakable(kakakWords(
      {
        kind: "card",
        text: "Here's what I'll add:",
        items: [
          { kind: "pet_routine", routine: "potty", pets: [{ petId: "p1", petName: "Mochi", times: [{ time: "07:00", title: "Potty" }, { time: "17:00", title: "Potty" }], alreadyThere: ["12:00"] }], title: null, titleEn: null, days: null, until: null, staffId: null, staffName: null, note: null, proof: null, remindStaff: false, alertOwners: false },
        ],
      },
      "en"
    ));
    expect(words).toBe(
      "Here's what I'll add: Potty breaks, Mochi: 07:00 Potty break, 17:00 Potty break. 12:00 is already there. Is that right?"
    );
  });

  it("drops symbols a voice would read out", () => {
    expect(speakable("Kakak sudah banyak membantu hari ini — coba lagi besok")).toBe(
      "Kakak sudah banyak membantu hari ini, coba lagi besok"
    );
  });
});
