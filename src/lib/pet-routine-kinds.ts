import {
  Bone,
  Footprints,
  GlassWater,
  LightbulbOff,
  List,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { RoutineKind, RoutineProof } from "@/types/database";

/**
 * The Add routine sheet's quick choices (Phase 173, D2): one catalogue, also
 * meant for Kakak's tool and the starter routines after adding a pet (PR B).
 *
 * The saved title is Indonesian whatever the owner's language, because staff
 * read it; the owner sees the chip in their own language. "Ajak main", not
 * "Main" alone, which reads as "play" for the staff themselves (glossary).
 */
export interface RoutineKindInfo {
  kind: RoutineKind;
  en: string;
  id: string;
  /** What staff read. Null for "other": the owner types it. */
  title: string | null;
  icon: LucideIcon;
  /** HH:mm the chip suggests. */
  time: string;
  /** Walks are proven by three photos (D14); everything else by one (D6). */
  proof: RoutineProof;
}

export const ROUTINE_KINDS: RoutineKindInfo[] = [
  { kind: "walk", en: "Walk", id: "Jalan-jalan", title: "Jalan-jalan", icon: Footprints, time: "06:30", proof: "three" },
  { kind: "lights", en: "Lights off", id: "Matikan lampu", title: "Matikan lampu", icon: LightbulbOff, time: "21:30", proof: "photo" },
  { kind: "play", en: "Play", id: "Ajak main", title: "Ajak main", icon: Bone, time: "16:00", proof: "photo" },
  { kind: "water", en: "Fresh water", id: "Ganti air minum", title: "Ganti air minum", icon: GlassWater, time: "08:00", proof: "photo" },
  { kind: "teeth", en: "Brush teeth", id: "Sikat gigi", title: "Sikat gigi", icon: Sparkles, time: "19:00", proof: "photo" },
  { kind: "other", en: "Other", id: "Lainnya", title: null, icon: List, time: "08:00", proof: "photo" },
];

const BY_KIND = new Map(ROUTINE_KINDS.map((k) => [k.kind, k]));

export function routineKindInfo(kind: RoutineKind | null | undefined): RoutineKindInfo | null {
  return kind ? (BY_KIND.get(kind) ?? null) : null;
}

/**
 * Proofs the sheet offers for a kind: 3 photos only for walks and Other (D14),
 * and only for one pet. A walk shared by several pets is proven by one photo
 * of them all; three-photo walks for several pets together are a follow-up
 * (docs/phase-173-pet-routines-plan.md, "Multi-pet walks").
 */
export function proofChoices(kind: RoutineKind, petCount = 1): RoutineProof[] {
  return (kind === "walk" || kind === "other") && petCount <= 1 ? ["three", "photo", "tick"] : ["photo", "tick"];
}

/** The proof a routine is saved with: 3 photos falls back to 1 for several pets. */
export function effectiveProof(proof: RoutineProof, petCount: number): RoutineProof {
  return proof === "three" && petCount > 1 ? "photo" : proof;
}

/** The longest note staff are shown (migrations/144's CHECK). */
export const ROUTINE_NOTE_MAX = 120;

/** ISO weekday (1 = Monday ... 7 = Sunday) of a "YYYY-MM-DD" calendar date. */
export function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** A proof as stored, with the column's default for rows read before 144. */
export function proofOf(schedule: { proof?: RoutineProof | null }): RoutineProof {
  return schedule.proof ?? "photo";
}

/**
 * Which proof a staff card follows when its rows differ (same time and title):
 * three photos win, then a photo, then a tick (D4, D14). A mixed tick and photo
 * card asks for a photo.
 */
export function strongestProof(proofs: RoutineProof[]): RoutineProof {
  if (proofs.includes("three")) return "three";
  if (proofs.includes("photo")) return "photo";
  return proofs.length > 0 ? "tick" : "photo";
}
