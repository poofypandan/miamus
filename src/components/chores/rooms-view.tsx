"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, DoorOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { dataProvider } from "@/lib/data";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterPill } from "@/components/shared/filter-pill";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { SortRoomsCard } from "@/components/chores/sort-rooms-card";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { RoomRepairs } from "@/components/repairs/room-repairs";
import { canSortIntoFloors } from "@/lib/organise-rooms";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useChoresView } from "@/hooks/use-chores-view";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { CHORE_JOBS, choreJobLabel, type ChoreJob } from "@/lib/chore-jobs";
import { recurrenceOf } from "@/lib/chore-recurrence";
import {
  allRoomRows,
  buildRoomsModel,
  roomHasJob,
  scheduleLabel,
  scheduleSummary,
  type RoomChore,
  type RoomEntry,
} from "@/lib/rooms-view";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { OwnerLocale } from "@/lib/owner-locale";
import type { HouseholdTask } from "@/types/database";

/**
 * Chores → Rooms (Phase 158, PR A): every room, grouped by floor, with what's
 * set up in it — and, with a job chip tapped, which rooms have that job and
 * which don't ("which rooms get vacuumed?").
 *
 * Owner-facing, in the owner's language. Reads the same chores and rooms as
 * Today; adds and edits go through the same ChoreEditorDialog. No database
 * change: floors come from the room names (lib/rooms-view.ts).
 */
/**
 * Every set-up chore, whatever week the Agenda is on (Codex, PR #30): the
 * household's chore cache only holds the week on screen, so a chore set up
 * for later would look missing and invite a duplicate. Read on its own, and
 * read again whenever the household's chores change, so an edit made here
 * shows; until that read lands, the cache's fresher copy of any row wins.
 */
function useSetUpChores(today: string): { rows: HouseholdTask[] | null; failed: boolean } {
  const { householdTasks } = useHousehold();
  const [state, setState] = useState<{ rows: HouseholdTask[] | null; failed: boolean }>({
    rows: null,
    failed: false,
  });

  useEffect(() => {
    let live = true;
    dataProvider.listSetUpChores(today).then(
      (rows) => {
        if (live) setState({ rows, failed: false });
      },
      (err) => {
        console.error("Rooms: set-up chores", err);
        if (live) setState((previous) => ({ rows: previous.rows, failed: true }));
      }
    );
    return () => {
      live = false;
    };
  }, [today, householdTasks]);

  const rows = useMemo(() => {
    if (!state.rows) return state.failed ? householdTasks : null;
    const byId = new Map(state.rows.map((row) => [row.id, row]));
    for (const row of householdTasks) byId.set(row.id, row);
    return [...byId.values()];
  }, [state, householdTasks]);

  return { rows, failed: state.failed && !state.rows };
}

