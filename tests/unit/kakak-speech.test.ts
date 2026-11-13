import { describe, expect, it } from "vitest";
import {
  MAX_SENTENCES,
  OPENER_PAUSE_MS,
  SENTENCE_PAUSE_MS,
  SPEECH_RATE,
  enTime,
  idTime,
  speechPlan,
  toSpeech,
} from "@/lib/kakak/speech";

// Kakak's replies rewritten for the ear (src/lib/kakak/speech.ts).

describe("toSpeech: Indonesian times, as people say them", () => {
  it.each([
    ["21.30", "jam setengah sepuluh malam"],
    ["09.00", "jam sembilan pagi"],
    ["15.00", "jam tiga sore"],
    ["12.00", "jam dua belas siang"],
    ["06.30", "jam setengah tujuh pagi"],
    ["10.59", "jam sebelas kurang satu pagi"],
    ["11.00", "jam sebelas siang"],
    ["14.30", "jam setengah tiga siang"],
    ["17.30", "jam setengah enam sore"],
    ["18.00", "jam enam malam"],
    ["07.15", "jam tujuh lewat seperempat pagi"],
    ["09.45", "jam sepuluh kurang seperempat pagi"],
    ["07.10", "jam tujuh lewat sepuluh pagi"],
    ["16.25", "jam empat lewat dua puluh lima sore"],
    ["23.30", "jam setengah dua belas malam"],
    ["00.00", "jam dua belas malam"],
    ["9:30", "jam setengah sepuluh pagi"],
  ])("%s → %s", (written, said) => {
    expect(toSpeech(written, "id")).toBe(said);
    expect(idTime(...(written.split(/[.:]/).map(Number) as [number, number]))).toBe(said);
  });

  it("doesn't say 'jam' twice, nor the part of the day or WIB already written", () => {
    expect(toSpeech("Syam diingatkan jam 21.30.", "id")).toBe("Syam diingatkan jam setengah sepuluh malam.");
    expect(toSpeech("pukul 07.00 pagi", "id")).toBe("jam tujuh pagi");
    expect(toSpeech("jam 21.30 WIB", "id")).toBe("jam setengah sepuluh malam");
  });

  it("reads a list and a range of times", () => {
    expect(toSpeech("setiap hari jam 07.00, 17.00", "id")).toBe("setiap hari jam tujuh pagi, jam lima sore");
    expect(toSpeech("07.00–09.00", "id")).toBe("jam tujuh pagi sampai jam sembilan pagi");
  });

  it("keeps the part of the day the reply named, on the right half of the day", () => {
    expect(toSpeech("Ingatkan Syam jam 7.30 malam.", "id")).toBe("Ingatkan Syam jam setengah delapan malam.");
    expect(toSpeech("jam 1.00 siang", "id")).toBe("jam satu siang");
    expect(toSpeech("jam 6.00 sore", "id")).toBe("jam enam sore");
    expect(toSpeech("jam 12.00 malam", "id")).toBe("jam dua belas malam");
    expect(toSpeech("jam 9.15 pagi", "id")).toBe("jam sembilan lewat seperempat pagi");
    expect(toSpeech("jam 9.30 malam", "id")).toBe(toSpeech("jam 21.30", "id"));
  });

  it("leaves prices, amounts and other numbers alone", () => {
    expect(toSpeech("Rp 12.50", "id")).toBe("Rp 12.50");
    expect(toSpeech("12.50 kg", "id")).toBe("12.50 kg");
    expect(toSpeech("Rp 25.000", "id")).toBe("Rp 25.000");
    expect(toSpeech("1.250.000", "id")).toBe("1.250.000");
    expect(toSpeech("2,5 kg", "id")).toBe("2,5 kg");
  });
});

describe("toSpeech: English times", () => {
  it.each([
    ["21:30", "nine thirty in the evening"],
    ["21.30", "nine thirty in the evening"],
    ["09:00", "nine in the morning"],
    ["7:05", "seven oh five in the morning"],
    ["14:45", "two forty-five in the afternoon"],
    ["12:00", "noon"],
    ["00:00", "midnight"],
    ["7:30 pm", "seven thirty in the evening"],
    ["11:15 AM", "eleven fifteen in the morning"],
  ])("%s → %s", (written, said) => {
    expect(toSpeech(written, "en")).toBe(said);
  });

  it("keeps 'at' and leaves decimals alone", () => {
    expect(toSpeech("Every day at 07:00, 17:00.", "en")).toBe(
      "Every day at seven in the morning, five in the afternoon."
    );
    expect(toSpeech("1.25 kg", "en")).toBe("1.25 kg");
  });

  it("reads a dotted number as a time only when something says it is one", () => {
    expect(toSpeech("There is 12.50 kg of rice.", "en")).toBe("There is 12.50 kg of rice.");
    expect(toSpeech("It costs 12.50 now.", "en")).toBe("It costs 12.50 now.");
    expect(toSpeech("$12.50", "en")).toBe("$12.50");
    expect(toSpeech("Remind Ari at 12.30.", "en")).toBe("Remind Ari at twelve thirty in the afternoon.");
    expect(toSpeech("07.00–09.00", "en")).toBe("seven in the morning until nine in the morning");
    expect(enTime(18, 0)).toBe("six in the evening");
  });
});

