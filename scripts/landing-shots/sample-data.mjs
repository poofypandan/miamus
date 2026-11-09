/**
 * Made-up sample data for the landing page's screenshots
 * (scripts/capture-landing-shots.mjs). Loaded into mock mode's local
 * database in the browser; nothing reaches Supabase. Never a real household:
 * staff Sari and Budi, pets Mochi and Bruno, rooms Teras and Dapur
 * (docs/landing-page-proposal.md, L7).
 *
 * `state` picks the moment shown: "pending" (Sari hasn't mopped the terrace
 * yet) or "done" (she has, with her before and after photos).
 */

// The household mock mode uses (src/lib/tenant.ts, DEFAULT_HOUSEHOLD_ID).
export const HOUSEHOLD_ID = "975f0914-4d0d-43ad-8dee-a967d9bd10cd";

export const SARI = "22222222-0000-4000-8000-000000000001";
export const BUDI = "22222222-0000-4000-8000-000000000002";
const MOCHI = "11111111-0000-4000-8000-000000000001";
const BRUNO = "11111111-0000-4000-8000-000000000002";
const TERAS = "33333333-0000-4000-8000-000000000001";
const DAPUR = "33333333-0000-4000-8000-000000000002";

/** "YYYY-MM-DD" for `offset` days from `today` (a Jakarta date). */
function day(today, offset) {
  const d = new Date(`${today}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** An ISO timestamp at a Jakarta wall-clock time. */
function at(today, offset, time) {
  return new Date(`${day(today, offset)}T${time}:00+07:00`).toISOString();
}

/**
 * @param {{ today: string, state: "pending" | "done", beforePhoto: string, afterPhoto: string }} options
 */
export function sampleDb({ today, state, beforePhoto, afterPhoto }) {
  const old = at(today, -30, "08:00");
  let n = 0;
  const id = (prefix) => `${prefix}-0000-4000-8000-${String(++n).padStart(12, "0")}`;

  const routine = (entity, title, time) => ({
    id: id("44444444"),
    entity_id: entity,
    title,
    module: "pet",
    frequency_type: "fixed_time",
    interval_hours: null,
    fixed_times: [time],
    start_time: null,
    end_time: null,
    is_active: true,
    expires_at: null,
    created_at: old,
  });

  const mochiBreakfast = routine(MOCHI, "Sarapan", "07:00");
  const brunoBreakfast = routine(BRUNO, "Sarapan", "07:00");
  const mochiPotty = routine(MOCHI, "Pipis & Pup", "08:00");
  const schedules = [
    mochiBreakfast,
    brunoBreakfast,
    mochiPotty,
    routine(MOCHI, "Pipis & Pup", "12:00"),
    routine(MOCHI, "Makan Malam", "18:00"),
    routine(BRUNO, "Makan Malam", "18:00"),
  ];

  const log = (schedule, entity, time, staff) => ({
    id: id("66666666"),
    schedule_id: schedule.id,
    entity_id: entity,
    module: "pet",
    photo_url: null,
    notes: null,
    completed_at: at(today, 0, time),
    staff_id: staff,
    sub_type: "complete",
  });

  const chore = (title, extra) => ({
    id: id("55555555"),
    household_id: HOUSEHOLD_ID,
    title,
    notes: null,
    category: "cleaning",
    assigned_to: null,
    due_date: day(today, 0),
    due_time: null,
    status: "pending",
    completed_by: null,
    completed_at: null,
    photo_url: null,
    created_at: old,
    recurrence: "none",
    recurrence_until: null,
    parent_task_id: null,
    requires_supervision: false,
    before_photo_url: null,
    after_photo_url: null,
    location_id: null,
    ...extra,
  });

  // A daily chore keeps one template row; a finished day gets a row of its
  // own pointing at it (src/lib/chore-recurrence.ts), as the app writes it.
  const terrace = chore("Pel teras", {
    assigned_to: SARI,
    due_time: "09:00:00",
    recurrence: "daily",
    location_id: TERAS,
    due_date: day(today, -7),
  });
  const terraceToday =
    state === "done"
      ? [
          chore("Pel teras", {
            assigned_to: SARI,
            due_time: "09:00:00",
            location_id: TERAS,
            parent_task_id: terrace.id,
            status: "completed",
            completed_by: SARI,
            completed_at: at(today, 0, "08:12"),
            before_photo_url: beforePhoto,
            after_photo_url: afterPhoto,
            photo_url: afterPhoto,
          }),
        ]
      : [];

  return {
    entities: [
      { id: MOCHI, household_id: HOUSEHOLD_ID, entity_type: "pet", name: "Mochi", icon: null, metadata: { breed: "Shih Tzu" }, status: "home", created_at: old },
      { id: BRUNO, household_id: HOUSEHOLD_ID, entity_type: "pet", name: "Bruno", icon: null, metadata: { breed: "Golden Retriever" }, status: "home", created_at: old },
    ],
    schedules,
    logs: [
      log(mochiBreakfast, MOCHI, "07:04", BUDI),
      log(brunoBreakfast, BRUNO, "07:06", BUDI),
      log(mochiPotty, MOCHI, "08:02", SARI),
    ],
    medicalRecords: [],
    inventoryAlerts: [],
    routineProposals: [],
    inventoryItems: [],
    foodItems: [],
    inventoryAudits: [],
    staffProfiles: [
      { id: SARI, household_id: HOUSEHOLD_ID, name: "Sari", has_pin: true, created_at: old },
      { id: BUDI, household_id: HOUSEHOLD_ID, name: "Budi", has_pin: true, created_at: old },
    ],
    staffPins: { [SARI]: "1234", [BUDI]: "5678" },
    householdTasks: [
      terrace,
      ...terraceToday,
      chore("Cuci piring", { assigned_to: BUDI, location_id: DAPUR, due_time: "10:00:00", recurrence: "daily", due_date: day(today, -7) }),
      chore("Siram tanaman", { category: "cleaning", location_id: TERAS, due_time: "16:00:00" }),
    ],
    householdLocations: [
      { id: TERAS, household_id: HOUSEHOLD_ID, name: "Teras", created_at: old },
      { id: DAPUR, household_id: HOUSEHOLD_ID, name: "Dapur", created_at: old },
    ],
    leaveRequests: [],
    repairs: [],
    repairCosts: [],
    repairNotes: [],
  };
}