export function RoomsView() {
  const { locations, failed: roomsFailed, reload: reloadRooms } = useHouseholdLocations();
  const { allProfiles } = useStaffProfiles();
  const locale = useOwnerLocale();
  const t = useT();
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));
  const today = formatDateLocal(useToday());
  const { job, setJob } = useChoresView();
  const { rows: chores, failed } = useSetUpChores(today);

  const model = useMemo(
    () => buildRoomsModel(locations ?? [], chores ?? [], today),
    [locations, chores, today]
  );
  const rows = useMemo(() => allRoomRows(model), [model]);

  // The room sheet: a room's id, "none" for chores without a room, or closed.
  const [sheet, setSheet] = useState<string | "none" | null>(null);
  const [editor, setEditor] = useState<{
    task: HouseholdTask | null;
    preset: { title?: string; locationId?: string | null } | null;
  } | null>(null);

  const sheetEntry: RoomEntry | null =
    sheet && sheet !== "none"
      ? ([...model.floors.flatMap((f) => (f.whole ? [f.whole, ...f.rooms] : f.rooms)), ...model.otherRooms].find(
          (r) => r.id === sheet
        ) ?? null)
      : null;

  function openEditor(task: HouseholdTask | null, preset: { title?: string; locationId?: string | null } | null) {
    setSheet(null);
    setEditor({ task, preset });
  }

  // The room list failed and won't retry on its own: say so, with a way back
  // (Codex, PR #30), rather than placeholders forever.
  if (!locations && roomsFailed) {
    return (
      <EmptyState
        icon={DoorOpen}
        title={t("Couldn't load your rooms", "Ruangan tidak bisa dimuat")}
        description={t(
          "Check the connection and try again.",
          "Periksa koneksi lalu coba lagi."
        )}
      >
        <Button variant="outline" className="min-h-[44px]" onClick={() => void reloadRooms?.()}>
          {t("Try again", "Coba lagi")}
        </Button>
      </EmptyState>
    );
  }

  if (!chores || !locations) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label={t("Loading rooms", "Memuat ruangan")}>
        <Skeleton className="h-9 w-full rounded-full" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (locations.length === 0 && model.noRoom.length === 0) {
    return (
      <>
        <EmptyState
          icon={DoorOpen}
          title={t("No rooms yet", "Belum ada ruangan")}
          description={t(
            "Give a chore a room and it shows up here, with everything set up in it.",
            "Beri tugas sebuah ruangan, lalu ruangan itu muncul di sini dengan semua tugasnya."
          )}
        >
          <Button className="min-h-[44px]" onClick={() => openEditor(null, null)}>
            <Plus /> {t("Add Chore", "Tambah Tugas")}
          </Button>
        </EmptyState>
        <RoomsEditor editor={editor} onClose={() => setEditor(null)} today={today} />
      </>
    );
  }

  const withJob = (entries: RoomEntry[]) => (job ? entries.filter((r) => roomHasJob(r, job)).length : 0);
  const jobName = job ? choreJobLabel(job, locale) : "";

  return (
    <div className="flex flex-col gap-4">
      {failed && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t(
            "Couldn't load every chore, so this shows only this week's. Rooms may look emptier than they are.",
            "Tidak semua tugas bisa dimuat, jadi hanya tugas minggu ini yang tampil. Ruangan bisa terlihat lebih kosong dari sebenarnya."
          )}
        </p>
      )}
      <WhatsNewCard id="floors-2026-11" />
      {!model.storedFloors && canSortIntoFloors(locations) && (
        <SortRoomsCard locations={locations} chores={chores} today={today} />
      )}
      {model.jobs.length > 0 && (
        <div
          role="group"
          aria-label={t("Show one job", "Tampilkan satu pekerjaan")}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <FilterPill label={t("All", "Semua")} count={rows.length} active={!job} onClick={() => setJob(null)} />
          {model.jobs.map((value) => (
            <FilterPill
              key={value}
              label={choreJobLabel(value, locale)}
              count={rows.filter((r) => roomHasJob(r, value)).length}
              active={job === value}
              onClick={() => setJob(job === value ? null : value)}
            />
          ))}
        </div>
      )}

      {job && (
        <p className="rounded-xl border bg-card px-3 py-2.5 text-sm text-gray-700">
          {locale === "id" ? (
            <>
              <span className="font-semibold text-gray-900">{jobName}</span> di {withJob(rows)} dari {rows.length}{" "}
              ruangan
            </>
          ) : (
            <>
              <span className="font-semibold text-gray-900">{jobName}</span> in {withJob(rows)} of {rows.length}{" "}
              rooms
            </>
          )}
        </p>
      )}

      {model.floors.map((floor) => (
        <section key={floor.key} className="flex flex-col gap-1.5" aria-label={floor.label}>
          <SectionHeader
            title={floor.label}
            detail={
              job
                ? t(`${jobName} in ${withJob(floor.rooms)} of ${floor.rooms.length}`, `${jobName} di ${withJob(floor.rooms)} dari ${floor.rooms.length}`)
                : t(
                    `${floor.rooms.length} ${floor.rooms.length === 1 ? "room" : "rooms"}`,
                    `${floor.rooms.length} ruangan`
                  )
            }
          />
          <div className="overflow-hidden rounded-xl border bg-card">
            {floor.whole && (
              <RoomRow
                entry={floor.whole}
                label={t("Whole floor", "Seluruh lantai")}
                whole
                job={job}
                locale={locale}
                staffName={staffName}
                onOpen={() => setSheet(floor.whole!.id)}
                onAdd={(title) => openEditor(null, { title, locationId: floor.whole!.id })}
              />
            )}
            {floor.rooms.map((entry) => (
              <RoomRow
                key={entry.id}
                entry={entry}
                label={entry.label}
                job={job}
                locale={locale}
                staffName={staffName}
                onOpen={() => setSheet(entry.id)}
                onAdd={(title) => openEditor(null, { title, locationId: entry.id })}
              />
            ))}
          </div>
        </section>
      ))}

      {model.otherRooms.length > 0 && (
        <section
          className="flex flex-col gap-1.5"
          aria-label={model.storedFloors ? t("No floor yet", "Belum ada lantai") : t("Other rooms", "Ruangan lain")}
        >
          <SectionHeader
            title={
              model.storedFloors
                ? t("No floor yet", "Belum ada lantai")
                : model.floors.length > 0
                  ? t("Other rooms", "Ruangan lain")
                  : t("Rooms", "Ruangan")
            }
            detail={
              job
                ? t(
                    `${jobName} in ${withJob(model.otherRooms)} of ${model.otherRooms.length}`,
                    `${jobName} di ${withJob(model.otherRooms)} dari ${model.otherRooms.length}`
                  )
                : t(
                    `${model.otherRooms.length} ${model.otherRooms.length === 1 ? "room" : "rooms"}`,
                    `${model.otherRooms.length} ruangan`
                  )
            }
          />
          <div className="overflow-hidden rounded-xl border bg-card">
            {model.otherRooms.map((entry) => (
              <RoomRow
                key={entry.id}
                entry={entry}
                label={entry.label}
                job={job}
                locale={locale}
                staffName={staffName}
                onOpen={() => setSheet(entry.id)}
                onAdd={(title) => openEditor(null, { title, locationId: entry.id })}
              />
            ))}
          </div>
        </section>
      )}

      {model.noRoom.length > 0 && (
        <button
          type="button"
          onClick={() => setSheet("none")}
          className="flex min-h-[44px] items-center justify-between rounded-xl px-1 text-sm text-gray-600 active:bg-muted"
        >
          {t(
            `${model.noRoom.length} ${model.noRoom.length === 1 ? "chore has" : "chores have"} no room`,
            `${model.noRoom.length} tugas belum punya ruangan`
          )}
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      )}

      <RoomSheet
        open={sheet !== null}
        title={sheet === "none" ? t("No room", "Tanpa ruangan") : (sheetEntry?.fullName ?? "")}
        locationId={sheet && sheet !== "none" ? sheet : null}
        chores={sheet === "none" ? model.noRoom : (sheetEntry?.chores ?? [])}
        locale={locale}
        staffName={staffName}
        onClose={() => setSheet(null)}
        onEdit={(task) => openEditor(task, null)}
        onAdd={() => openEditor(null, sheet && sheet !== "none" ? { locationId: sheet } : null)}
      />
      <RoomsEditor editor={editor} onClose={() => setEditor(null)} today={today} />
    </div>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <span className="text-xs text-muted-foreground tabular-nums">{detail}</span>
    </div>
  );
}

