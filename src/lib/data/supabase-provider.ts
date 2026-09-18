import { supabase } from "@/lib/supabase/client";
import type { InventoryAuditLog, InventoryAuditWithStaff } from "@/types/database";
import type { DataProvider } from "./types";

function client() {
  if (!supabase) throw new Error("Supabase client is not configured");
  return supabase;
}

const STORAGE_BUCKET = "household-logs";

// getPublicUrl() returns ".../storage/v1/object/public/<bucket>/<path>" — the
// storage API needs just <path> back to delete the object.
function extractStoragePath(url: string): string | null {
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

const INVENTORY_BUCKET = "inventory_audits";

// An audit plus its author's name, embedded through audited_by.
const AUDIT_COLUMNS = "*, staff_profiles(name)";
type AuditRow = InventoryAuditLog & { staff_profiles: { name: string } | null };

function flattenAudit({ staff_profiles, ...audit }: AuditRow): InventoryAuditWithStaff {
  return { ...audit, staff_name: staff_profiles?.name ?? null };
}

export const supabaseProvider: DataProvider = {
  async listEntities() {
    const { data, error } = await client().from("task_entities").select("*").order("created_at");
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
    const { data, error } = await client().from("task_entities").insert(input).select().single();
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
    const ext = file.type === "image/webp" ? "webp" : (file.name.split(".").pop() ?? "jpg");
    const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createInventoryAlert(input) {
    const { data, error } = await client()
      .from("inventory_alerts")
      .insert(input)
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
      .order("name");
    if (error) throw error;
    return data;
  },
  async createInventoryItem(input) {
    const { data, error } = await client()
      .from("inventory_items")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
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
    const ext = file.type === "image/webp" ? "webp" : (file.name.split(".").pop() ?? "jpg");
    const path = `${itemId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
        boxes_count: input.boxes_counted,
        loose_units_count: input.loose_units_counted,
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
  async listHouseholdTasks(dueDate) {
    // Scoped to one day rather than paged like task_logs: this table grows
    // without bound over months and no view ever wants more than the day it is
    // showing, so the date is the query, not a client-side filter.
    const { data, error } = await client()
      .from("household_tasks")
      .select("*")
      .eq("due_date", dueDate)
      // Timed chores first in clock order, then the "sometime today" ones —
      // nullsFirst: false is what puts a null due_time at the end rather than
      // at the top of the owner's list.
      .order("due_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },
  async createHouseholdTask(input) {
    const { data, error } = await client()
      .from("household_tasks")
      .insert({
        title: input.title,
        category: input.category,
        assigned_to: input.assigned_to ?? null,
        due_date: input.due_date,
        due_time: input.due_time ?? null,
        notes: input.notes ?? null,
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
  async listStaffProfiles() {
    // By name, not created_at: the seeded rows were inserted in one statement
    // and share a timestamp to the microsecond, so ordering by it put the list
    // in a different order on different loads.
    const { data, error } = await client()
      .from("staff_profiles")
      .select("*")
      .order("name");
    if (error) throw error;
    return data;
  },
  async createStaffProfile(name) {
    const { data, error } = await client()
      .from("staff_profiles")
      .insert({ name })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async setStaffPin(id, pin) {
    // .select() so an RLS-filtered update (200 with zero rows) surfaces as a
    // failure rather than a PIN that silently never saved — the staff member
    // would be locked into the setup screen with no idea why.
    const { data, error } = await client()
      .from("staff_profiles")
      .update({ pin })
      .eq("id", id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Staff profile not updated");
    return data[0];
  },
};
