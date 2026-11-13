/**
 * What the owner types and what Kakak answers, in both languages
 * (storyboard: "What to type, exactly").
 *
 * Kakak's replies are scripted here and answered in place of /api/kakak, in
 * the route's own reply shape (src/lib/kakak/suggestions.ts), the way the
 * repo's own demo test does (tests/e2e/kakak-demo.spec.ts). Nothing is sent
 * to the AI and every run is identical. Practice mode (KAKAK_PRACTICE) is not
 * used for these three because it reads one intent per sentence (sentence 3
 * is two cards) and labels its bubbles "(Latihan)".
 */
import { BRUNO, COCO, DAY, EGGS, NEXT_MONDAY, SARI, SOAP, TERRACE } from "./demo";

export type Locale = "id" | "en";

export const UI = {
  id: { open: "Bilang ke Kakak", box: "Mau Kakak atur apa?", send: "Kirim", confirm1: "Sudah benar", confirm2: "Simpan", confirm3: "Simpan 2" },
  en: { open: "Tell Kakak", box: "What should I set up?", send: "Send", confirm1: "Looks right", confirm2: "Save", confirm3: "Save 2" },
} as const;

export const TYPED: Record<Locale, [string, string, string]> = {
  id: [
    "Minta Sari pel teras setiap Senin jam 9.",
    "Matikan lampu untuk Coco dan Bruno jam 21.30. Ingatkan staf, dan kabari saya kalau belum dikerjakan.",
    "Beli telur dan sabun cuci piring. Tante Rina juga bawa opor, simpan di kulkas.",
  ],
  en: [
    "Have Sari mop the terrace every Monday at 9.",
    "Lights off for Coco and Bruno at 9:30 pm. Remind staff, and tell me if it isn't done.",
    "Buy eggs and dish soap. Aunt Rina also brought opor; it's in the fridge.",
  ],
};

const REPLY: Record<Locale, [string, string, string]> = {
  id: [
    "Baik. Sari mengepel teras setiap Senin jam 09.00.",
    "Baik. Lampu untuk Coco dan Bruno dimatikan setiap malam jam 21.30, dengan foto. Staf diingatkan, dan Anda dikabari kalau belum dikerjakan.",
    "Baik. Telur dan sabun cuci piring masuk daftar belanja, dan opor dari Tante Rina dicatat di kulkas.",
  ],
  en: [
    "Sure. Sari mops the terrace every Monday at 9:00.",
    "Sure. Lights off for Coco and Bruno every night at 9:30 pm, with a photo. Staff get a reminder, and you'll hear only if it isn't done.",
    "Sure. Eggs and dish soap are on the shopping list, and Aunt Rina's opor is noted in the fridge.",
  ],
};

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function items(locale: Locale, k: 0 | 1 | 2) {
  if (k === 0) {
    return [
      {
        kind: "chore", title: "Pel teras", titleEn: "Mop the terrace", category: "cleaning",
        assignedTo: SARI, assignToSelf: false, assigneeName: "Sari",
        dueDate: NEXT_MONDAY, dueTime: "09:00", recurrence: "weekly", recurrenceUntil: null,
        requiresSupervision: false, locationId: TERRACE.id, roomName: "Teras",
        newRoomName: null, newRoomFloorId: null, newRoomFloorName: null, notes: null, remindDaysBefore: null,
      },
    ];
  }
  if (k === 1) {
    return [
      {
        kind: "pet_routine", routine: "lights", title: "Matikan lampu", titleEn: null,
        pets: [
          { petId: COCO, petName: "Coco", times: [{ time: "21:30", title: "Matikan lampu" }], alreadyThere: [] },
          { petId: BRUNO, petName: "Bruno", times: [{ time: "21:30", title: "Matikan lampu" }], alreadyThere: [] },
        ],
        days: null, until: null, staffId: null, staffName: null, note: null, proof: "photo",
        remindStaff: true, alertOwners: true,
      },
    ];
  }
  return [
    {
      kind: "shopping",
      entries: [
        { type: "item", itemId: EGGS, name: "Telur", status: "out" },
        { type: "item", itemId: SOAP, name: "Sabun cuci piring", status: "out" },
      ],
    },
    {
      kind: "food", name: "Opor", keptIn: "fridge", expiresOn: addDays(DAY, 2), expiryUnknown: false,
      expiryIsGuess: true, source: "gift", fromWhom: locale === "en" ? "Aunt Rina" : "Tante Rina",
      returnContainer: false, notes: null,
    },
  ];
}

export function kakakReply(locale: Locale, k: 0 | 1 | 2) {
  return {
    kind: "suggestions",
    text: REPLY[locale][k],
    items: items(locale, k),
    requestId: `00000000-0000-4000-8000-00000017${k}d01`,
    history: { messages: [] },
  };
}