/**
 * One chip per job in a room's row, with the days it's done: "Vacuum · Mon,
 * Thu", "Mop · Mon, Thu", "Dust · Mon". Per job rather than per chore, so two
 * chores that both vacuum read as one vacuum rota. Chores with no known job
 * share an "Other" chip, last.
 */
function jobChips(chores: RoomChore[], locale: OwnerLocale, other: string) {
  const byJob = new Map<string, { label: string; tasks: HouseholdTask[] }>();
  for (const chore of chores) {
    const keys = chore.jobs.length ? chore.jobs : (["other"] as const);
    for (const key of keys) {
      const entry = byJob.get(key) ?? {
        label: key === "other" ? other : choreJobLabel(key as ChoreJob, locale),
        tasks: [],
      };
      entry.tasks.push(chore.task);
      byJob.set(key, entry);
    }
  }
  const order = (key: string) => (key === "other" ? 99 : CHORE_JOBS.indexOf(key as ChoreJob));
  return [...byJob.entries()]
    .sort(([a], [b]) => order(a) - order(b))
    .map(([key, { label, tasks }]) => ({ key, label: `${label} · ${scheduleSummary(tasks, locale)}` }));
}

/** The chores of one room, grouped by the jobs they do ("Vacuum · Mop"). */
function groupByJobs(chores: RoomChore[], locale: OwnerLocale, other: string) {
  const groups = new Map<string, { label: string; chores: RoomChore[] }>();
  for (const chore of chores) {
    const key = chore.jobs.join("+") || "other";
    const label = chore.jobs.length ? chore.jobs.map((j) => choreJobLabel(j, locale)).join(" · ") : other;
    const group = groups.get(key) ?? { label, chores: [] };
    group.chores.push(chore);
    groups.set(key, group);
  }
  // Repeats first, then one-offs by date; "Other" last.
  for (const group of groups.values()) {
    group.chores.sort((a, b) => {
      const ra = recurrenceOf(a.task) === "none" ? 1 : 0;
      const rb = recurrenceOf(b.task) === "none" ? 1 : 0;
      return ra - rb || a.task.due_date.localeCompare(b.task.due_date);
    });
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "other" ? 1 : 0) - (b === "other" ? 1 : 0))
    .map(([key, group]) => ({ key, ...group }));
}

