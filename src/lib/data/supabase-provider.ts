import { supabase } from "@/lib/supabase/client";
import { getActiveHouseholdId } from "@/lib/tenant";
import type {
  HouseholdTask,
  InventoryAuditLog,
  InventoryAuditWithStaff,
  InventoryItem,
} from "@/types/database";
import type { DataProvider } from "./types";
import { rolloverFloorFor } from "@/lib/chore-recurrence";

function client() {
  if (!supabase) throw new Error("Supabase client is not configured");
  return supabase;
}

const STORAGE_BUCKET = "household-logs";

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
function extensionFor(file: File): string {
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  return file.name.split(".").pop() ?? "jpg";
}

// Everything on staff_profiles except `pin`, which no client role may select.
const STAFF_COLUMNS = "id, household_id, name, created_at, has_pin";

// An audit plus its author's name, embedded through audited_by.
const AUDIT_COLUMNS = "*, staff_profiles(name)";
type AuditRow = InventoryAuditLog & { staff_profiles: { name: string } | null };

function flattenAudit({ staff_profiles, ...audit }: AuditRow): InventoryAuditWithStaff {
  return { ...audit, staff_name: staff_profiles?.name ?? null };
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
    const rows = input.entries.map((entry) => ({
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
    const { data, error } = await client().from("task_logs").insert(rows).select();
    if (error) throw error;
    return data;
  },
  async deleteLog(id) {
    const { error } = await client().from("task_logs").delete().eq("id", id);
    if (error) throw error;
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
    const c = client();
    const ext = extensionFor(file);
    // Household first (Phase 90): the storage policies read the tenant out of
    // the object key, so an upload that skipped the prefix would be refused.
    const path = `${getActiveHouseholdId()}/${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await c.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { contentType: file.type });
    if (error) throw error;
    const { data } = c.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
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
  async adjustInventoryQuantity(id, delta) {
    // migrations/099. Returns the updated row; none at all means RLS hid it
    // (another household's id, or a row deleted under us).
    const { data, error } = await client()
      .rpc("adjust_inventory_quantity", { p_item_id: id, p_delta: delta })
      .select()
      .single();
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
    const repeatsFrom = showsToday && rolloverFloor < from ? rolloverFloor : from;

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
      //    last month: one may still owe its final, missed day.
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

    // Deduplicated by id: a template that started today is returned by the
    // first two queries, and a pending one-off from last week by the first and
    // third. expandChores decides what each row means for the date on screen.
    const byId = new Map<string, HouseholdTask>();
    for (const row of [
      ...(onDay.data ?? []),
      ...(templates.data ?? []),
      ...(carriedOver.data ?? []),
      ...(recentOccurrences.data ?? []),
    ]) {
      byId.set(row.id, row);
    }
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
  async materialiseChoreOccurrence(templateId, date) {
    const { data: template, error: readError } = await client()
      .from("household_tasks")
      .select("*")
      .eq("id", templateId)
      .single();
    if (readError) throw readError;

    const { data, error } = await client()
      .from("household_tasks")
      .insert({
        household_id: template.household_id,
        parent_task_id: template.id,
        title: template.title,
        notes: template.notes,
        category: template.category,
        assigned_to: template.assigned_to,
        due_date: date,
        due_time: template.due_time,
        requires_supervision: template.requires_supervision ?? false,
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
      throw error;
    }
    return data;
  },
  async createHouseholdTask(input) {
    const { data, error } = await client()
      .from("household_tasks")
      .insert({
        household_id: getActiveHouseholdId(),
        title: input.title,
        category: input.category,
        assigned_to: input.assigned_to ?? null,
        due_date: input.due_date,
        due_time: input.due_time ?? null,
        notes: input.notes ?? null,
        recurrence: input.recurrence ?? "none",
        recurrence_until: input.recurrence_until ?? null,
        requires_supervision: input.requires_supervision ?? false,
      })
      .select()
      .single();
    if (error) throw error;
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
    const { data, error } = await client()
      .from("household_tasks")
      .update({
        status,
        completed_at: completing ? new Date().toISOString() : null,
        completed_by: completing ? (patch?.completed_by ?? null) : null,
        photo_url: completing ? (patch?.photo_url ?? null) : null,
        before_photo_url: completing ? (patch?.before_photo_url ?? null) : null,
        after_photo_url: completing ? (patch?.after_photo_url ?? null) : null,
      })
      .eq("id", id)
      .select();
    if (error) throw error;
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
    const { data, error } = await client()
      .from("staff_profiles")
      // Named columns, not `*`: the pin column is revoked from every client
      // role (migrations/096), and a star select would be refused outright.
      .select(STAFF_COLUMNS)
      .eq("household_id", getActiveHouseholdId())
      .order("name");
    if (error) throw error;
    return data;
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
};
