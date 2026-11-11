export type EntityType = "pet" | "room" | "general";
export type Module = "pet" | "cleaning" | "laundry";
export type FrequencyType = "interval" | "fixed_time" | "weekly";
export type RecordType = "vaccine" | "vet" | "medication" | "weight";
// `medicine` and `treats` were retired from the picker in Phase 57 but stay in
// the union: the column has no CHECK constraint, so any historical or
// hand-entered row carrying them must still resolve to a label rather than
// rendering blank.
export type ItemType = "food" | "medicine" | "treats" | "shampoo" | "pee_pad" | "other";
export type ProposalStatus = "pending" | "approved" | "rejected";
// What a household chore is about (migrations/082). Distinct from Module and
// from ScheduleCategoryName: those describe work on a dog, these describe work
// on the house.
// "bill" (Phase 164, migrations/137): something the house pays on a date,
// usually an owner's own task. No database CHECK, so no migration was needed.
export type HouseholdTaskCategory = "cleaning" | "maintenance" | "errand" | "groceries" | "bill";
// "cancelled" is in the vocabulary but written by nothing yet — it is here so
// retiring a chore later needs no migration. Every read path must still handle
// it rather than assuming pending-or-completed.
export type HouseholdTaskStatus = "pending" | "completed" | "cancelled";
// How often a chore comes back (migrations/097). "none" is a one-off, which is
// every chore filed before Phase 100. A repeating chore stays a single row and
// is expanded for the date on screen — see lib/chore-recurrence.ts.
export type ChoreRecurrence = "none" | "daily" | "weekly" | "monthly";
export type AlertStatus = "pending" | "resolved";

// The tenant (migrations/086). One paying household; its people are
// household_members, its staff arrive through staff_invites.
export type Household = {
  id: string;
  name: string;
  // The Google account that created it. Null for Banyuwangi 11, which predates
  // sign-in entirely.
  owner_auth_id: string | null;
  created_at: string;
  // "Who lives here?" (Phase 162, migrations/133): null until answered, which
  // the app treats as pets on.
  has_pets: boolean | null;
  has_pets_set_at: string | null;
  has_pets_set_by: string | null;
  // The kitchen note for whoever cooks (Phase 170 PR C, migrations/153),
  // and the owner's one-time health-data OK. Written through set_kitchen_notes.
  kitchen_notes?: string | null;
  kitchen_notes_confirmed_at?: string | null;
  kitchen_notes_confirmed_by?: string | null;
};