function RoomRow({
  entry,
  label,
  whole = false,
  job,
  locale,
  staffName,
  onOpen,
  onAdd,
}: {
  entry: RoomEntry;
  label: string;
  whole?: boolean;
  job: ChoreJob | null;
  locale: OwnerLocale;
  staffName: (id: string | null | undefined) => string;
  onOpen: () => void;
  onAdd: (title: string) => void;
}) {
  const t = useT();
  const matching = job ? entry.chores.filter((c) => c.jobs.includes(job)) : [];
  const names = [...new Set(matching.map((c) => c.task.assigned_to).filter(Boolean).map((id) => staffName(id)))];
  const groups = job ? [] : jobChips(entry.chores, locale, t("Other", "Lainnya"));
  const shown = groups.slice(0, 4);

  return (
    <div className={cn("flex items-center gap-2 border-t first:border-t-0", whole && "bg-zinc-50")}>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[52px] min-w-0 flex-1 flex-col items-start gap-1 px-3 py-2.5 text-left active:bg-muted"
      >
        <span className="flex w-full items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", whole ? "font-semibold text-gray-700" : "font-medium text-gray-900")}>
            {label}
          </span>
          {!job && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        </span>
        {job ? (
          matching.length > 0 ? (
            <span className="flex items-center gap-1 text-xs text-gray-700">
              <Check className="size-3.5 shrink-0 text-emerald-700" aria-hidden />
              <span className="sr-only">{t("Set up:", "Sudah ada:")}</span>
              {scheduleSummary(
                matching.map((c) => c.task),
                locale
              )}
              {names.length > 0 && ` · ${names.join(", ")}`}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t(`No ${choreJobLabel(job, "en").toLowerCase()} yet`, `Belum ada ${choreJobLabel(job, "id").toLowerCase()}`)}
            </span>
          )
        ) : entry.chores.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("Nothing set up", "Belum ada tugas")}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {shown.map((group) => (
              <span key={group.key} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-gray-700">
                {group.label}
              </span>
            ))}
            {groups.length > shown.length && (
              <span className="rounded-full px-1 py-0.5 text-[11px] text-muted-foreground">
                +{groups.length - shown.length}
              </span>
            )}
          </span>
        )}
      </button>
      {job && matching.length === 0 && (
        <Button
          variant="outline"
          className="mr-3 min-h-[36px] shrink-0 px-3 text-xs"
          // The title starts as the job's Indonesian name: chore titles are
          // what staff read, and staff screens are Indonesian. Editable.
          onClick={() => onAdd(choreJobLabel(job, "id"))}
          aria-label={t(`Add ${choreJobLabel(job, "en").toLowerCase()} in ${label}`, `Tambah ${choreJobLabel(job, "id").toLowerCase()} di ${label}`)}
        >
          <Plus className="size-3.5" /> {t("Add", "Tambah")}
        </Button>
      )}
    </div>
  );
}

