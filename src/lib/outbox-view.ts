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
}

export const EMPTY_OUTBOX_VIEW: OutboxView = { logs: [], foods: [], tasks: [], pendingIds: new Set() };

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
      // Shown at the tap and confirmed by the server's answer; a portion
      // waiting on the phone isn't laid over again (Phase 170 PR A).
      continue;
    } else if (job.kind === "food") {
      pendingIds.add(job.id);
      foods.push(pendingFood(job.id, job.input, job.addedBy, householdId, new Date(item.timestamp).toISOString()));
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
  return { logs, foods, tasks: changed, pendingIds };
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
