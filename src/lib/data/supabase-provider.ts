import { supabase } from "@/lib/supabase/client";
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
    const { error } = await client().from("inventory_alerts").delete().eq("id", id);
    if (error) throw error;
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
    const { error } = await client().from("routine_proposals").delete().eq("id", id);
    if (error) throw error;
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
};
