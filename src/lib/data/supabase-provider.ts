import { WRITE_TIMEOUT_MS } from "@/lib/supabase/write-timeout";
import { ChoreAlreadySettledError } from "@/lib/chore-settled";
import { supabase } from "@/lib/supabase/client";
import { getActiveHouseholdId } from "@/lib/tenant";
import type { OrganiseRoomsMoved,
  HouseholdTask,
  BillPayment,
  NotificationPrefs,
  InventoryAuditLog,
  InventoryAuditWithStaff,
  FoodItem,
  InventoryItem,
  Recipe,
  RecipeIngredient,
  StaffProfile,
} from "@/types/database";
import { withLines } from "@/lib/recipes";
import type { CreateHouseholdTaskInput, DataProvider, HouseCodeClaim, HouseCodePerson, HouseCodeSignIn, LinkedPhone, PinCheck } from "./types";
import { longRepeatFloorFor, longestGapDays, LONGEST_REPEAT_GAP_DAYS, rolloverFloorFor } from "@/lib/chore-recurrence";

function client() {
  if (!supabase) throw new Error("Supabase client is not configured");
  return supabase;
}

/**
 * The HTTP status, kept on the error (Phase 161): the save queue tells a
 * gateway that is briefly down (503) from a real refusal by it, and
 * PostgREST's error object does not carry it.
 */
function withStatus<E extends object>(error: E, status: number): E & { status: number } {
  return Object.assign(error, { status });
}

const STORAGE_BUCKET = "household-logs";
/** Repair receipts: owners only (migrations/131). */
const RECEIPTS_BUCKET = "owner-receipts";

// getPublicUrl() returns ".../storage/v1/object/public/<bucket>/<path>". Since
// Phase 90 the buckets are private, so that URL no longer serves anything — it
// is kept as the stored identifier (every row already holds one, and rewriting
// them all would be a migration for no gain). lib/photos.ts turns it into a
// loadable /api/photo link, and this pulls <path> back out to delete.
function extractStoragePath(url: string): string | null {
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

const INVENTORY_BUCKET = "inventory_audits";

// From the type, not the name: compressPhoto keeps the original file name, so
// an iPhone photo re-encoded as JPEG would otherwise be stored as ".heic".
// Cosmetic — Content-Type is what storage and /api/photo go by.
/**
 * Every row of a read, a page at a time: PostgREST returns at most max_rows
 * (1,000, supabase/config.toml) per request, so a long-lived household's
 * repairs, visits or notes would otherwise silently lose the newest
 * (Codex, PR #38). `page` must order by a unique key so pages don't overlap.
 */
async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}

function extensionFor(file: File): string {
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  return file.name.split(".").pop() ?? "jpg";
}

// Everything on staff_profiles except `pin`, which no client role may select.
const STAFF_COLUMNS = "id, household_id, name, created_at, has_pin";
// With the admin link (migrations/106). Tried first; a database that has not
// had 106 refuses the column, and the roster falls back to the list above.
const STAFF_COLUMNS_WITH_MEMBER = `${STAFF_COLUMNS}, user_id`;
// Richest first. Each later entry drops the column set of a migration that
// may not be applied yet — 109 (archived_at), then 106 (user_id) — so a
// client running ahead of its database degrades a feature at a time instead
// of failing the whole roster read, which is what the sign-in screen needs
// to draw at all. A dropped archived_at reads as "active" everywhere.
const STAFF_COLUMN_SETS = [
  `${STAFF_COLUMNS_WITH_MEMBER}, archived_at`,
  STAFF_COLUMNS_WITH_MEMBER,
  STAFF_COLUMNS,
];

// An audit plus its author's name, embedded through audited_by.
const AUDIT_COLUMNS = "*, staff_profiles(name)";
type AuditRow = InventoryAuditLog & { staff_profiles: { name: string } | null };

function flattenAudit({ staff_profiles, ...audit }: AuditRow): InventoryAuditWithStaff {
  return { ...audit, staff_name: staff_profiles?.name ?? null };
}

/**
 * The stock and portion RPCs give up like table writes do (Phase 170 PR A,
 * code review on #93). Table writes already have lib/supabase/write-timeout;
 * RPCs are left out of it (some are slow by design), so these few set their
 * own. One phone's writes to an item go to the server one after another
 * (lib/in-order), and a request stuck on a dead signal would otherwise hold
 * Out or Set amount behind it for minutes. The reason is a TimeoutError, as
 * write-timeout's, so it reads as "no answer" (retryable), not a cancel.
 */