export type HouseholdMember = {
  id: string;
  household_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

// A staff phone's own identity (migrations/089): an anonymous auth user bound
// to exactly one household. This is what makes RLS possible for devices that
// have no Google account.
export type DeviceSession = {
  id: string;
  user_id: string;
  household_id: string;
  created_at: string;
  last_seen_at: string;
  // Whose PIN last opened this phone (migrations/146).
  staff_id?: string | null;
};

// A co-owner's way in (migrations/091): redeems into household_members, so
// the person arrives with their own Google identity. StaffInvite is the same
// shape but redeems into device_sessions — a phone, not a person.
export type OwnerInvite = {
  id: string;
  household_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type StaffInvite = {
  id: string;
  household_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

// Plain `type` aliases, not `interface` — interfaces don't structurally
// satisfy `Record<string, unknown>`, which postgrest-js's GenericTable
// requires for Row/Insert/Update.
/** Where a dog physically is. Anything that is not a dog stays "home". */
export type EntityStatus = "home" | "admitted";

export type TaskEntity = {
  id: string;
  // The tenant (migrations/086). Always Banyuwangi 11 until Phase 86B.
  household_id: string;
  entity_type: EntityType;
  name: string;
  icon: string | null;
  metadata: Record<string, unknown>;
  // Optional because PostgREST omits it until the Phase 79 migration is
  // applied; absent reads as "home" everywhere (see lib/pets.ts).
  status?: EntityStatus | null;
  created_at: string;
};

export type MasterSchedule = {
  id: string;
  entity_id: string;
  title: string;
  module: Module;
  frequency_type: FrequencyType;
  interval_hours: number | null;
  fixed_times: string[] | null;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  // Phase 173 (migrations/144). Optional because PostgREST omits them until
  // the migration is applied, and old snapshots on phones lack them.
  /** What the routine is, from the Add routine sheet. Null: the old title rules. */
  kind?: RoutineKind | null;
  /** Shared by the rows made together for several pets (one row per pet). */
  routine_group_id?: string | null;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. Null: every day. */
  days_of_week?: number[] | null;
  /** Up to 120 characters, shown to staff as typed. */
  note?: string | null;
  /** The person it is for; null for anyone. */
  staff_id?: string | null;
  /** How staff prove it. Absent reads as "photo", the column's default. */
  proof?: RoutineProof | null;
  // Phase 173 PR C (migrations/150). Absent reads as off, the default.
  /** Push the staff at the routine's time if it isn't done yet (D7). */
  remind_staff?: boolean;
  /** Push every owner if it still isn't done 30 minutes after its time (D15). */
  alert_owners?: boolean;
};

/** Phase 173: the Add routine sheet's quick choices (lib/pet-routine-kinds). */
export type RoutineKind = "walk" | "lights" | "play" | "water" | "teeth" | "other";

/**
 * How staff prove a routine (Phase 173): one photo (the default, D6), a tick
 * with no photo, or three photos (start, arrived, back; D14), done at the third.
 */
export type RoutineProof = "photo" | "tick" | "three";

/**
 * Which part of a task a log records.
 *
 * Every ordinary task writes "complete". A vet visit is the exception: it is
 * logged in two halves, so the dog's whereabouts are known between them.
 * A three-photo routine (Phase 173, proof "three") is logged in three:
 * "check_in" at the start, "arrived" where the walk went, "check_out" back.
 */
export type LogSubType = "complete" | "check_in" | "check_out" | "admitted" | "arrived";

export type TaskLog = {
  id: string;
  schedule_id: string | null;
  entity_id: string;
  module: Module;
  photo_url: string | null;
  notes: string | null;
  completed_at: string;
  // Who filed this, as selected on their device (migrations/071). Null for
  // everything logged before staff had identities, and self-declared rather
  // than proven — see the note on StaffProfile.pin.
  staff_id?: string | null;
  // Optional because PostgREST omits it until the Phase 79 migration is
  // applied; absent reads as "complete".
  sub_type?: LogSubType | null;
  // When the save reached the database (migrations/144), set there whatever
  // the phone sends. Null for older rows; absent while still queued.
  received_at?: string | null;
  // The session that saved it, set by the database (migrations/146): only
  // that phone may undo it. Null for older rows; absent while still queued.
  created_by?: string | null;
};

export type MedicalRecord = {
  id: string;
  entity_id: string;
  record_type: RecordType;
  title: string;
  administered_at: string | null;
  next_due_date: string | null;
  document_photo_url: string | null;
  notes: string | null;
  // Weight logs only, in kg — null for every other record_type.
  value: number | null;
  created_at: string;
};

export type LeaveStatus = "pending" | "approved" | "rejected" | "ended_early";
export type LeaveFallbackAction = "reassign" | "unassign" | "pause";

/**
 * A request for days off, and — once an admin approves it — what happens to
 * that person's chores meanwhile (migrations/108, Phase 140). The triage
 * itself is applied where chores are expanded, in lib/leave.ts.
 */
export type LeaveRequest = {
  id: string;
  household_id: string;
  /** Whose leave: a roster row, which admins have too (migrations/106). */
  staff_id: string;
  start_date: string;
  end_date: string;
  status: LeaveStatus;
  fallback_action: LeaveFallbackAction | null;
  fallback_assignee_id: string | null;
  /** First day back, when they returned before end_date. */
  ended_on: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

export type StaffProfile = {
  id: string;
  // The tenant (migrations/086). Always Banyuwangi 11 until Phase 86B.
  household_id: string;
  name: string;
  // Whether a PIN has been chosen yet — the gate needs to tell "enter yours"
  // from "pick one". The PIN itself is a bcrypt hash in a column no client
  // role may read (migrations/095-096); it is reachable only through
  // verify_staff_pin and set_staff_pin.
  has_pin: boolean;
  created_at: string;
  /**
   * Set when this person is an admin — a Google account in household_members
   * — rather than someone who signs in by name and PIN (migrations/106,
   * Phase 139). Admins are on the roster so chores can be assigned to them.
   * Optional: absent until that migration is applied.
   */
  user_id?: string | null;
  /**
   * When this person was taken off the active roster, or null while they are
   * on it (migrations/109, Phase 141).
   *
   * Archived rather than deleted because task_logs.staff_id and
   * household_tasks.completed_by point here: removing the row would strip the
   * author off every job they ever finished. They keep their name on their
   * past work and drop out of everywhere forward-looking — the sign-in
   * screen, assignee pickers, the workload strip.
   *
   * Optional: absent until that migration is applied, which reads as active.
   */
  archived_at?: string | null;
};

// Note: unlike every other table here, this one's foreign key column is
// literally named `pet_id` (not `entity_id`) in the live database — it
// predates this app's polymorphic entity_id convention, so match it as-is
// rather than "fixing" it to entity_id (which 400s against the real table).
export type InventoryAlert = {
  id: string;
  // The tenant (migrations/086). Always Banyuwangi 11 until Phase 86B.
  household_id: string;
  // Null for a shared household item (floor cleaner, communal shampoo) that
  // isn't any one dog's. See migrations/049.
  pet_id: string | null;
  item_type: ItemType;
  note: string | null;
  // Predates `status`. Kept in sync by resolveInventoryAlert so older code
  // paths and any row written before Phase 50 still read correctly — see
  // lib/inventory-status.ts for how the two are reconciled.
  resolved: boolean;
  // Optional because PostgREST simply omits both fields until the Phase 50
  // migration has been applied.
  status?: AlertStatus | null;
  resolved_at?: string | null;
  // Who filed this, as selected on their device (migrations/071). Null for
  // everything logged before staff had identities, and self-declared rather
  // than proven — see the note on StaffProfile.pin.
  staff_id?: string | null;
  created_at: string;
};

// One product the household stocks (migrations/099, Phase 110). Low-stock
// reports (inventory_alerts) reference items by name rather than by id — a
// report is a note about a thing running low, and must survive the item being
// removed.

/** Which half of the inventory an item lives in. */
export type InventoryScope = "pet" | "home";

/** A shelf. Each scope has its own; the database pairs them (migrations/099). */
// Where things live in the house rather than an ERP taxonomy (Phase 110.1):
// the keys of the Phase 83 shelves, plus dog food split out of dog supplies.
export type PetInventoryCategory = "dog_food" | "dog_supplies" | "medicine";
export type HomeInventoryCategory = "fresh_food" | "pantry" | "household_supplies";
export type InventoryCategory = PetInventoryCategory | HomeInventoryCategory;

export type InventoryUnit =
  | "pcs"
  | "pack"
  | "box"
  | "bottle"
  | "roll"
  | "tube"
  | "kg"
  | "g"
  | "L"
  | "ml"
  // Kitchen units (Phase 170 PR A, migrations/148): the words Indonesian
  // kitchens use. sdm and sdt are recipe-only and never a stock unit.
  | "buah"
  | "butir"
  | "ikat"
  | "siung"
  | "lembar"
  | "batang"
  | "bungkus"
  | "sachet";

/** Where an item stands on the shopping list (migrations/122, Phase 154). */
export type StockStatus = "ok" | "low" | "out";

/** Where a food is kept (migrations/123, Phase 156). */
export type FoodPlace = "fridge" | "freezer" | "pantry" | "counter";

/** Where a food came from: cooked at home (leftovers), a gift, or bought. */
export type FoodSource = "home" | "gift" | "bought";

/** What happened to a food once it left the list. */
export type FoodOutcome = "eaten" | "given_away" | "thrown_away";

/**
 * Food in the house (migrations/123): a gift, leftovers, a cake. Listed while
 * `outcome` is null; finished rows stay 90 days without their photo.
 */
export type FoodItem = {
  id: string;
  household_id: string;
  /** Null when a photo says what it is (staff can log food with just a photo). */
  name: string | null;
  /** household-logs, <household>/food/...; deleted when the food is finished. */
  photo_url: string | null;
  kept_in: FoodPlace;
  /** YYYY-MM-DD, or null for no date. */
  expires_on: string | null;
  /** "Don't know" was the answer: owners see "Check the date" until one is set. */
  expiry_unknown: boolean;
  source: FoodSource | null;
  from_whom: string | null;
  return_container: boolean;
  /** Stamped by the server when the container is ticked returned. */
  container_returned_at: string | null;
  notes: string | null;
  /**
   * Optional portions left (Phase 170 PR A, D7; migrations/148): "Rendang ·
   * 3 portions"; "Ate 1 portion" counts down. Null = not counted, as before.
   */
  portions?: number | null;
  /** Who added it, as selected on their phone (self-declared, cf. 071). */
  added_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  outcome: FoodOutcome | null;
  /** Stamped by the server when an outcome is set. */
  finished_at: string | null;
  finished_by: string | null;
};

/** A recipe line's unit (migrations/151): the stock units plus sdm and sdt, never taken off stock. */
export type RecipeUnit = InventoryUnit | "sdm" | "sdt";

/**
 * A recipe (Phase 170 PR B, migrations/151). Owners write; every staff phone
 * reads. Written in English or Indonesian (`written_in`); staff phones read
 * Indonesian only, so an English recipe can carry an Indonesian version
 * (`name_id`, `steps_id`, and each line's `name_id`). No prices, ever.
 */
export type Recipe = {
  id: string;
  household_id: string;
  name: string;
  /** Portions the amounts are for (1–50). */
  servings: number;
  /** One text block, a step per line; null when there are none. */
  steps: string | null;
  written_in: "en" | "id";
  /** The Indonesian version for staff, when written in English. */
  name_id: string | null;
  steps_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** One ingredient line, in order (migrations/151). */
export type RecipeIngredient = {
  id: string;
  household_id: string;
  recipe_id: string;
  /** An item from the household's list; null for a free name, or once the item is deleted. */
  item_id: string | null;
  /** Kept even when linked, so a deleted item still reads. */
  name: string;
  /** The line's Indonesian name for staff (English recipes). */
  name_id: string | null;
  /** Null = to taste (secukupnya). */
  amount: number | null;
  unit: RecipeUnit | null;
  position: number;
};

/** A meal on the menu (migrations/153). */
export type MenuMeal = "breakfast" | "lunch" | "dinner";

/**
 * What cooking took off one tracked item (migrations/153), in the unit the
 * item had then: Undo converts it if an owner changed the unit since.
 */
export type CookedUse = { item_id: string; amount: number; unit?: InventoryUnit | null };

/**
 * One dish on a day (Phase 170 PR C, migrations/153). Owners plan; every
 * staff phone reads. cooked_* are written only by cook_menu_dish and
 * uncook_menu_dish. No prices, ever.
 */
export type MenuDish = {
  id: string;
  household_id: string;
  /** YYYY-MM-DD. */
  day: string;
  meal: MenuMeal;
  /** Null for a dish with just a name, or once its recipe is deleted. */
  recipe_id: string | null;
  title: string;
  /** Null for a dish without a recipe. */
  servings: number | null;
  notes: string | null;
  position: number;
  cooked_at: string | null;
  cooked_by: string | null;
  cooked_uses: CookedUse[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryItem = {
  id: string;
  // The tenant (migrations/086).
  household_id: string;
  scope: InventoryScope;
  name: string;
  category: InventoryCategory;
  /** On the shelf now, in `unit`. Fractional for kg, L and the like. */
  quantity: number;
  unit: InventoryUnit;
  /** At or below this, the item is low (see isLowStock). */
  min_threshold: number;
  /** Optional reference photo of the exact product, so the right brand is bought. */
  photo_url: string | null;
  created_at: string;
  variant: string | null;
  /** How often staff are asked to count it on the staff view's "Stok". */
  audit_frequency_days: number;
  last_audited_at: string | null;
  notes: string | null;
  /**
   * Enough, running low or out (migrations/122). Optional only because a
   * row cached by an older build lacks it; read it through stockStatus().
   */
  stock_status?: StockStatus;
  /** When the status last changed, by the server's clock. */
  stock_status_at?: string | null;
  /** Who changed it, as selected on their phone (self-declared, cf. 071). */
  stock_status_by?: string | null;
  /**
   * Kitchen amounts (Phase 170 PR A, migrations/148). An owner opts an item
   * in; `quantity` is then the amount left, in `unit`, and `min_threshold`
   * its "Running low at" (0 = none). The database derives the status from
   * them. Owner-only, like the unit and the low level.
   */
  track_amount?: boolean;
  /** When the tracked amount last changed, by the server's clock. Drives "about … · 3 weeks ago". */
  amount_set_at?: string | null;
  /** Who changed it, as selected on their phone (self-declared, cf. 071). */
  amount_set_by?: string | null;
  /** The last purchase's amount, in `unit`: the "How much did you buy?" pre-fill. */
  last_bought_amount?: number | null;
  /**
   * The shortfall "Add missing to Shopping" stored (Phase 170 PR C,
   * migrations/153), in `unit`: To buy reads "Chicken 500 g". Cleared when
   * bought or set back to Enough.
   */
  to_buy_amount?: number | null;
  // The Phase 83 box/loose ledger. Still in the table so a phone on the
  // previous build keeps working through the deploy; nothing reads them now.
  unit_type?: string;
  boxes_count?: number;
  loose_units_count?: number;
  units_per_box?: number;
};

// One physical stock check (migrations/083). Append-only: a recount is a new
// row, never an edit.
export type InventoryAuditLog = {
  id: string;
  item_id: string;
  audited_by: string | null;
  /** The count, in the item's unit (migrations/099). Null on pre-Phase-110 rows. */
  quantity_counted: number | null;
  // The Phase 83 split, kept for the rows written before quantity_counted.
  boxes_counted: number;
  loose_units_counted: number;
  photo_url: string | null;
  created_at: string;
};

/** An audit with its author's name resolved, as the owner's view shows it. */
export type InventoryAuditWithStaff = InventoryAuditLog & { staff_name: string | null };

// One chore the house needs doing on one day — cleaning, a repair, an errand,
// the shopping. Deliberately not a master_schedules row: that table requires an
// entity_id and the agenda engine renders per-pet, and "mop the terrace"
// belongs to the house rather than to any dog. There is no recurrence; a repeat
// is filed again.
export type HouseholdTask = {
  id: string;
  // The tenant (migrations/086). Always Banyuwangi 11 until Phase 86B.
  household_id: string;
  title: string;
  notes: string | null;
  category: HouseholdTaskCategory;
  // Null means "anyone" — shown to every staff member as "Semua Petugas" until
  // one of them claims it. Nullable rather than cascading so a chore outlives
  // the person it was given to (see migrations/082).
  assigned_to: string | null;
  // "YYYY-MM-DD" as Postgres returns a `date` column. The day this chore
  // belongs to, and what both views filter on.
  due_date: string;
  // "HH:mm", or null for "sometime today".
  due_time: string | null;
  status: HouseholdTaskStatus;
  // Who actually did it, which is not necessarily who it was assigned to.
  completed_by: string | null;
  completed_at: string | null;
  // The single proof photo every chore completed before Phase 100 carries.
  // Kept rather than migrated: the UI falls back to it when after_photo_url is
  // null, so old completions keep showing their evidence.
  photo_url: string | null;
  created_at: string;
  // --- Phase 100 (migrations/097). All optional because PostgREST omits them
  // until that migration is applied, and the app degrades to one-off chores
  // with a single photo rather than breaking.
  //
  // A row with recurrence other than "none" is a template: its own due_date is
  // its first occurrence, and every later one is generated on the fly.
  recurrence?: ChoreRecurrence | null;
  // Last day of the repeat, or null for "keep going".
  recurrence_until?: string | null;
  // Set on a materialised occurrence, naming the template it came from.
  parent_task_id?: string | null;
  // The owner has to be present for this one.
  requires_supervision?: boolean | null;
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  // --- Phase 135 (migrations/105). The room this chore is in, or null. A
  // materialised occurrence carries its template's.
  location_id?: string | null;
  /**
   * The part of the room the chore is for ("Sink"), or null for the whole
   * room (migrations/129). Optional: absent until that migration.
   */
  spot?: string | null;
  /**
   * The repair this chore is a visit for (migrations/130), or null. Owners
   * set it; a materialised day copies its template's. Optional: absent
   * until that migration.
   */
  repair_id?: string | null;
  /**
   * Every N weeks or months (migrations/137), read with "weekly" and
   * "monthly"; 1–12, default 1. A year is monthly with 12. Optional: absent
   * until that migration, and then 1.
   */
  recurrence_interval?: number | null;
  /**
   * "Remind me" (migrations/137): null for none, 0 on the day, or 1, 3 or 7
   * days before. A 07:00 push to the owner it's for, and the Coming up line
   * on Today. Optional: absent until that migration.
   */
  remind_days_before?: number | null;
};

/** Where a repair stands (migrations/130). "Scheduled" and "work done" are read from its visits. */
export type RepairStatus = "reported" | "open" | "fixed" | "dismissed";

/**
 * A reported problem in a room (Phase 159, migrations/130): "LT3 · Music
 * Room: wall cracked". Fixed by one or more visits, each a Maintenance chore
 * with repair_id set. Owners' reports start open; staff reports wait for an
 * owner ("reported").
 */
export type Repair = {
  id: string;
  household_id: string;
  location_id: string | null;
  spot: string | null;
  title: string;
  details: string | null;
  photo_url: string | null;
  urgent: boolean;
  status: RepairStatus;
  reported_by_staff: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  decided_by: string | null;
  decided_at: string | null;
  dismiss_reason: string | null;
  /** The repair person, a name only (D5). */
  fixed_by_name: string | null;
  closed_at: string | null;
  /** When the repair's warranty ends (migrations/131). Optional: absent before it. */
  warranty_until?: string | null;
};

/** How a walk-in ended, from the staff's optional chip (Phase 174). */
export type WalkInOutcome = "fixed" | "come_back" | "check";

/**
 * A repair person who turned up (Phase 174, migrations/149, table
 * repair_visits): logged by staff at the gate with a before photo, closed
 * with Selesai and an after photo. Scheduled visits stay chores
 * (HouseholdTask.repair_id); a walk-in always belongs to a repair. The
 * times are the server's; the *_phone_at ones are the phone's, kept for a
 * save sent later. Kept with its repair (while open, 2 years after closing).
 */
export type RepairWalkIn = {
  id: string;
  household_id: string;
  repair_id: string;
  /** A name or company, as staff typed it; never a phone number (D3). */
  worker_name: string | null;
  logged_by_staff: string | null;
  created_by: string | null;
  /** When the save reached the server. */
  arrived_at: string;
  arrived_phone_at: string | null;
  before_photo_url: string;
  /** Null until Selesai reached the server. */
  left_at: string | null;
  left_phone_at: string | null;
  after_photo_url: string | null;
  /** The session whose Selesai reached the server (only it may take it back). Absent on pending saves. */
  finished_by?: string | null;
  outcome: WalkInOutcome | null;
  note: string | null;
};

/**
 * Who supervised a walk-in, from when to when (Phase 174, migrations/149).
 * Opened and closed by the database's triggers, never edited by a phone:
 * a walk-in opens its logger's stretch, Selesai closes it, a hand-over
 * closes one and opens the next. Kept 90 days.
 */
export type RepairSupervision = {
  id: string;
  household_id: string;
  visit_id: string;
  /** A roster row (admins have one too, migrations/106). */
  staff_id: string | null;
  /** An owner with no roster row. */
  user_id: string | null;
  started_at: string;
  ended_at: string | null;
};

/** Optional kind of feedback (migrations/135). */
export type FeedbackCategory = "idea" | "problem" | "other";

/**
 * A note to the people who make Miamus (migrations/135). Owners of the
 * household read it; staff phones send but never read. created_by,
 * created_at are stamped by the server; staff_id is set for staff phones only.
 */
export type Feedback = {
  id: string;
  household_id: string;
  message: string;
  category: FeedbackCategory | null;
  staff_id: string | null;
  created_by: string | null;
  app_version: string | null;
  page: string | null;
  created_at: string;
};

/** What a repair cost, and its receipt (migrations/131). Owners only (D4). */
export type RepairCost = {
  repair_id: string;
  household_id: string;
  amount_idr: number | null;
  /** owner-receipts bucket, readable by the household's owners only. */
  receipt_url: string | null;
  note: string | null;
  created_by: string | null;
  updated_at: string;
};

/**
 * What a bill cost and its receipt, for one paid day (Phase 164 PR B,
 * migrations/138). OWNERS ONLY: staff phones can't read the table, and the
 * receipt is in the owner-only owner-receipts bucket. Kept 2 years.
 */
export type BillPayment = {
  id: string;
  household_id: string;
  /** The paid day's row: a repeat's written day, or a one-off bill. */
  task_id: string;
  /** The bill it belongs to (the repeat, or the one-off itself); set by the server. */
  series_id: string | null;
  amount_idr: number | null;
  /** owner-receipts bucket, readable by the household's owners only. */
  receipt_url: string | null;
  /** When it was recorded, by the server's clock. */
  paid_at: string;
  created_by: string | null;
  updated_at: string;
};

/** Why a task couldn't be done (Phase 165, migrations/139). */
export type TaskExceptionReason =
  | "out_of_stock"
  | "pet_refused"
  | "done_by_other"
  | "other"
  /** Phase 174 (migrations/149): watching a repair person; links the visit, needs no note. */
  | "supervising_repair";

/**
 * Someone said a task couldn't be done (Phase 165, migrations/139): one per
 * task-day, or per pet and slot for a routine. Staff phones file and read
 * them for their household and may withdraw one within 5 minutes; nobody
 * edits one. Kept 90 days; its photo 30.
 */
export type TaskException = {
  id: string;
  household_id: string;
  /** The repeat or the one-off (never a written day): with occurs_on, the occurrence key. */
  chore_id: string | null;
  schedule_id: string | null;
  /** The routine's pet (set by the server from the schedule). */
  entity_id: string | null;
  /** The task's day, YYYY-MM-DD. */
  occurs_on: string;
  /** The routine slot, "HH:MM:SS"; null for a chore. */
  slot_time: string | null;
  reason: TaskExceptionReason;
  note: string | null;
  photo_url: string | null;
  /** The shopping-list item that ran out, if one was picked. */
  inventory_item_id: string | null;
  staff_id: string | null;
  /** The walk-in visit being supervised, for "supervising_repair" (migrations/149). Absent before it. */
  repair_visit_id?: string | null;
  /** When it was said, by the server's clock. */
  created_at: string;
};

/** Each admin's two notification switches (migrations/139). */
export type NotificationPrefs = {
  /** 18–21 (Jakarta), or null when the evening summary is off. */
  evening_summary_hour: number | null;
  staff_request_pushes: boolean;
};

/** An owner's two walk-in repair pushes (Phase 174 PR B, migrations/152). Both on by default. */
export type RepairPushPrefs = {
  repair_arrival_pushes: boolean;
  repair_done_pushes: boolean;
};

/** A short note on a repair, by an owner or a staff phone (migrations/131). */
export type RepairNote = {
  id: string;
  household_id: string;
  repair_id: string;
  body: string;
  photo_url: string | null;
  /** The staff member who wrote it (self-declared, like every staff_id), or null for an owner. */
  staff_id: string | null;
  created_by: string | null;
  created_at: string;
};

// A room or area of the house a chore can be tagged with (Phase 135,
// migrations/105). Per household; owners add them, everyone reads them.
/**
 * One step of "Sort your rooms into floors" or its Undo (organise_rooms,
 * migrations/129): places upserted in order, chores updated (a key present is
 * set), then emptied places deleted.
 */
export type OrganiseRoomsPlan = {
  household_id: string;
  places: { id: string; name?: string; kind?: "room" | "floor"; parent_id?: string | null; sort_order?: number }[];
  /** Every chore of room `from` (history too) moves to `into` with that spot. */
  merges?: { from: string; into: string; spot: string }[];
  chores: { id: string; location_id?: string | null; spot?: string | null; title?: string }[];
  delete: string[];
};

/** What organise_rooms moved for a merge, as it was before: for Undo. */
export type OrganiseRoomsMoved = { id: string; location_id: string | null; spot: string | null };

export type HouseholdLocation = {
  id: string;
  household_id: string;
  name: string;
  created_at: string;
  /**
   * Floors and rooms (migrations/129): a floor is a place too, so a chore can
   * be for a whole floor; a room may sit on one floor. Optional: absent
   * until that migration, which reads as a room with no floor.
   */
  kind?: "room" | "floor";
  parent_id?: string | null;
  sort_order?: number;
};

// A staff-submitted request for a new routine, awaiting the owner's decision.
// Approving one is what creates the real master_schedules row — this table
// never drives the agenda itself.
export type RoutineProposal = {
  id: string;
  pet_id: string;
  title: string;
  category: ScheduleCategoryName;
  // "HH:mm:ss" as Postgres returns a `time` column.
  time: string;
  notes: string | null;
  status: ProposalStatus;
  created_by: string | null;
  // Groups the rows of one multi-dose submission. Optional because PostgREST
  // omits it until the Phase 52 migration is applied, and null for proposals
  // filed before it existed.
  batch_id?: string | null;
  // The day this proposal is for. Its meaning varies by category — see
  // migrations/062. Optional because PostgREST omits it until that migration
  // is applied, and null for proposals filed before it existed.
  scheduled_date?: string | null;
  // Who filed this, as selected on their device (migrations/071). Null for
  // everything proposed before staff had identities, and self-declared rather
  // than proven — see the note on StaffProfile.pin.
  staff_id?: string | null;
  created_at: string;
};

// One device that agreed to push notifications (migrations/103). Stored as
// the browser's PushSubscription.toJSON(), trimmed to endpoint + keys; the
// endpoint is pulled out as its own unique column so a device has one row.
export type PushSubscriptionJSON = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  household_id: string;
  subscription: PushSubscriptionJSON;
  endpoint: string;
  created_at: string;
};

// Mirrors ScheduleCategory in lib/schedule-categories, kept here as a plain
// union so types/database.ts stays free of app-layer imports.
export type ScheduleCategoryName =
  | "meal"
  | "potty"
  | "medication"
  | "grooming"
  | "temporary"
  | "vet"
  | "routine";

export interface Database {
  public: {
    Tables: {
      task_entities: {
        Row: TaskEntity;
        Insert: Partial<TaskEntity> & Pick<TaskEntity, "entity_type" | "name">;
        Update: Partial<TaskEntity>;
        Relationships: [];
      };
      master_schedules: {
        Row: MasterSchedule;
        Insert: Partial<MasterSchedule> &
          Pick<MasterSchedule, "entity_id" | "title" | "module" | "frequency_type">;
        Update: Partial<MasterSchedule>;
        Relationships: [];
      };
      task_logs: {
        Row: TaskLog;
        Insert: Partial<TaskLog> & Pick<TaskLog, "entity_id" | "module">;
        Update: Partial<TaskLog>;
        Relationships: [];
      };
      medical_records: {
        Row: MedicalRecord;
        Insert: Partial<MedicalRecord> &
          Pick<MedicalRecord, "entity_id" | "record_type" | "title">;
        Update: Partial<MedicalRecord>;
        Relationships: [];
      };
      staff_profiles: {
        Row: StaffProfile;
        Insert: Partial<StaffProfile> & Pick<StaffProfile, "name">;
        Update: Partial<StaffProfile>;
        Relationships: [];
      };
      inventory_alerts: {
        Row: InventoryAlert;
        Insert: Partial<InventoryAlert> & Pick<InventoryAlert, "item_type">;
        Update: Partial<InventoryAlert>;
        Relationships: [];
      };
      inventory_items: {
        Row: InventoryItem;
        Insert: Partial<InventoryItem> & Pick<InventoryItem, "name">;
        Update: Partial<InventoryItem>;
        Relationships: [];
      };
      food_items: {
        Row: FoodItem;
        Insert: Partial<FoodItem> & Pick<FoodItem, "household_id">;
        Update: Partial<FoodItem>;
        Relationships: [];
      };
      // Recipes (migrations/151): owners write, every session reads.
      recipes: {
        Row: Recipe;
        Insert: Partial<Recipe> & Pick<Recipe, "household_id" | "name">;
        Update: Partial<Recipe>;
        Relationships: [];
      };
      recipe_ingredients: {
        Row: RecipeIngredient;
        Insert: Partial<RecipeIngredient> & Pick<RecipeIngredient, "household_id" | "recipe_id" | "name">;
        Update: Partial<RecipeIngredient>;
        Relationships: [];
      };
      // The weekly menu (migrations/153): owners write, every session reads.
      menu_dishes: {
        Row: MenuDish;
        Insert: Partial<MenuDish> & Pick<MenuDish, "household_id" | "day" | "meal" | "title">;
        Update: Partial<MenuDish>;
        Relationships: [];
      };
      inventory_audit_logs: {
        Row: InventoryAuditLog;
        Insert: Partial<InventoryAuditLog> & Pick<InventoryAuditLog, "item_id">;
        Update: Partial<InventoryAuditLog>;
        Relationships: [];
      };
      household_tasks: {
        Row: HouseholdTask;
        Insert: Partial<HouseholdTask> & Pick<HouseholdTask, "title">;
        Update: Partial<HouseholdTask>;
        Relationships: [];
      };
      leave_requests: {
        Row: LeaveRequest;
        Insert: Partial<LeaveRequest> &
          Pick<LeaveRequest, "household_id" | "staff_id" | "start_date" | "end_date">;
        Update: Partial<LeaveRequest>;
        Relationships: [];
      };
      repair_costs: {
        Row: RepairCost;
        Insert: Partial<RepairCost> & Pick<RepairCost, "repair_id" | "household_id">;
        Update: Partial<RepairCost>;
        Relationships: [];
      };
      bill_payments: {
        Row: BillPayment;
        Insert: Partial<BillPayment> & Pick<BillPayment, "task_id" | "household_id">;
        Update: Partial<BillPayment>;
        Relationships: [];
      };
      task_exceptions: {
        Row: TaskException;
        Insert: Partial<TaskException> & Pick<TaskException, "household_id" | "occurs_on" | "reason">;
        Update: never;
        Relationships: [];
      };
      repair_notes: {
        Row: RepairNote;
        Insert: Partial<RepairNote> & Pick<RepairNote, "repair_id" | "household_id" | "body">;
        Update: Partial<RepairNote>;
        Relationships: [];
      };
      feedback: {
        Row: Feedback;
        Insert: Pick<Feedback, "household_id" | "message"> &
          Partial<Pick<Feedback, "category" | "staff_id" | "app_version" | "page">>;
        Update: never;
        Relationships: [];
      };
      repair_visits: {
        Row: RepairWalkIn;
        Insert: Partial<RepairWalkIn> &
          Pick<RepairWalkIn, "household_id" | "repair_id" | "before_photo_url">;
        Update: Partial<RepairWalkIn>;
        Relationships: [];
      };
      repair_supervision: {
        Row: RepairSupervision;
        Insert: Partial<RepairSupervision> & Pick<RepairSupervision, "household_id" | "visit_id">;
        Update: never;
        Relationships: [];
      };
      repairs: {
        Row: Repair;
        Insert: Partial<Repair> & Pick<Repair, "household_id" | "title">;
        Update: Partial<Repair>;
        Relationships: [];
      };
      household_locations: {
        Row: HouseholdLocation;
        Insert: Partial<HouseholdLocation> & Pick<HouseholdLocation, "household_id" | "name">;
        Update: Partial<HouseholdLocation>;
        Relationships: [];
      };
      households: {
        Row: Household;
        Insert: Partial<Household> & Pick<Household, "name">;
        Update: Partial<Household>;
        Relationships: [];
      };
      household_features: {
        // Phase 171 PR A (migrations/145): read by members and staff phones;
        // written only through set_household_feature().
        Row: { household_id: string; feature: string; enabled: boolean; set_at: string; set_by: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      household_members: {
        Row: HouseholdMember;
        Insert: Partial<HouseholdMember> & Pick<HouseholdMember, "household_id" | "user_id">;
        Update: Partial<HouseholdMember>;
        Relationships: [];
      };
      device_sessions: {
        Row: DeviceSession;
        Insert: Partial<DeviceSession> & Pick<DeviceSession, "user_id" | "household_id">;
        Update: Partial<DeviceSession>;
        Relationships: [];
      };
      owner_invites: {
        Row: OwnerInvite;
        Insert: Partial<OwnerInvite> & Pick<OwnerInvite, "household_id" | "token" | "expires_at">;
        Update: Partial<OwnerInvite>;
        Relationships: [];
      };
      staff_invites: {
        Row: StaffInvite;
        Insert: Partial<StaffInvite> & Pick<StaffInvite, "household_id" | "token" | "expires_at">;
        Update: Partial<StaffInvite>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        // Registering goes through save_push_subscription; the table itself
        // is read and deleted directly, under own-device RLS.
        Insert: Pick<PushSubscriptionRow, "household_id" | "subscription">;
        Update: never;
        Relationships: [];
      };
      routine_proposals: {
        Row: RoutineProposal;
        Insert: Partial<RoutineProposal> &
          Pick<RoutineProposal, "pet_id" | "title" | "category" | "time">;
        Update: Partial<RoutineProposal>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // The staff magic link's only door (migrations/089): redeems the token
      // AND binds this device to the household, or raises.
      redeem_staff_invite: {
        Args: { p_token: string };
        Returns: string;
      };
      // The staff gate's login check. True only for the right PIN, on a staff
      // member this caller's household actually has.
      verify_staff_pin: {
        Args: { p_staff_id: string; p_pin: string };
        Returns: boolean;
      };
      // The +/- stepper (migrations/099): an atomic increment, floored at 0.
      // Phase 170 PR A (migrations/148): the person on duty is recorded
      // with the change; two-argument calls still work.
      adjust_inventory_quantity: {
        Args: { p_item_id: string; p_delta: number; p_staff_id?: string | null };
        Returns: InventoryItem[];
      };
      // Ate 1 portion and its Undo (migrations/148): decided on the server,
      // keyed by an op id made on the phone, safe to resend.
      eat_food_portion: {
        Args: { p_food_id: string; p_op_id: string; p_staff_id?: string | null };
        Returns: { food: FoodItem; consumed: number };
      };
      undo_food_portion: {
        Args: { p_food_id: string; p_op_id: string };
        Returns: { food: FoodItem; restored: number };
      };
      // A recipe and all its lines in one go (migrations/151); owners only.
      save_recipe: {
        Args: { p_recipe: Record<string, unknown>; p_ingredients?: Record<string, unknown>[] };
        Returns: { recipe: Recipe; ingredients: RecipeIngredient[] };
      };
      // Cooking and its Undo (migrations/153); any household session.
      cook_menu_dish: {
        Args: { p_dish_id: string; p_uses: CookedUse[]; p_staff_id?: string | null };
        Returns: { dish: MenuDish; items: InventoryItem[] };
      };
      uncook_menu_dish: {
        Args: { p_dish_id: string };
        Returns: { dish: MenuDish; items: InventoryItem[]; skipped?: CookedUse[] };
      };
      // The household's kitchen note (migrations/153); owners only.
      set_kitchen_notes: {
        Args: { p_household_id: string; p_notes: string | null; p_confirm?: boolean };
        Returns: { kitchen_notes: string | null; kitchen_notes_confirmed_at: string | null };
      };
      // Bought (migrations/148): adds the amount on a tracked item, keeps it
      // as the next pre-fill, and puts the item back to enough.
      record_purchase: {
        Args: { p_item_id: string; p_amount?: number | null; p_staff_id?: string | null };
        Returns: InventoryItem[];
      };
      // Finished work per staff member over a span, by completer
      // (migrations/100). Owner-only: refuses non-members.
      staff_workload: {
        Args: { p_household_id: string; p_from: string; p_to: string };
        Returns: {
          staff_id: string | null;
          name: string | null;
          total_completed: number;
          pets_completed: number;
          chores_completed: number;
        }[];
      };
      // Hashes and stores a PIN, or clears it when given null.
      // "I'm back early" (migrations/108): ends an approved leave on p_today.
      end_leave_early: {
        Args: { p_id: string; p_today: string };
        Returns: LeaveRequest;
      };
      // The signed-in admin's own roster row, created if missing (migrations/106).
      ensure_my_member_profile: {
        Args: { p_household_id: string };
        Returns: { id: string; name: string }[];
      };
      set_staff_pin: {
        Args: { p_staff_id: string; p_pin: string | null };
        Returns: undefined;
      };
      // Taking someone off the roster, and putting them back (migrations/109).
      // Both return the row they changed.
      archive_staff_profile: {
        Args: { p_staff_id: string };
        Returns: StaffProfile;
      };
      restore_staff_profile: {
        Args: { p_staff_id: string };
        Returns: StaffProfile;
      };
      // Who has co-owner access, with emails — the table itself only ever
      // shows you your own row (migrations/094).
      list_household_members: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          email: string;
          role: string;
          joined_at: string;
          is_founder: boolean;
          is_self: boolean;
        }[];
      };
      // Takes a co-owner's access back. Refuses yourself and the founder.
      remove_household_member: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      // Admits a signed-in Google account to the household as a co-owner.
      use_owner_invite_token: {
        Args: { p_token: string };
        Returns: string;
      };
      // Registers this device for push, or moves an existing endpoint to the
      // caller (migrations/103). Refuses non-push-service endpoints.
      save_push_subscription: {
        Args: { p_household_id: string; p_subscription: PushSubscriptionJSON };
        Returns: undefined;
      };
      // Each admin's notification switches (migrations/139). Never for a
      // staff phone's anonymous session.
      my_notification_prefs: {
        Args: Record<string, never>;
        Returns: NotificationPrefs[];
      };
      set_my_notification_prefs: {
        Args: { p_hour: number | null; p_requests: boolean };
        Returns: NotificationPrefs[];
      };
      // Walk-in repair pushes (migrations/152): this owner's two switches.
      my_repair_push_prefs: {
        Args: Record<string, never>;
        Returns: RepairPushPrefs[];
      };
      set_my_repair_push_prefs: {
        Args: { p_arrival: boolean; p_done: boolean };
        Returns: RepairPushPrefs[];
      };
      // For the staff's WhatsApp panel: will an admin get the request push?
      household_requests_push_on: {
        Args: { p_household_id: string };
        Returns: boolean;
      };
      // The VAPID public key from Vault; null until push is configured.
      get_push_public_key: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      // Queues a test push to every device of the caller's; returns how many.
      send_test_push: {
        Args: Record<string, never>;
        Returns: number;
      };
      // Notifications on staff phones (migrations/141). A staff phone's own list:
      my_phone_push_people: {
        Args: Record<string, never>;
        Returns: {
          people: { staff_id: string; name: string }[];
          shared: boolean;
          household_on: boolean;
        };
      };
      set_my_push_person: {
        Args: { p_staff_id: string; p_on: boolean; p_pin?: string };
        Returns:
          | { status: "ok" }
          | { status: "pin_required" }
          | { status: "wrong_pin"; attempts_left: number }
          | { status: "locked"; locked_until: string }
          | { status: "no_pin" };
      };
      // Admins only (caller_admin_household):
      staff_push_overview: {
        Args: Record<string, never>;
        Returns: {
          enabled: boolean;
          people: { staff_id: string; phones_on: number }[];
          phones: { device_session_id: string; names: string[] }[];
        };
      };
      set_household_staff_push: {
        Args: { p_on: boolean };
        Returns: boolean;
      };
      staff_will_be_notified: {
        Args: { p_staff_ids: string[]; p_today_task?: boolean };
        Returns: string[];
      };
      // Every RLS policy's question: which households may auth.uid() touch.
      get_user_household_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      // Household approval (migrations/113, Phase 148). See lib/household-access.
      is_platform_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      my_household_access: {
        Args: Record<string, never>;
        Returns: string;
      };
      request_household_access: {
        Args: Record<string, never>;
        Returns: string;
      };
      // Platform admins only: pending requests, then the last 30 days' decisions.
      list_household_access_requests: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          full_name: string | null;
          email: string | null;
          status: string;
          requested_at: string;
          decided_at: string | null;
          // migrations/143
          auto: boolean;
          locale: string;
          whatsapp: string | null;
        }[];
      };
      // The optional WhatsApp number to be told on (migrations/143): the
      // person waiting sets and reads their own; platform admins mark it used.
      set_my_access_contact: {
        Args: { p_whatsapp: string | null };
        Returns: string | null;
      };
      my_access_contact: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      household_access_told: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      decide_household_access: {
        Args: { p_user_id: string; p_approve: boolean };
        Returns: undefined;
      };
      // Setup counts and the north star (migrations/142, Phase 172 PR 0).
      // Members of the household only; numbers are added, never negative.
      record_household_setup: {
        Args: { p_household: string; p_fields: Record<string, string | number> };
        Returns: undefined;
      };
      // Platform admins only: S1–S5 per sign-up week. See lib/north-star.
      platform_north_star: {
        Args: { p_weeks?: number };
        Returns: unknown;
      };
      // The household and its owner membership in one transaction.
      create_household: {
        Args: { p_name: string; p_has_pets?: boolean | null };
        Returns: string;
      };
      my_locale: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      // Kakak (migrations/126, Phase 156 step 2). Admins of the household only.
      kakak_status: {
        Args: { p_household: string };
        Returns: {
          allowed: boolean;
          enabled: boolean;
          enabled_by: string | null;
          enabled_at: string | null;
          daily_limit: number;
          calls_left: number;
        }[];
      };
      set_household_has_pets: {
        Args: { p_household: string; p_on: boolean };
        Returns: undefined;
      };
      apply_household_setup: {
        // Phase 172 PR A2 (migrations/147): the reviewed list in one call.
        Args: { p_household: string; p_draft: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      claim_staff_with_house_code: {
        Args: { p_code: string; p_staff_id: string; p_new_pin: string; p_claim: string };
        Returns: Record<string, unknown>;
      };
      staff_claim_link: {
        Args: { p_household: string };
        Returns: string;
      };
      undo_staff_claim: {
        Args: { p_household: string; p_staff_id: string };
        Returns: boolean;
      };
      staff_claims_today: {
        Args: { p_household: string };
        Returns: { staff_id: string; name: string; claimed_at: string }[];
      };
      set_household_feature: {
        Args: { p_household: string; p_feature: string; p_on: boolean };
        Returns: undefined;
      };
      set_kakak_enabled: {
        Args: { p_household: string; p_on: boolean };
        Returns: undefined;
      };
      platform_set_kakak_allowed: {
        Args: { p_household: string; p_allowed: boolean };
        Returns: undefined;
      };
      kakak_begin: {
        Args: { p_household: string };
        Returns: Record<string, unknown>;
      };
      kakak_record: {
        Args: {
          p_request: string;
          p_model: string;
          p_outcome: string;
          p_tools: string[];
          p_input_tokens: number;
          p_cache_read_tokens: number;
          p_cache_write_tokens: number;
          p_output_tokens: number;
          p_cost_micro_usd: number;
          p_latency_ms: number;
        };
        Returns: undefined;
      };
      kakak_set_result: {
        Args: { p_request: string; p_result: string };
        Returns: undefined;
      };
      set_my_locale: {
        Args: { p_locale: string };
        Returns: string;
      };
      // Phase 151, migrations/115.
      check_staff_pin: {
        Args: { p_staff_id: string; p_pin: string };
        Returns: Record<string, unknown>;
      };
      house_code_roster: {
        Args: { p_code: string };
        Returns: { id: string; name: string; has_pin: boolean }[];
      };
      sign_in_with_house_code: {
        Args: { p_code: string; p_staff_id: string; p_pin: string };
        Returns: Record<string, unknown>;
      };
      my_house_code: {
        Args: { p_household_id: string };
        Returns: string | null;
      };
      rotate_house_code: {
        Args: { p_household_id: string };
        Returns: string;
      };
      // Marks a paid bill's day not paid: payment removed and day reopened in
      // one transaction (migrations/138).
      reopen_bill_day: {
        Args: { p_task_id: string };
        Returns: { task: HouseholdTask; payment: BillPayment | null };
      };
      list_linked_phones: {
        Args: { p_household_id: string };
        Returns: { id: string; linked_at: string; last_seen_at: string }[];
      };
      remove_linked_phone: {
        Args: { p_household_id: string; p_device_id: string };
        Returns: boolean;
      };
      // R7, migrations/127: the household download and scheduled deletion.
      export_household_data: {
        Args: Record<string, never>;
        Returns: Record<string, unknown>;
      };
      organise_rooms: {
        Args: { p_plan: OrganiseRoomsPlan };
        Returns: { moved: OrganiseRoomsMoved[] };
      };
      household_deletion_status: {
        Args: Record<string, never>;
        Returns: {
          household_name: string;
          scheduled: boolean;
          delete_after: string | null;
          requested_by_me: boolean;
          can_schedule: boolean;
        }[];
      };
      schedule_household_deletion: {
        Args: { p_confirm_name: string };
        Returns: string;
      };
      cancel_household_deletion: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