describe("toSpeech: symbols and words", () => {
  it("reads an arrow as a step", () => {
    expect(toSpeech("Buka Pengaturan → Staf.", "id")).toBe("Buka Pengaturan, lalu Staf.");
    expect(toSpeech("Open Settings → Staff → Add.", "en")).toBe("Open Settings, then Staff, then Add.");
  });

  it("makes the middle dot and dashes a pause", () => {
    expect(toSpeech("Senin · 21.30", "id")).toBe("Senin, jam setengah sepuluh malam");
    expect(toSpeech("Kakak sudah banyak membantu hari ini — coba lagi besok", "id")).toBe(
      "Kakak sudah banyak membantu hari ini, coba lagi besok"
    );
  });

  it("reads an aside in brackets as a short pause", () => {
    expect(toSpeech("Syam (yang urus anjing) diingatkan.", "id")).toBe("Syam, yang urus anjing, diingatkan.");
    expect(toSpeech("(Latihan) Ini yang akan Kakak tambahkan.", "id")).toBe("Latihan, Ini yang akan Kakak tambahkan.");
  });

  it("says HP the Indonesian way, in Indonesian only", () => {
    expect(toSpeech("Kakak kirim pengingat ke HP Ari.", "id")).toBe("Kakak kirim pengingat ke ha-pe Ari.");
    expect(toSpeech("HPnya mati, HP-nya dicas.", "id")).toBe("ha-pe-nya mati, ha-pe-nya dicas.");
    expect(toSpeech("PHP", "id")).toBe("PHP");
    expect(toSpeech("HP", "en")).toBe("HP");
  });

  it("speaks digit dates", () => {
    expect(toSpeech("Mulai 13/11.", "id")).toBe("Mulai 13 November.");
    expect(toSpeech("Starts 13/11/2026.", "en")).toBe("Starts November 13, 2026.");
    expect(toSpeech("32/13", "id")).toBe("32/13");
  });

  it("reads a slash between words, an ampersand and '2x'", () => {
    expect(toSpeech("Ari/Syam", "id")).toBe("Ari atau Syam");
    expect(toSpeech("Mocha & Matcha 2x sehari", "id")).toBe("Mocha dan Matcha 2 kali sehari");
  });

  it("rewrites a full real reply", () => {
    expect(toSpeech("Beres. Syam diingatkan jam 21.30; Kakak hanya mengabari Anda jika belum dikerjakan.", "id")).toBe(
      "Beres. Syam diingatkan jam setengah sepuluh malam, Kakak hanya mengabari Anda jika belum dikerjakan."
    );
  });
});

describe("speechPlan: sentence by sentence, gently", () => {
  it("reads a little slower than the default", () => {
    expect(SPEECH_RATE).toBe(0.93);
  });

  it("pauses longer after a short opener, then about 300 ms between sentences", () => {
    expect(speechPlan("Beres. Syam diingatkan jam 21.30; Kakak hanya mengabari Anda jika belum dikerjakan.", "id")).toEqual([
      { text: "Beres.", pauseAfterMs: OPENER_PAUSE_MS },
      {
        text: "Syam diingatkan jam setengah sepuluh malam, Kakak hanya mengabari Anda jika belum dikerjakan.",
        pauseAfterMs: 0,
      },
    ]);
    expect(speechPlan("Here's what I'll add. Is that right?", "en")).toEqual([
      { text: "Here's what I'll add.", pauseAfterMs: SENTENCE_PAUSE_MS },
      { text: "Is that right?", pauseAfterMs: 0 },
    ]);
    expect(OPENER_PAUSE_MS).toBeGreaterThan(SENTENCE_PAUSE_MS);
    expect(SENTENCE_PAUSE_MS).toBe(300);
  });

  it("reads at most two sentences after the opener, and keeps a closing question", () => {
    const long = "Done. One thing. Another thing. A third thing. Which day?";
    expect(speechPlan(long, "en").map((p) => p.text)).toEqual(["Done.", "One thing.", "Which day?"]);
    expect(MAX_SENTENCES).toBe(2);
    expect(speechPlan("This is one. This is two. This is three.", "en").map((p) => p.text)).toEqual(["This is one.", "This is two."]);
  });

  it("says nothing for nothing", () => {
    expect(speechPlan("", "id")).toEqual([]);
    expect(speechPlan("  ·  ", "id")).toEqual([]);
  });
});