function RoomSheet({
  open,
  title,
  locationId,
  chores,
  locale,
  staffName,
  onClose,
  onEdit,
  onAdd,
}: {
  open: boolean;
  title: string;
  /** The room, or null for "No room" (no repairs section then). */
  locationId: string | null;
  chores: RoomChore[];
  locale: OwnerLocale;
  staffName: (id: string | null | undefined) => string;
  onClose: () => void;
  onEdit: (task: HouseholdTask) => void;
  onAdd: () => void;
}) {
  const t = useT();
  const groups = groupByJobs(chores, locale, t("Other", "Lainnya"));
  // Back closes the sheet, not the Rooms view under it (as every sheet does).
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {chores.length === 0
              ? t("Nothing set up here yet.", "Belum ada tugas di sini.")
              : t(
                  `${chores.length} ${chores.length === 1 ? "chore" : "chores"} set up`,
                  `${chores.length} tugas`
                )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1.5">
              <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h4>
              <div className="overflow-hidden rounded-xl border bg-card">
                {group.chores.map(({ task }) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onEdit(task)}
                    className="flex min-h-[52px] w-full items-center gap-2 border-t px-3 py-2.5 text-left first:border-t-0 active:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">{task.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {task.spot?.trim() && `${task.spot.trim()} · `}
                        {repeatPhrase(task, locale)}
                        {task.due_time && ` · ${task.due_time.slice(0, 5).replace(":", locale === "id" ? "." : ":")}`}
                        {task.assigned_to && ` · ${staffName(task.assigned_to)}`}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {/* Phase 159: what's broken here, and what was fixed. */}
          {locationId && <RoomRepairs locationId={locationId} />}
        </div>
        <SheetFooter>
          <Button className="min-h-[48px] w-full" onClick={onAdd}>
            <Plus /> {t("Add chore here", "Tambah tugas di sini")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** "Every Monday", "Daily", "Monthly, 14th", or a one-off's date. */
function repeatPhrase(task: HouseholdTask, locale: OwnerLocale): string {
  if (recurrenceOf(task) !== "weekly") return scheduleLabel(task, locale);
  const day = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { weekday: "long" }).format(
    new Date(`${task.due_date}T00:00:00`)
  );
  return locale === "id" ? `Setiap ${day}` : `Every ${day}`;
}

function RoomsEditor({
  editor,
  onClose,
  today,
}: {
  editor: { task: HouseholdTask | null; preset: { title?: string; locationId?: string | null } | null } | null;
  onClose: () => void;
  today: string;
}) {
  return (
    <ChoreEditorDialog
      open={editor !== null}
      onOpenChange={(next) => !next && onClose()}
      task={editor?.task ?? null}
      preset={editor?.preset ?? null}
      defaultDate={today}
    />
  );
}
