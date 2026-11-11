import type { CreateScheduleInput } from "@/lib/data/types";
import {
  STARTER_ROUTINES,
  effectiveProof,
  routineKindInfo,
  type StarterSpecies,
} from "@/lib/pet-routine-kinds";
import { draftFromRows, isOnceRow, newDraft, planRoutineSave } from "@/lib/routine-groups";
import type { MasterSchedule, RoutineKind } from "@/types/database";

/**
 * "Usual routines for Coco" (Phase 173 PR B, D9): the short tick-list after
 * adding a pet. Pure, so what is offered and what is written are unit-tested.
 *
 * - A dog gets Jalan pagi, Jalan sore and Ganti air minum; a cat Ganti air
 *   minum and Bersihkan pasir kucing; all ticked.
 * - A routine group the household already has (one with a kind, say
 *   Matikan lampu 21:30 for Mocha and Matcha) is offered unticked, as "Add
 *   Coco to Matikan lampu", which adds the pet's rows to that group.
 * - If a group has the same title as a starter, the group is offered in its
 *   place, ticked: Coco joins the household's Ganti air minum rather than
 *   getting a second one at its own time.
 * - A three-photo routine is never offered to join: three photos are for one
 *   pet at a time, and adding a pet would turn the others' walk into one
 *   photo (lib/pet-routine-kinds, effectiveProof).
 *
 * Everything is written through planRoutineSave, the Add routine sheet's own
 * planner, so the rows are exactly what the sheet would make.
 */
export interface StarterOption {
  /** "starter:walk-am" or "group:<routine_group_id>". */
  key: string;
  type: "starter" | "join";
  kind: RoutineKind;
  /** What staff read. */
  title: string;
  /** What an English-speaking owner reads, when it differs from the title. */
  en: string | null;
  /** HH:mm, sorted. */
  times: string[];
  /** Ticked when the list opens. */
  ticked: boolean;
  /** For a join: the group, and the pets already on it. */
  groupId?: string;
  petNames?: string[];
}

interface Group {
  id: string;
  rows: MasterSchedule[];
}

/** The household's live routine groups with a kind, other than this pet's, that a pet may join. */
function joinableGroups(params: {
  petId: string;
  schedules: MasterSchedule[];
  livePetIds: Set<string>;
  today: string;
}): Group[] {
  const { petId, schedules, livePetIds, today } = params;
  const byId = new Map<string, MasterSchedule[]>();
  for (const row of schedules) {
    if (!row.routine_group_id || !row.kind || !row.is_active) continue;
    if (!livePetIds.has(row.entity_id) || row.entity_id === petId) continue;
    if (row.expires_at && row.expires_at < today) continue;
    if (isOnceRow(row)) continue;
    const rows = byId.get(row.routine_group_id) ?? [];
    rows.push(row);
    byId.set(row.routine_group_id, rows);
  }
  return [...byId.entries()]
    .filter(([, rows]) => !rows.some((r) => r.proof === "three"))
    .map(([id, rows]) => ({ id, rows }));
}

function timesOf(rows: MasterSchedule[]): string[] {
  return [...new Set(rows.flatMap((r) => (r.fixed_times ?? []).map((t) => t.slice(0, 5))))].sort();
}

/** The kind's English chip name when the title is the kind's own; otherwise null (the title is shown). */
function englishFor(kind: RoutineKind, title: string): string | null {
  const info = routineKindInfo(kind);
  return info && info.title === title ? info.en : null;
}

export function starterOptions(params: {
  species: StarterSpecies;
  petId: string;
  schedules: MasterSchedule[];
  pets: { id: string; name: string }[];
  today: string;
}): StarterOption[] {
  const { species, petId, schedules, pets, today } = params;
  const names = new Map(pets.map((p) => [p.id, p.name]));
  const groups = joinableGroups({ petId, schedules, livePetIds: new Set(names.keys()), today });
  const joinOption = (group: Group, ticked: boolean): StarterOption => {
    const first = group.rows[0];
    return {
      key: `group:${group.id}`,
      type: "join",
      kind: first.kind!,
      title: first.title,
      en: englishFor(first.kind!, first.title),
      times: timesOf(group.rows),
      ticked,
      groupId: group.id,
      petNames: [...new Set(group.rows.map((r) => names.get(r.entity_id) ?? ""))].filter(Boolean),
    };
  };

  const used = new Set<string>();
  const options: StarterOption[] = [];
  for (const starter of STARTER_ROUTINES[species]) {
    const same = groups.find((g) => !used.has(g.id) && g.rows[0].title === starter.title);
    if (same) {
      used.add(same.id);
      options.push(joinOption(same, true));
    } else {
      options.push({
        key: `starter:${starter.key}`,
        type: "starter",
        kind: starter.kind,
        title: starter.title,
        en: starter.en,
        times: [starter.time],
        ticked: true,
      });
    }
  }
  const rest = groups
    .filter((g) => !used.has(g.id))
    .sort((a, b) => (timesOf(a.rows)[0] ?? "").localeCompare(timesOf(b.rows)[0] ?? "") || a.id.localeCompare(b.id))
    .map((g) => joinOption(g, false));
  return [...options, ...rest];
}

/**
 * The rows the ticked options write for this pet: a new group of its own for
 * each starter, and the pet's rows in each joined group. Never touches
 * another pet's rows.
 */
export function starterRows(params: {
  petId: string;
  options: StarterOption[];
  schedules: MasterSchedule[];
  today: string;
  nowIso: string;
  newGroupId: () => string;
}): CreateScheduleInput[] {
  const { petId, options, schedules, today, nowIso, newGroupId } = params;
  const out: CreateScheduleInput[] = [];
  for (const option of options) {
    if (option.type === "starter") {
      const draft = { ...newDraft(option.kind, [petId], today), title: option.title, times: option.times };
      out.push(...planRoutineSave({ draft, existing: [], groupId: newGroupId(), onceStart: nowIso, nowIso, today }).create);
      continue;
    }
    const rows = schedules.filter((r) => r.routine_group_id === option.groupId);
    if (rows.length === 0 || rows.some((r) => r.entity_id === petId)) continue;
    const base = draftFromRows(rows, today);
    const petIds = [...base.petIds, petId];
    const draft = { ...base, petIds, proof: effectiveProof(base.proof, petIds.length) };
    const plan = planRoutineSave({ draft, existing: rows, groupId: option.groupId!, onceStart: nowIso, nowIso, today });
    // Only the new pet's rows: the group's other rows stay exactly as they are.
    out.push(...plan.create.filter((row) => row.entity_id === petId));
  }
  return out;
}
