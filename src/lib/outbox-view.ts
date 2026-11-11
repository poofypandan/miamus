import type { FoodItem, HouseholdTask, TaskLog } from "@/types/database";
import type { FoodItemInput } from "@/lib/data";
import type { ChoreFinishJob, OfflineQueueItem } from "@/lib/offline-queue";

/**
 * What the screen shows for saves still waiting on the phone (Phase 161).
 *
 * The queue is the record, not React state: a pull-to-refresh or a reload
 * replaces the household with the server's copy, which does not have them
 * yet, and a log that vanished from the screen would be logged again. So
 * whatever is waiting is laid over the server's copy every render, under the
 * same ids it will have once it arrives — no flicker and no duplicate when it
 * does.
 */
export interface OutboxView {
  logs: TaskLog[];
  foods: FoodItem[];
  /** Chores as they will be once sent: real rows changed, or days written. */
  tasks: HouseholdTask[];
  /** Every id above: "waiting to send" on the screen. */
  pendingIds: ReadonlySet<string>;
  /**
   * Portion taps and undos waiting on the phone (Phase 170 PR A), laid over
   * the server's count by applyPortions, so a reload still shows them.
   */
  portions: PendingPortion[];
}

export interface PendingPortion {
  /** The queue item, to stop laying it over once the server has answered it. */
  itemId: string;
  foodId: string;
  /** +1 for a tap, -1 for an undo. */
  taken: 1 | -1;
  /** An undo of the tap that finished the food: shown back on the list. */
  reopens: boolean;
}

/**
 * The food as it will be once the waiting portion taps are sent (Phase 170
 * PR A; Codex, PR #93). Relative, unlike the other waiting saves, so an
 * answered one is skipped: the server's copy already has it. Whether a tap
 * finishes the food is the server's call, so a count may show 0 until then.
 *
 * Safe to subtract every unanswered tap because the queue sends one food's
 * taps strictly in order (offline-queue's "portion:<food>" key, Codex P2 on
 * PR #93): a later tap is held until every earlier tap on that food is
 * answered, so no server count can arrive that already includes a tap the
 * screen is still laying over it (a reply lost, then a second tap).
 */
export function applyPortions(
  foods: FoodItem[],
  portions: readonly PendingPortion[],
  isAnswered: (itemId: string) => boolean
): FoodItem[] {
  const live = portions.filter((p) => !isAnswered(p.itemId));
  if (live.length === 0) return foods;
  return foods.map((food) => {
    const mine = live.filter((p) => p.foodId === food.id);
    if (mine.length === 0 || typeof food.portions !== "number") return food;
    let next: FoodItem = food;
    for (const p of mine) {
      if (p.taken === -1 && p.reopens && next.outcome === "eaten") {
        next = { ...next, outcome: null, finished_at: null, finished_by: null };
      }
      const portions = Math.min(99, Math.max(0, (next.portions ?? 0) - p.taken));
      next = { ...next, portions };
    }
    return next;
  });
}

export const EMPTY_OUTBOX_VIEW: OutboxView = { logs: [], foods: [], tasks: [], pendingIds: new Set(), portions: [] };

export function pendingFood(
  id: string,
  input: FoodItemInput,
  addedBy: string | null,
  householdId: string,
  at: string
): FoodItem {
  return {
    ...input,
    id,
    household_id: householdId,
    added_by: addedBy,
    created_by: null,
    created_at: at,
    updated_at: at,
    container_returned_at: null,
    outcome: null,
    finished_at: null,
    finished_by: null,
  };
}

/** The id a day that is not written yet carries until it is. */
export function pendingChoreRowId(itemId: string): string {
  return `pending:${itemId}`;
}

function finishedChore(row: HouseholdTask, job: ChoreFinishJob): HouseholdTask {
  return {
    ...row,
    status: "completed",
    ...(job.takeOverAs ? { assigned_to: job.takeOverAs } : {}),
    completed_at: job.completedAt,
    completed_by: job.completedBy,
    photo_url: job.after,
    before_photo_url: job.before,
    after_photo_url: job.after,
  };
}

export function outboxView(
  items: readonly OfflineQueueItem[],
  householdId: string,
  tasks: readonly HouseholdTask[]
): OutboxView {
  if (items.length === 0) return EMPTY_OUTBOX_VIEW;
  const logs: TaskLog[] = [];
  const foods: FoodItem[] = [];
  const changed: HouseholdTask[] = [];
  const pendingIds = new Set<string>();
  const portions: PendingPortion[] = [];

  for (const item of items) {
    if (item.householdId && item.householdId !== householdId) continue;
    const { job } = item;
    if (job.kind === "logs") {
      const { payload } = job;
      payload.entries.forEach((entry, i) => {
        const id = job.ids?.[i] ?? `offline-${item.id}-${i}`;
        pendingIds.add(id);
        logs.push({
          id,
          schedule_id: entry.schedule_id ?? null,
          entity_id: entry.entity_id,
          module: payload.module,
          photo_url: payload.photo_url ?? null,
          notes: payload.notes ?? null,
          completed_at: payload.completed_at ?? new Date(item.timestamp).toISOString(),
          staff_id: payload.staff_id ?? null,
          sub_type: payload.sub_type ?? "complete",
        });
      });
    } else if (job.kind === "couldnt") {
      // Laid over by the couldn't-do store itself (lib/task-exceptions-store.ts).
      continue;
    } else if (job.kind === "portion" || job.kind === "portion-undo") {
      // Laid over the server's count by applyPortions (Phase 170 PR A).
      portions.push({
        itemId: item.id,
        foodId: job.foodId,
        taken: job.kind === "portion" ? 1 : -1,
        reopens: job.kind === "portion-undo" && job.reopens === true,
      });
    } else if (job.kind === "food") {
      pendingIds.add(job.id);
      foods.push(pendingFood(job.id, job.input, job.addedBy, householdId, new Date(item.timestamp).toISOString()));
    } else if (job.kind !== "chore") {
      // Walk-ins and hand-overs: laid over by the repairs store (Phase 174).
      continue;
    } else {
      // The day's row, if this phone has it — by id, or written since by
      // another phone (or by an earlier try of this very save).
      const row =
        (job.rowId && tasks.find((t) => t.id === job.rowId)) ||
        tasks.find((t) => t.parent_task_id === job.templateId && t.due_date === job.date);
      if (row) {
        pendingIds.add(row.id);
        changed.push(finishedChore(row, job));
        continue;
      }
      const template = tasks.find((t) => t.id === job.templateId);
      // Neither loaded (another week on screen): nothing to draw it on.
      if (!template) continue;
      const id = pendingChoreRowId(item.id);
      pendingIds.add(id);
      changed.push(
        finishedChore(
          {
            ...template,
            id,
            parent_task_id: template.id,
            due_date: job.date,
            assigned_to: job.assignedTo,
            recurrence: "none",
            recurrence_until: null,
          },
          job
        )
      );
    }
  }
  return { logs, foods, tasks: changed, pendingIds, portions };
}

/** The server's copy with the waiting saves laid over it, by id. */
export function overlay<T extends { id: string }>(server: readonly T[], waiting: readonly T[], prepend = true): T[] {
  if (waiting.length === 0) return server as T[];
  const replaced = new Map(waiting.map((row) => [row.id, row]));
  const merged = server.map((row) => replaced.get(row.id) ?? row);
  const have = new Set(server.map((row) => row.id));
  const added = waiting.filter((row) => !have.has(row.id));
  return prepend ? [...added, ...merged] : [...merged, ...added];
}