async function withRpcDeadline<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("The save timed out", "TimeoutError")),
    WRITE_TIMEOUT_MS
  );
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export const supabaseProvider: DataProvider = {
  async listEntities() {
    const { data, error } = await client()
      .from("task_entities")
      .select("*")
      .eq("household_id", getActiveHouseholdId())
      .order("created_at");
    if (error) throw error;
    return data;
  },
  async listSchedules() {
    const { data, error } = await client().from("master_schedules").select("*");
    if (error) throw error;
    return data;
  },
  async listLogs() {
    const { data, error } = await client()
      .from("task_logs")
      .select("*")
      .order("completed_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return data;
  },
  async listMedicalRecords() {
    const { data, error } = await client()
      .from("medical_records")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createEntity(input) {
    const { data, error } = await client()
      .from("task_entities")
      .insert({ ...input, household_id: getActiveHouseholdId() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateEntity(id, patch) {
    const { data, error } = await client()
      .from("task_entities")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async deleteEntity(id) {
    const { error } = await client().from("task_entities").delete().eq("id", id);
    if (error) throw error;
  },
  async createLog(input) {
    const { data, error } = await client().from("task_logs").insert(input).select().single();
    if (error) throw error;
    return data;
  },
  async createLogsBatch(input) {
    const completedAt = input.completed_at ?? new Date().toISOString();
    if (input.ids && input.ids.length !== input.entries.length) {
      throw new Error("createLogsBatch: one id per entry");
    }
    const rows = input.entries.map((entry, i) => ({
      // Made on the phone when the save is queued (Phase 161): a retry sends
      // the same ids, and the primary key refuses the second copy.
      ...(input.ids ? { id: input.ids[i] } : {}),
      schedule_id: entry.schedule_id ?? null,
      entity_id: entry.entity_id,
      module: input.module,
      photo_url: input.photo_url ?? null,
      notes: input.notes ?? null,
      completed_at: completedAt,
      // Stamped once for the whole batch: one photo of four dogs is one
      // person's work, however many rows it becomes.
      staff_id: input.staff_id ?? null,
      // Vet visits log twice — a check-in and then a check-out or an
      // admission. Everything else is a plain "complete".
      sub_type: input.sub_type ?? "complete",
    }));
    const { data, error, status } = await client().from("task_logs").insert(rows).select();
    if (error) throw withStatus(error, status);
    return data;
  },
  async deleteLog(id) {
    // .select() so a refused delete shows: RLS filters it to zero rows rather
    // than failing. Since migrations/146 a staff phone may delete only a log
    // it saved, within its undo window; without this the app would drop the
    // log and its photo locally while the row stays.
    const { data, error } = await client().from("task_logs").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Log was not deleted");
  },
  async createSchedule(input) {
    const { data, error } = await client()
      .from("master_schedules")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async createSchedulesBatch(entries) {
    const { data, error } = await client().from("master_schedules").insert(entries).select();
    if (error) throw error;
    return data;
  },
  async updateSchedule(id, patch) {
    const { data, error } = await client()
      .from("master_schedules")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async deleteSchedule(id) {
    const { error } = await client().from("master_schedules").delete().eq("id", id);
    if (error) throw error;
  },
  async schedulesWithLogs(ids) {
    // One existence check per routine row (a group is a few rows): a single
    // read of every log would be cut at the API's row limit (1,000), and a
    // row missing from it would be deleted with its history (Codex, PR #85).
    const found = await Promise.all(
      [...new Set(ids)].map(async (id) => {
        // A "couldn't do" record is history too: deleting the row would
        // cascade to it (migrations/139; Codex, PR #85).
        const [logs, exceptions] = await Promise.all([
          client().from("task_logs").select("id").eq("schedule_id", id).limit(1),
          client().from("task_exceptions").select("id").eq("schedule_id", id).limit(1),
        ]);
        if (logs.error) throw logs.error;
        if (exceptions.error) throw exceptions.error;
        return (logs.data ?? []).length > 0 || (exceptions.data ?? []).length > 0 ? id : null;
      })
    );
    return new Set(found.filter((id): id is string => id !== null));
  },
  async createMedicalRecord(input) {
    const { data, error } = await client()
      .from("medical_records")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async uploadPhoto(file, pathPrefix) {
    const { path, url } = supabaseProvider.reservePhotoPath(file, pathPrefix);
    await supabaseProvider.uploadPhotoAt(path, file);
    return url;
  },
  reservePhotoPath(file, pathPrefix) {
    const ext = extensionFor(file);
    // Household first (Phase 90): the storage policies read the tenant out of
    // the object key, so an upload that skipped the prefix would be refused.
    const path = `${getActiveHouseholdId()}/${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    // Pure string-building inside supabase-js: no request, so this works with
    // no signal at all.
    const { data } = client().storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return { path, url: data.publicUrl };
  },
  async uploadPhotoAt(path, file) {
    const { error } = await client()
      .storage.from(STORAGE_BUCKET)
      .upload(path, file, { contentType: file.type });
    // A retry of an upload whose reply was lost: the object is already there.
    // Keys are unique per photo, so "exists" can only mean "this one".
    if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  },
  async deletePhoto(url) {
    const path = extractStoragePath(url);
    if (!path) return;
    const { error } = await client().storage.from(STORAGE_BUCKET).remove([path]);
    if (error) throw error;
  },
  async listInventoryAlerts() {
    const { data, error } = await client()
      .from("inventory_alerts")
      .select("*")
      .eq("household_id", getActiveHouseholdId())
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createInventoryAlert(input) {
    const { data, error } = await client()
      .from("inventory_alerts")
      .insert({ ...input, household_id: getActiveHouseholdId() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async resolveInventoryAlert(id) {
    // `resolved` is written alongside `status` on purpose: the boolean is what
    // pre-Phase-50 rows and any not-yet-migrated database rely on, so letting
    // the two drift would strand a restock in whichever view reads the other.
    const c = client();
    const { error } = await c
      .from("inventory_alerts")
      .update({ resolved: true, status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) return;

    // PGRST204 means PostgREST has no such column — the Phase 50 migration
    // hasn't been applied yet. Resolving an alert worked before this phase and
    // must keep working, so fall back to the boolean this table has always
    // had. isRestocked() reads that same boolean, so the History tab still
    // shows the restock; only the exact date is missing until the migration
    // lands. Verified live: without this the whole update 400s.
    if (error.code !== "PGRST204") throw error;
    const { error: legacyError } = await c
      .from("inventory_alerts")
      .update({ resolved: true })
      .eq("id", id);
    if (legacyError) throw legacyError;
  },
  async deleteInventoryAlert(id) {
    // Same reasoning as deleteRoutineProposal: an RLS-filtered delete succeeds
    // with zero rows, so check what actually went rather than trusting the
    // status code.
    const { data, error } = await client()
      .from("inventory_alerts")
      .delete()
      .eq("id", id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        "Alert was not deleted — the inventory_alerts delete policy is missing or the 5-minute window has passed."
      );
    }
  },
  async listInventoryItems() {
    const { data, error } = await client()
      .from("inventory_items")
      .select("*")
      .eq("household_id", getActiveHouseholdId())
      .order("name");
    if (error) throw error;
    return data;
  },
  async createInventoryItem(input) {
    const { data, error } = await client()
      .from("inventory_items")
      .insert({ ...input, household_id: getActiveHouseholdId() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateInventoryItem(id, patch) {
    const { data, error } = await client()
      .from("inventory_items")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async setInventoryStatus(id, status, staffId) {
    // A plain update: stock_status is not one of the owner-only fields that
    // inventory_items_owner_guard protects (099), so staff phones may set
    // it; the trigger stamps the time (122). .select() so an RLS-filtered
    // update (200, no rows) is an error rather than a silent no-op.
    const { data, error } = await client()
      .from("inventory_items")
      .update({ stock_status: status, stock_status_by: staffId })
      .eq("id", id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Item was not updated");
    return data[0];
  },
  async adjustInventoryQuantity(id, delta, staffId = null) {
    // migrations/099, with who changed it since 148. Returns the updated
    // row; none at all means RLS hid it (another household's id, or a row
    // deleted under us).
    const { data, error } = await withRpcDeadline((signal) =>
      client()
        .rpc("adjust_inventory_quantity", { p_item_id: id, p_delta: delta, p_staff_id: staffId })
        .abortSignal(signal)
        .select()
        .single()
    );
    if (error) throw error;
    return data as InventoryItem;
  },
  async recordPurchase(id, amount, staffId) {
    // migrations/148: security invoker, so RLS and the owner guard apply.
    const { data, error } = await withRpcDeadline((signal) =>
      client()
        .rpc("record_purchase", { p_item_id: id, p_amount: amount, p_staff_id: staffId })
        .abortSignal(signal)
        .select()
        .single()
    );
    if (error) throw error;
    return data as InventoryItem;
  },
  async deleteInventoryItem(id) {
    // .select() so an RLS-filtered delete (200 with zero rows) surfaces as a
    // failure instead of a silent no-op — same reasoning as Phase 52.
    const { data, error } = await client()
      .from("inventory_items")
      .delete()
      .eq("id", id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Item was not deleted.");
  },
  async listLatestInventoryAudits() {
    // One row per item with only its newest audit embedded: the limit applies
    // per parent, so this stays 29-ish rows however long the history grows,
    // where fetching the log table and reducing client-side would not.
    // The embeds resolve through the FKs in migrations/083; Database declares
    // no Relationships, so the typed parser can't follow them — hence the cast.
    const { data, error } = await client()
      .from("inventory_items")
      .select(`id, inventory_audit_logs(${AUDIT_COLUMNS})`)
      .eq("household_id", getActiveHouseholdId())
      .order("created_at", { referencedTable: "inventory_audit_logs", ascending: false })
      .limit(1, { referencedTable: "inventory_audit_logs" });
    if (error) throw error;
    const rows = data as unknown as { id: string; inventory_audit_logs: AuditRow[] }[];
    const latest: Record<string, InventoryAuditWithStaff> = {};
    for (const row of rows) {
      const audit = row.inventory_audit_logs[0];
      if (audit) latest[row.id] = flattenAudit(audit);
    }
    return latest;
  },
  async uploadInventoryPhoto(file, itemId) {
    const c = client();
    const ext = extensionFor(file);
    const path = `${getActiveHouseholdId()}/${itemId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await c.storage
      .from(INVENTORY_BUCKET)
      .upload(path, file, { contentType: file.type });
    if (error) throw error;
    return c.storage.from(INVENTORY_BUCKET).getPublicUrl(path).data.publicUrl;
  },
  async createInventoryAudit(input) {
    const c = client();
    const { data: auditData, error: auditError } = await c
      .from("inventory_audit_logs")
      .insert(input)
      .select(AUDIT_COLUMNS)
      .single();
    if (auditError) throw auditError;
    const audit = flattenAudit(auditData as unknown as AuditRow);

    // Second write, after the log exists: the audit is the record of truth,
    // and the item row is a cache of its latest numbers. If this one fails the
    // item simply stays due and the next check overwrites it.
    const { data: item, error: itemError } = await c
      .from("inventory_items")
      .update({
        quantity: input.quantity_counted,
        last_audited_at: audit.created_at,
      })
      .eq("id", input.item_id)
      .select()
      .single();
    if (itemError) throw itemError;
    return { audit, item };
  },
  async listFoodItems() {
    const { data, error } = await client()
      .from("food_items")
      .select("*")
      .eq("household_id", getActiveHouseholdId())
      .or("outcome.is.null,and(return_container.eq.true,container_returned_at.is.null)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createFoodItem(input, addedBy) {
    const { data, error, status } = await client()
      .from("food_items")
      .insert({ ...input, added_by: addedBy, household_id: getActiveHouseholdId() })
      .select()
      .single();
    if (error) throw withStatus(error, status);
    return data;
  },
  async eatFoodPortion(id, opId, staffId) {
    const { data, error, status } = await withRpcDeadline((signal) =>
      client().rpc("eat_food_portion", { p_food_id: id, p_op_id: opId, p_staff_id: staffId }).abortSignal(signal)
    );
    if (error) throw withStatus(error, status);
    return data as { food: FoodItem; consumed: number };
  },
  async undoFoodPortion(id, opId) {
    const { data, error, status } = await withRpcDeadline((signal) =>
      client().rpc("undo_food_portion", { p_food_id: id, p_op_id: opId }).abortSignal(signal)
    );
    if (error) throw withStatus(error, status);
    return data as { food: FoodItem; restored: number };
  },
  async updateFoodItem(id, patch) {
    // .select() so an RLS-filtered update (200, no rows) is an error rather
    // than a silent no-op.
    const { data, error } = await client().from("food_items").update(patch).eq("id", id).select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Food was not updated");
    return data[0];
  },
  async deleteFoodItem(id) {
    // Admins only (migrations/123); a staff phone's delete matches no rows.
    const { data, error } = await client().from("food_items").delete().eq("id", id).select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Food was not deleted");
  },
  async listRecipes() {
    const household = getActiveHouseholdId();
    const [recipes, lines] = await Promise.all([
      client().from("recipes").select("*").eq("household_id", household),
      client().from("recipe_ingredients").select("*").eq("household_id", household).order("position"),
    ]);
    // A database before migrations/151: no recipes yet, not a failure.
    const missing = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01";
    if (recipes.error) {
      if (missing(recipes.error)) return [];
      throw recipes.error;
    }
    if (lines.error && !missing(lines.error)) throw lines.error;
    return withLines((recipes.data ?? []) as Recipe[], (lines.data ?? []) as RecipeIngredient[]);
  },
  async saveRecipe(payload) {
    const { data, error, status } = await client().rpc("save_recipe", {
      p_recipe: { ...payload.recipe, household_id: getActiveHouseholdId() },
      p_ingredients: payload.ingredients,
    });
    if (error) throw withStatus(error, status);
    const saved = data as { recipe: Recipe; ingredients: RecipeIngredient[] };
    return { ...saved.recipe, ingredients: saved.ingredients ?? [] };
  },
  async deleteRecipe(id) {
    // Owners only (migrations/151); a staff phone's delete matches no rows.
    const { data, error } = await client().from("recipes").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Recipe was not deleted");
  },
  async listRoutineProposals() {
    const { data, error } = await client()
      .from("routine_proposals")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createRoutineProposal(input) {
    const { data, error } = await client()
      .from("routine_proposals")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async deleteRoutineProposal(id) {
    // .select() so the affected rows come back. RLS *filters* a forbidden
    // delete rather than rejecting it, so without this the call returns a
    // cheerful 200 having removed nothing, and the staff member is told
    // "Berhasil dibatalkan" for a row that is still there and reappears on the
    // next refresh. Verified live before the Phase 47 delete policy was
    // applied. Treating zero affected rows as a failure surfaces it honestly.
    const { data, error } = await client()
      .from("routine_proposals")
      .delete()
      .eq("id", id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        "Proposal was not deleted — the routine_proposals delete policy is missing or the 5-minute window has passed."
      );
    }
  },
  async createRoutineProposalsBatch(inputs) {
    const c = client();
    const { data, error } = await c.from("routine_proposals").insert(inputs).select();
    if (!error) return data;

    // PGRST204 means PostgREST has no such column — the Phase 52 (batch_id) or
    // Phase 62 (scheduled_date) or Phase 71 (staff_id) migration hasn't been
    // applied. Filing proposals
    // worked before those phases and must keep working, so retry without the
    // optional columns. The Approval Queue falls back to grouping by
    // pet + title + created-minute, and to open-ended scheduling, for exactly
    // these rows.
    if (error.code !== "PGRST204") throw error;
    const withoutOptional = inputs.map((input) => {
      const rest = { ...input };
      delete rest.batch_id;
      delete rest.scheduled_date;
      delete rest.staff_id;
      return rest;
    });
    const { data: legacyData, error: legacyError } = await c
      .from("routine_proposals")
      .insert(withoutOptional)
      .select();
    if (legacyError) throw legacyError;
    return legacyData;
  },
  async setRoutineProposalsStatus(ids, status) {
    const { data, error } = await client()
      .from("routine_proposals")
      .update({ status })
      .in("id", ids)
      .select();
    if (error) throw error;
    return data;
  },
  async setRoutineProposalStatus(id, status) {
    const { data, error } = await client()
      .from("routine_proposals")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async listHouseholdTasks(from, to, today) {
    // Still never the whole table — but one day is no longer enough to render
    // one day (Phase 100). Three narrow reads, deliberately separate rather
    // than one clever .or(): each is individually obvious and individually
    // indexed, and the two extra round trips are parallel.
    const household = getActiveHouseholdId();
    const base = () =>
      client().from("household_tasks").select("*").eq("household_id", household);
    // Today on screen means the rollover applies — and a repeat's missed day
    // (Phase 126) can be up to a month back, so that is how far the repeat
    // reads below have to reach.
    const showsToday = from <= today && today <= to;
    const rolloverFloor = rolloverFloorFor(today);
    // A repeat every 3 months or every year (migrations/137) can owe a day
    // from further back still, so with today on screen the repeats read
    // reaches back a year. Templates are few; their written days are read
    // that far back only for the long repeats, below.
    const longFloor = longRepeatFloorFor(today);
    const repeatsFrom = showsToday && longFloor < from ? longFloor : from;

    const [onDay, templates, carriedOver, recentOccurrences] = await Promise.all([
      // 1. Rows that belong to these days outright: one-offs, a template's own
      //    first occurrence, and any occurrence already claimed or finished.
      base()
        .gte("due_date", from)
        .lte("due_date", to)
        // Anytime (null due_time) first, then clock order — the order every
        // list sorts into anyway (compareOccurrences, Phase 112); matching it
        // here just means a row is never briefly out of place.
        .order("due_time", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true }),

      // 2. Repeats that could reach these days. Started by the last of them,
      //    and either open-ended or still running on the first. Whether one
      //    actually lands on a given day is a question for occursOn, not for
      //    Postgres.
      //    With today on screen this also takes repeats that ended within the
      //    last year: one may still owe its final, missed day.
      base()
        .neq("recurrence", "none")
        .lte("due_date", to)
        .or(`recurrence_until.is.null,recurrence_until.gte.${repeatsFrom}`),

      // 3. The rollover: anything still pending from before today, however
      //    old (Phase 113 removed the 30-day floor), and only when today is
      //    on screen — browsing an earlier day should show that day, not
      //    everything since. The cap is a backstop against a household that
      //    has stopped closing chores, not a cut-off anyone should meet.
      showsToday
        ? base()
            .eq("status", "pending")
            .lt("due_date", today)
            .order("due_date", { ascending: true })
            .limit(200)
        : Promise.resolve({ data: [] as HouseholdTask[], error: null }),

      // 4. The last month's written occurrences of repeats, whatever their
      //    status (Phase 126). Not shown for themselves: they are how
      //    expandChores knows a repeat's previous day was done or called off,
      //    rather than missed — without them every repeat finished last
      //    Saturday would come back on Sunday as overdue.
      showsToday
        ? base()
            .not("parent_task_id", "is", null)
            .gte("due_date", rolloverFloor)
            .lt("due_date", today)
        : Promise.resolve({ data: [] as HouseholdTask[], error: null }),
    ]);

    for (const result of [onDay, templates, carriedOver, recentOccurrences]) {
      if (result.error) throw result.error;
    }

    // 5. The long repeats' written days from before the last month
    //    (migrations/137): without them a yearly bill paid in August would be
    //    shown as missed again from September. Only when there are any.
    const longIds = showsToday
      ? (templates.data ?? []).filter((t) => longestGapDays(t) > LONGEST_REPEAT_GAP_DAYS).map((t) => t.id)
      : [];
    let olderOccurrences: HouseholdTask[] = [];
    if (longIds.length > 0) {
      const older = await base()
        .in("parent_task_id", longIds)
        .gte("due_date", longFloor)
        .lt("due_date", rolloverFloor);
      if (older.error) throw older.error;
      olderOccurrences = older.data ?? [];
    }

    // Deduplicated by id: a template that started today is returned by the
    // first two queries, and a pending one-off from last week by the first and
    // third. expandChores decides what each row means for the date on screen.
    const byId = new Map<string, HouseholdTask>();
    for (const row of [
      ...(onDay.data ?? []),
      ...(templates.data ?? []),
      ...(carriedOver.data ?? []),
      ...(recentOccurrences.data ?? []),
      ...olderOccurrences,
    ]) {
      byId.set(row.id, row);
    }
    return [...byId.values()];
  },
  async listWrittenOccurrences(from, to) {
    const { data, error } = await client()
      .from("household_tasks")
      .select("*")
      .eq("household_id", getActiveHouseholdId())
      .not("parent_task_id", "is", null)
      .gte("due_date", from)
      .lte("due_date", to);
    if (error) throw error;
    return data ?? [];
  },
  async listSetUpChores(today) {
    // Two narrow reads, like listHouseholdTasks: the repeats that haven't
    // ended, and the one-offs still to do. A row with no recurrence is a
    // one-off (migrations/097 has no CHECK); the client re-checks every row
    // with isSetUp, so reading a little wide is harmless.
    const household = getActiveHouseholdId();
    const base = () =>
      client()
        .from("household_tasks")
        .select("*")
        .eq("household_id", household)
        .is("parent_task_id", null)
        .neq("status", "cancelled");
    const [repeats, oneOffs] = await Promise.all([
      base()
        .neq("recurrence", "none")
        .or(`recurrence_until.is.null,recurrence_until.gte.${today}`),
      base()
        .or("recurrence.is.null,recurrence.eq.none")
        .neq("status", "completed")
        .gte("due_date", today),
    ]);
    if (repeats.error) throw repeats.error;
    if (oneOffs.error) throw oneOffs.error;
    const byId = new Map<string, HouseholdTask>();
    for (const row of [...(repeats.data ?? []), ...(oneOffs.data ?? [])]) byId.set(row.id, row);
    return [...byId.values()];
  },
  async updateHouseholdTask(id, patch) {
    const { data, error } = await client()
      .from("household_tasks")
      .update(patch)
      .eq("id", id)
      .select();
    if (error) throw error;
    // Same reasoning as updateHouseholdTaskStatus: an RLS-filtered update is a
    // 200 with no rows, which would otherwise read as success.
    if (!data || data.length === 0) {
      throw new Error("Chore was not updated — it may belong to another household.");
    }
    return data[0];
  },
  async advanceChoreStart(id, fromDate, toDate) {
    // One conditional update, so a first day finished on another phone after
    // the editor opened is never moved to the next day with its photos and
    // its author (Codex review, PR #1).
    const { data, error } = await client()
      .from("household_tasks")
      .update({ due_date: toDate })
      .eq("id", id)
      .eq("due_date", fromDate)
      .eq("status", "pending")
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },
  async skipChoreOccurrence(id) {
    // Conditional for the same reason as advanceChoreStart: the editor's copy
    // of the row can be older than a completion saved on a staff phone, and
    // an unconditional cancel would wipe that completion's author and photos.
    // A pending row has none of those to clear.
    const { data, error } = await client()
      .from("household_tasks")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "pending")
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },
  async deleteHouseholdTask(id) {
    // .select() for the same reason: without a DELETE policy this returns 200
    // and zero rows, which is exactly how this failed silently before
    // migrations/097 added one.
    const { data, error } = await client()
      .from("household_tasks")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("Chore was not deleted — the delete policy may be missing.");
    }
  },
  async materialiseChoreOccurrence(templateId, date, assignedTo) {
    const { data: template, error: readError, status: readStatus } = await client()
      .from("household_tasks")
      .select("*")
      .eq("id", templateId)
      .single();
    if (readError) throw withStatus(readError, readStatus);

    const { data, error, status: insertStatus } = await client()
      .from("household_tasks")
      .insert({
        household_id: template.household_id,
        parent_task_id: template.id,
        title: template.title,
        notes: template.notes,
        category: template.category,
        assigned_to: assignedTo === undefined ? template.assigned_to : assignedTo,
        due_date: date,
        due_time: template.due_time,
        requires_supervision: template.requires_supervision ?? false,
        location_id: template.location_id ?? null,
        // The part of the room (migrations/129). Copied, or 128's guard
        // refuses a staff phone's copy; sent only once the column exists.
        ...("spot" in template ? { spot: template.spot ?? null } : {}),
        // A visit's day carries its repair (migrations/130's guard checks it).
        ...("repair_id" in template ? { repair_id: template.repair_id ?? null } : {}),
        // The occurrence is a one-off: the repeat belongs to the template, and
        // copying it here would make every completed Tuesday a template of its
        // own, each generating its own infinite series.
        recurrence: "none",
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      // 23505 is the (parent_task_id, due_date) unique index from
      // migrations/097: another phone materialised this same occurrence first.
      // That is a race resolved, not a failure — read back what they wrote.
      if (error.code === "23505") {
        const { data: existing, error: raceError } = await client()
          .from("household_tasks")
          .select("*")
          .eq("parent_task_id", templateId)
          .eq("due_date", date)
          .single();
        if (raceError) throw raceError;
        return existing;
      }
      throw withStatus(error, insertStatus);
    }
    return data;
  },
  async createHouseholdTask(input) {
    const [task] = await supabaseProvider.createHouseholdTasks([input]);
    return task;
  },
  async listRepairs() {
    const household = getActiveHouseholdId();
    return allRows((from, to) =>
      client()
        .from("repairs")
        .select("*")
        .eq("household_id", household)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );
  },
  async listRepairVisits() {
    const household = getActiveHouseholdId();
    return allRows((from, to) =>
      client()
        .from("household_tasks")
        .select("*")
        .eq("household_id", household)
        .not("repair_id", "is", null)
        .order("due_date", { ascending: true })
        .order("id")
        .range(from, to)
    );
  },
  async createRepair(input) {
    const { data, error } = await client()
      .from("repairs")
      .insert({
        // A walk-in's "Baru" names its repair on the phone (Phase 174).
        ...(input.id ? { id: input.id } : {}),
        household_id: getActiveHouseholdId(),
        title: input.title,
        details: input.details ?? null,
        location_id: input.location_id ?? null,
        spot: input.spot ?? null,
        photo_url: input.photo_url ?? null,
        urgent: input.urgent ?? false,
        status: input.status,
        reported_by_staff: input.reported_by_staff ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateRepair(id, patch) {
    const { data, error } = await client().from("repairs").update(patch).eq("id", id).select();
    if (error) throw error;
    // An RLS-filtered update is a 200 with no rows (a staff phone, or another household).
    if (!data || data.length === 0) throw new Error("Repair was not updated.");
    return data[0];
  },
  async deleteRepair(id) {
    const { data, error } = await client().from("repairs").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Repair was not deleted.");
  },
  async getRepairCost(repairId) {
    const { data, error } = await client().from("repair_costs").select("*").eq("repair_id", repairId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async saveRepairCost(repairId, cost) {
    const { data, error } = await client()
      .from("repair_costs")
      .upsert({ repair_id: repairId, household_id: getActiveHouseholdId(), ...cost }, { onConflict: "repair_id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async uploadReceipt(file, folder) {
    // <household>/<folder>/…: the bucket's policies read the household from
    // the path and let only its owners in (migrations/131).
    const ext = extensionFor(file);
    const path = `${getActiveHouseholdId()}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await client().storage.from(RECEIPTS_BUCKET).upload(path, file, { contentType: file.type });
    if (error) throw error;
    return client().storage.from(RECEIPTS_BUCKET).getPublicUrl(path).data.publicUrl;
  },
  async listBillPayments() {
    const { data, error } = await client()
      .from("bill_payments")
      .select("*")
      .eq("household_id", getActiveHouseholdId())
      .order("paid_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return data ?? [];
  },
  async saveBillPayment(taskId, payment) {
    const { data, error } = await client()
      .from("bill_payments")
      .upsert({ task_id: taskId, household_id: getActiveHouseholdId(), ...payment }, { onConflict: "task_id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async reopenBillDay(taskId) {
    const { data, error, status } = await client().rpc("reopen_bill_day", { p_task_id: taskId });
    if (error) throw withStatus(error, status);
    return data as { task: HouseholdTask; payment: BillPayment | null };
  },
  async deleteBillPayment(taskId) {
    const { data, error } = await client().from("bill_payments").delete().eq("task_id", taskId).select();
    if (error) throw error;
    return data?.[0] ?? null;
  },
  async deleteReceipt(url) {
    const marker = `/object/public/${RECEIPTS_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const { error } = await client()
      .storage.from(RECEIPTS_BUCKET)
      .remove([decodeURIComponent(url.slice(idx + marker.length))]);
    if (error) throw error;
  },
  async listRepairWalkIns() {
    const household = getActiveHouseholdId();
    return allRows((from, to) =>
      client()
        .from("repair_visits")
        .select("*")
        .eq("household_id", household)
        .order("arrived_at", { ascending: true })
        .order("id")
        .range(from, to)
    );
  },
  async listRepairSupervision(since) {
    const household = getActiveHouseholdId();
    return allRows((from, to) =>
      client()
        .from("repair_supervision")
        .select("*")
        .eq("household_id", household)
        .or(`ended_at.is.null,ended_at.gte.${since}`)
        .order("started_at", { ascending: true })
        .order("id")
        .range(from, to)
    );
  },
  async createRepairWalkIn(input) {
    const { data, error } = await client()
      .from("repair_visits")
      .insert({ ...input, household_id: getActiveHouseholdId() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async finishRepairWalkIn(id, finish) {
    const { data, error } = await client().from("repair_visits").update(finish).eq("id", id).select();
    if (error) throw error;
    // An RLS-filtered update is a 200 with no rows (the visit is gone).
    if (!data || data.length === 0) throw new Error("Walk-in was not finished.");
    return data[0];
  },
  async reopenRepairWalkIn(id) {
    const { data, error } = await client()
      .from("repair_visits")
      .update({ after_photo_url: null, left_phone_at: null, outcome: null, note: null })
      .eq("id", id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Walk-in was not reopened.");
    return data[0];
  },
  async deleteRepairWalkIn(id) {
    const { data, error } = await client().from("repair_visits").delete().eq("id", id).select("id");
    if (error) throw error;
    return !!data && data.length > 0;
  },
  async handOverSupervision(input) {
    const { data, error } = await client()
      .from("repair_supervision")
      .insert({ ...input, household_id: getActiveHouseholdId() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async listRepairNotes() {
    const household = getActiveHouseholdId();
    return allRows((from, to) =>
      client()
        .from("repair_notes")
        .select("*")
        .eq("household_id", household)
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to)
    );
  },
  async addRepairNote(note) {
    const { data, error } = await client()
      .from("repair_notes")
      .insert({
        household_id: getActiveHouseholdId(),
        repair_id: note.repair_id,
        body: note.body,
        photo_url: note.photo_url ?? null,
        staff_id: note.staff_id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async deleteRepairNote(id) {
    const { data, error } = await client().from("repair_notes").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Note was not deleted.");
  },
  async listTaskExceptions(since) {
    const household = getActiveHouseholdId();
    return allRows((from, to) =>
      client()
        .from("task_exceptions")
        .select("*")
        .eq("household_id", household)
        .gte("occurs_on", since)
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to)
    );
  },
  async createTaskException(input) {
    const { data, error } = await client()
      .from("task_exceptions")
      .insert({ ...input, household_id: getActiveHouseholdId() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async deleteTaskException(id) {
    // An RLS-filtered delete succeeds with no rows (past the 5 minutes):
    // count what actually went.
    const { data, error } = await client().from("task_exceptions").delete().eq("id", id).select("id");
    if (error) throw error;
    return !!data && data.length > 0;
  },
  async getNotificationPrefs() {
    const { data, error } = await client().rpc("my_notification_prefs");
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as NotificationPrefs | undefined;
    return row ?? { evening_summary_hour: 19, staff_request_pushes: true };
  },
  async setNotificationPrefs(prefs) {
    const { data, error } = await client().rpc("set_my_notification_prefs", {
      p_hour: prefs.evening_summary_hour,
      p_requests: prefs.staff_request_pushes,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as NotificationPrefs | undefined;
    return row ?? prefs;
  },
  async requestsPushOn() {
    const { data, error } = await client().rpc("household_requests_push_on", {
      p_household_id: getActiveHouseholdId(),
    });
    if (error) throw error;
    return data === true;
  },
  async createHouseholdTasks(inputs) {
    const household_id = getActiveHouseholdId();
    // One insert, so several rooms at once are saved together or not at all.
    const { data, error } = await client()
      .from("household_tasks")
      .insert(inputs.map((input) => taskRow(household_id, input)))
      .select();
    if (error) throw error;
    if (!data || data.length !== inputs.length) throw new Error("Not every chore was saved.");
    return data;
  },
  async updateHouseholdTaskStatus(id, status, patch) {
    // completed_at is written here rather than left to a default: a chore can
    // only be completed, and stamping the clock in the same statement as the
    // flip means there is no window where a chore is done at no time. Moving
    // back to pending clears the whole completion — author, clock and proof —
    // because a half-cleared chore would show as open while still crediting
    // someone for it.
    const completing = status === "completed";
    const completedAt = completing ? (patch?.completed_at ?? new Date().toISOString()) : null;
    const completedBy = completing ? (patch?.completed_by ?? null) : null;
    let query = client()
      .from("household_tasks")
      .update({
        status,
        completed_at: completedAt,
        completed_by: completedBy,
        photo_url: completing ? (patch?.photo_url ?? null) : null,
        before_photo_url: completing ? (patch?.before_photo_url ?? null) : null,
        after_photo_url: completing ? (patch?.after_photo_url ?? null) : null,
      })
      .eq("id", id);
    // The queued finish (audit M4): never over a newer state.
    const guarded = completing && !!patch?.onlyIfPending;
    if (guarded) query = query.eq("status", "pending");
    const { data, error, status: httpStatus } = await query.select();
    if (error) throw withStatus(error, httpStatus);
    if (guarded && (!data || data.length === 0)) {
      const { data: current, error: readError } = await client()
        .from("household_tasks")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (readError) throw readError;
      if (current?.status === "completed") {
        // This finish's own earlier try, whose reply was lost: its photos
        // (unique per upload) are on the row, or its author and time are.
        const ownPhoto =
          (!!patch?.after_photo_url && current.after_photo_url === patch.after_photo_url) ||
          (!!patch?.before_photo_url && current.before_photo_url === patch.before_photo_url);
        const same =
          ownPhoto ||
          (current.completed_by === completedBy &&
            !!current.completed_at &&
            new Date(current.completed_at).getTime() === new Date(completedAt!).getTime());
        if (same) return current;
        throw new ChoreAlreadySettledError("completed");
      }
      if (current?.status === "cancelled") throw new ChoreAlreadySettledError("cancelled");
    }
    // .select() so an RLS-filtered update (200 with zero rows) surfaces as a
    // failure instead of a chore that silently never closed — same reasoning
    // as setStaffPin.
    if (!data || data.length === 0) {
      throw new Error(
        "Chore was not updated — the household_tasks update policy is missing."
      );
    }
    return data[0];
  },
  async claimHouseholdTask(id, staffId) {
    // `is("assigned_to", null)` is the whole point of this being its own call
    // rather than a generic update: two people tapping "Ambil Tugas" on the
    // same chore within a second of each other both send a claim, and this
    // makes the second one affect zero rows instead of quietly stealing it.
    const { data, error } = await client()
      .from("household_tasks")
      .update({ assigned_to: staffId })
      .eq("id", id)
      .is("assigned_to", null)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("Chore was already claimed by someone else.");
    }
    return data[0];
  },
  async getStaffWorkload(from, to) {
    const { data, error } = await client().rpc("staff_workload", {
      p_household_id: getActiveHouseholdId(),
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      staffId: row.staff_id,
      name: row.name,
      totalCompleted: row.total_completed,
      petsCompleted: row.pets_completed,
      choresCompleted: row.chores_completed,
    }));
  },
  async listStaffProfiles() {
    // By name, not created_at: the seeded rows were inserted in one statement
    // and share a timestamp to the microsecond, so ordering by it put the list
    // in a different order on different loads.
    const list = (columns: string) =>
      client()
        .from("staff_profiles")
        // Named columns, not `*`: the pin column is revoked from every client
        // role (migrations/096), and a star select would be refused outright.
        .select(columns)
        .eq("household_id", getActiveHouseholdId())
        .order("name")
        .returns<StaffProfile[]>();
    // 42703 no such column, 42501 not granted: that migration is not in yet,
    // so try the next-poorest column set. Any other error is real and thrown.
    for (const columns of STAFF_COLUMN_SETS) {
      const { data, error } = await list(columns);
      if (!error) return data;
      if (error.code !== "42703" && error.code !== "42501") throw error;
    }
    throw new Error("Could not read the roster with any known column set");
  },
  async listLeaveRequests(sinceDate) {
    const { data, error } = await client()
      .from("leave_requests")
      .select("*")
      .eq("household_id", getActiveHouseholdId())
      .gte("end_date", sinceDate)
      .order("start_date");
    if (error) throw error;
    return data;
  },
  async getLeaveRequest(id) {
    const { data, error } = await client().from("leave_requests").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },
  async createLeaveRequest(input) {
    const { data, error } = await client()
      .from("leave_requests")
      .insert({ ...input, household_id: getActiveHouseholdId() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async decideLeaveRequest(id, decision) {
    const {
      data: { session },
    } = await client().auth.getSession();
    const { data, error } = await client()
      .from("leave_requests")
      .update({
        status: decision.status,
        fallback_action: decision.status === "approved" ? decision.fallback_action : null,
        fallback_assignee_id:
          decision.status === "approved" && decision.fallback_action === "reassign"
            ? decision.fallback_assignee_id
            : null,
        decided_by: session?.user.id ?? null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async endLeaveEarly(id, today) {
    const { data, error } = await client().rpc("end_leave_early", { p_id: id, p_today: today });
    if (error) throw error;
    return data;
  },
  async ensureMyMemberProfile(householdId) {
    const { data, error } = await client().rpc("ensure_my_member_profile", {
      p_household_id: householdId,
    });
    if (error) {
      // PGRST202: the function does not exist yet (migrations/106 not
      // applied). Nobody to be, which leaves admins as they were before.
      if (error.code === "PGRST202") return null;
      throw error;
    }
    return data?.[0] ?? null;
  },
  async listHouseholdLocations() {
    const { data, error } = await client()
      .from("household_locations")
      .select("*")
      .eq("household_id", getActiveHouseholdId())
      .order("name");
    if (error) throw error;
    // Floors and rooms in their order, then by name (sort_order arrives with
    // migrations/129; before it every row reads as 0).
    return [...data].sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
  },
  async createHouseholdLocation(name, options) {
    const household_id = getActiveHouseholdId();
    const parentId = options?.parentId ?? null;
    const row: { household_id: string; name: string; kind?: "room" | "floor"; parent_id?: string | null } = {
      household_id,
      name,
    };
    // Only sent when asked for, so a database before migrations/129 still works.
    if (options?.kind) row.kind = options.kind;
    if (parentId) row.parent_id = parentId;
    const { data, error } = await client().from("household_locations").insert(row).select().single();
    if (!error) return data;
    // 23505: the name is already on that floor (migrations/105, 129), perhaps
    // added from another phone. Use it.
    if (error.code === "23505") {
      const { data: rooms, error: readError } = await client()
        .from("household_locations")
        .select("*")
        .eq("household_id", household_id);
      if (readError) throw readError;
      const key = name.trim().toLowerCase();
      const existing = rooms.find(
        (room) => room.name.trim().toLowerCase() === key && (room.parent_id ?? null) === parentId
      );
      // Only the same kind of place: a floor asked for under the name of a
      // room (or the other way round) is a clash, not a success (Codex, #34).
      if (existing && (existing.kind ?? "room") === (options?.kind ?? "room")) return existing;
    }
    throw error;
  },
  async updateHouseholdLocation(id, patch) {
    const { data, error } = await client()
      .from("household_locations")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async deleteHouseholdLocation(id) {
    // .select() so a delete RLS filtered to nothing is an error, not success.
    const { data, error } = await client().from("household_locations").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Room not deleted");
  },
  async organiseRooms(plan) {
    const { data, error } = await client().rpc("organise_rooms", { p_plan: plan });
    if (error) throw error;
    return (data as { moved?: OrganiseRoomsMoved[] } | null)?.moved ?? [];
  },
  async createStaffProfile(name) {
    const { data, error } = await client()
      .from("staff_profiles")
      .insert({ name, household_id: getActiveHouseholdId() })
      .select(STAFF_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },
  async archiveStaffProfile(id) {
    // Through the function, not the table: archiving also revokes the PIN and
    // releases this person's unfinished chores, and all three have to happen
    // together or the household is left worse off than before
    // (migrations/109).
    const { data, error } = await client().rpc("archive_staff_profile", { p_staff_id: id });
    if (error) throw error;
    return data;
  },
  async restoreStaffProfile(id) {
    const { data, error } = await client().rpc("restore_staff_profile", { p_staff_id: id });
    if (error) throw error;
    return data;
  },
  async setStaffPin(id, pin) {
    // Through the function, not the table: `pin` is write-protected as well as
    // read-protected, and the hashing happens inside (migrations/095). It
    // raises rather than quietly updating nothing when the staff member is not
    // in this household.
    const { error } = await client().rpc("set_staff_pin", { p_staff_id: id, p_pin: pin });
    if (error) throw error;
  },
  async verifyStaffPin(id, pin) {
    const { data, error } = await client().rpc("verify_staff_pin", {
      p_staff_id: id,
      p_pin: pin,
    });
    if (error) throw error;
    return data === true;
  },
  async checkStaffPin(id, pin) {
    const { data, error } = await client().rpc("check_staff_pin", { p_staff_id: id, p_pin: pin });
    // PGRST202: no such function — migrations/115 is not in yet, so ask the
    // old way and say only right or wrong.
    if (error?.code === "PGRST202") {
      return (await this.verifyStaffPin(id, pin))
        ? { status: "ok" }
        : { status: "wrong_pin", attempts_left: -1 };
    }
    if (error) throw error;
    return data as unknown as PinCheck;
  },
  async houseCodeRoster(code) {
    const { data, error } = await client().rpc("house_code_roster", { p_code: code });
    if (error) {
      if (error.message?.includes("too_many_attempts")) throw new Error("too_many_attempts");
      throw error;
    }
    return (data ?? []) as HouseCodePerson[];
  },
  async signInWithHouseCode(code, staffId, pin) {
    const { data, error } = await client().rpc("sign_in_with_house_code", {
      p_code: code,
      p_staff_id: staffId,
      p_pin: pin,
    });
    if (error) throw error;
    return data as unknown as HouseCodeSignIn;
  },
  async claimStaffWithHouseCode(code, staffId, pin, claim) {
    const { data, error } = await client().rpc("claim_staff_with_house_code", {
      p_code: code,
      p_staff_id: staffId,
      p_new_pin: pin,
      p_claim: claim ?? "",
    });
    if (error) throw error;
    return data as unknown as HouseCodeClaim;
  },
  async getHouseCode() {
    const { data, error } = await client().rpc("my_house_code", {
      p_household_id: getActiveHouseholdId(),
    });
    if (error) throw error;
    return (data as string | null) ?? null;
  },
  async rotateHouseCode() {
    const { data, error } = await client().rpc("rotate_house_code", {
      p_household_id: getActiveHouseholdId(),
    });
    if (error) throw error;
    return data as string;
  },
  async listLinkedPhones() {
    const { data, error } = await client().rpc("list_linked_phones", {
      p_household_id: getActiveHouseholdId(),
    });
    if (error) throw error;
    return (data ?? []) as LinkedPhone[];
  },
  async hasFinishedChore() {
    const { data, error } = await client()
      .from("household_tasks")
      .select("id")
      .eq("household_id", getActiveHouseholdId())
      .eq("status", "completed")
      .limit(1);
    if (error) throw error;
    return (data ?? []).length > 0;
  },
  async removeLinkedPhone(id) {
    const { data, error } = await client().rpc("remove_linked_phone", {
      p_household_id: getActiveHouseholdId(),
      p_device_id: id,
    });
    if (error) throw error;
    return data === true;
  },
};

/** A new chore as household_tasks takes it. */
function taskRow(household_id: string, input: CreateHouseholdTaskInput) {
  return {
    household_id,
    title: input.title,
    category: input.category,
    assigned_to: input.assigned_to ?? null,
    due_date: input.due_date,
    due_time: input.due_time ?? null,
    notes: input.notes ?? null,
    recurrence: input.recurrence ?? "none",
    recurrence_until: input.recurrence_until ?? null,
    requires_supervision: input.requires_supervision ?? false,
    location_id: input.location_id ?? null,
    // Only when given: a database before migrations/129 has no spot column.
    ...(input.spot !== undefined ? { spot: input.spot } : {}),
    // Likewise repair_id (migrations/130).
    ...(input.repair_id ? { repair_id: input.repair_id } : {}),
    // And the repeat interval and reminder (migrations/137).
    ...(input.recurrence_interval !== undefined ? { recurrence_interval: input.recurrence_interval ?? 1 } : {}),
    ...(input.remind_days_before !== undefined ? { remind_days_before: input.remind_days_before } : {}),
  };
}
