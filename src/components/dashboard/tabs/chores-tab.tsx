"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ClipboardList, Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { OverdueSection } from "@/components/agenda/overdue-section";
import { StaffCompletionStrip } from "@/components/dashboard/staff-completion-strip";
import { StaffWorkloadSheet } from "@/components/dashboard/staff-workload-sheet";
import { dayLabel } from "@/lib/date-label";
import { DateRibbon } from "@/components/date-ribbon";
import { ChoreCard } from "@/components/chores/chore-card";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { BillsUpkeepSheet } from "@/components/chores/bills-upkeep-sheet";
import { RoomsView } from "@/components/chores/rooms-view";
import { RepairsView } from "@/components/repairs/repairs-view";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { useChoresView } from "@/hooks/use-chores-view";
import { useScrollTopOnChange } from "@/hooks/use-tab-navigation";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useLocationName } from "@/hooks/use-household-locations";
import { useToday } from "@/hooks/use-today";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { replaceInPlace } from "@/lib/in-place-navigation";
import { useFormatTime } from "@/components/ui/ui-labels";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import type { HouseholdTask } from "@/types/database";

/**
 * The owner's chore desk: what the house owes on the selected day, and the
 * only place chores are created, edited or deleted (Phase 100).
 *
 * Owner-facing, in the language the owner chose (Phase 149), and
 * owner-only in capability: the staff view imports none of this.
 */
export function ChoresTab() {
  const { view, setView } = useChoresView();
  const t = useT();
  useScrollTopOnChange(view);

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      {/* Today · Rooms (Phase 158): the same chores, by day or by room. The
          pill reads ?chores= from the URL, like the Kitchen's. */}
      <SegmentedControl
        ariaLabel={t("Chores", "Tugas")}
        segments={[
          { value: "today", label: t("Today", "Hari ini") },
          { value: "rooms", label: t("Rooms", "Ruangan") },
          { value: "repairs", label: t("Repairs", "Perbaikan") },
        ]}
        value={view}
        onChange={setView}
      />
      <WhatsNewCard id="rooms-2026-11" onTry={view === "rooms" ? undefined : () => setView("rooms")} />
      <WhatsNewCard id="room-picker-2026-11" />
      <WhatsNewCard id="repairs-2026-11" onTry={view === "repairs" ? undefined : () => setView("repairs")} />
      {view === "rooms" ? <RoomsView /> : view === "repairs" ? <RepairsView /> : <TodayChores />}
    </div>
  );
}

/** The day's chores: what the house owes on the selected day (Phase 100). */
function TodayChores() {
  const { selectedDate, setSelectedDate, householdTasks, memberProfile } = useHousehold();
  const locale = useOwnerLocale();
  const t = useT();
  // No chore exists at all, as opposed to none falling on this day: a new
  // household should be told to make its first, not that today is free
  // (Phase 120).
  const noChoresYet = householdTasks.length === 0;
  const { allProfiles } = useStaffProfiles();
  // Default fallback ("Staff"), not "Unassigned": the two null cases mean
  // different things. An absent assigned_to is genuinely unassigned and is
  // spelled out on the badge; an id this roster cannot resolve — a profile
  // still loading — is a name we don't have, not an empty chore.
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));
  const roomName = useLocationName();
  const occurrences = useChoreOccurrences();
  const today = useToday();
  const dateStr = formatDateLocal(selectedDate);

  const [editing, setEditing] = useState<HouseholdTask | null>(null);
  // The day the editor was opened from (Phase 128): what "skip this day" and
  // "end the repeat here" act on. Null when adding.
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // "Other bill" from the checklist: the form, preset as a monthly bill for me.
  const [editorPreset, setEditorPreset] = useState<ComponentProps<typeof ChoreEditorDialog>["preset"]>(null);

  // Bills and upkeep (Phase 164): the checklist. Today's What's new card
  // opens it here with ?bills=open, which is then dropped from the URL so
  // Back and a reload don't reopen it.
  const [billsOpen, setBillsOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  useEffect(() => {
    if (searchParams.get("bills") !== "open") return;
    setBillsOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("bills");
    const query = params.toString();
    replaceInPlace(query ? `${pathname}?${query}` : pathname);
  }, [searchParams, pathname]);

  // Rolled-over chores lead the open list under their own header (Phase 113),
  // oldest first; only ever non-empty when browsing today.
  const { overdue, open, done } = useMemo(
    () => ({
      overdue: occurrences
        .filter((o) => o.overdue && o.status !== "completed")
        .sort((a, b) => a.date.localeCompare(b.date)),
      open: occurrences.filter((o) => o.status !== "completed" && !o.overdue),
      done: occurrences.filter((o) => o.status === "completed"),
    }),
    [occurrences]
  );

  function edit(occurrence: ChoreOccurrence) {
    // A repeat is edited through its template from whichever day you tapped;
    // an occurrence that already has its own row edits that row.
    setEditorPreset(null);
    setEditing(occurrence.row ?? occurrence.template);
    setEditingDate(occurrence.date);
    setEditorOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <DateRibbon value={selectedDate} onChange={setSelectedDate} locale={locale} />

      <StaffCompletionStrip
        occurrences={occurrences}
        date={dateStr}
        dayLabel={dayLabel(selectedDate, today, locale)}
      />

      {/* Its tutorial (Phase 164, D9); Show me opens the checklist. */}
      <WhatsNewCard id="bills-2026-11" onTry={() => setBillsOpen(true)} />

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{t("Chores", "Tugas")}</h2>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            className="min-h-[36px] shrink-0 px-3 text-xs"
            onClick={() => setBillsOpen(true)}
          >
            <ReceiptText className="size-3.5" /> {t("Bills and upkeep", "Tagihan dan perawatan")}
          </Button>
          <Button
            variant="outline"
            className="min-h-[36px] shrink-0 px-3 text-xs"
            onClick={() => {
              setEditorPreset(null);
              setEditing(null);
              setEditingDate(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="size-3.5" /> {t("Add Chore", "Tambah Tugas")}
          </Button>
        </div>
      </div>

      {occurrences.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={
            noChoresYet
              ? t("No chores yet", "Belum ada tugas")
              : t("No chores on this day", "Tidak ada tugas hari ini")
          }
          description={
            noChoresYet
              ? t(
                  "Add your first chore — once or repeating — and your staff see it straight away.",
                  "Tambahkan tugas pertama Anda — sekali atau berulang — dan staf Anda langsung melihatnya."
                )
              : t(
                  "Add one and your staff see it straight away.",
                  "Tambahkan satu dan staf Anda langsung melihatnya."
                )
          }
        >
          <Button
            className="min-h-[44px]"
            onClick={() => {
              setEditorPreset(null);
              setEditing(null);
              setEditingDate(null);
              setEditorOpen(true);
            }}
          >
            <Plus /> {t("Add Chore", "Tambah Tugas")}
          </Button>
        </EmptyState>
      ) : (
        <>
          {overdue.length > 0 && (
            <OverdueSection count={overdue.length} locale={locale}>
              {overdue.map((occurrence) => (
                <ChoreCard
                  key={occurrence.key}
                  occurrence={occurrence}
                  locationName={roomName(occurrence.task.location_id, occurrence.task.spot)}
                  locale={locale}
                  today={today}
                  assigneeName={
                    occurrence.task.assigned_to ? staffName(occurrence.task.assigned_to) : null
                  }
                  onPress={() => edit(occurrence)}
                  editable
                />
              ))}
            </OverdueSection>
          )}

          <div className="flex flex-col gap-2">
            {open.map((occurrence) => (
              <ChoreCard
                key={occurrence.key}
                occurrence={occurrence}
                locationName={roomName(occurrence.task.location_id, occurrence.task.spot)}
                locale={locale}
                today={today}
                assigneeName={
                  occurrence.task.assigned_to ? staffName(occurrence.task.assigned_to) : null
                }
                onPress={() => edit(occurrence)}
                editable
              />
            ))}
            {open.length === 0 && overdue.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("Everything on this day is done.", "Semua tugas hari ini sudah selesai.")}
              </p>
            )}
          </div>

          {done.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-gray-500">{t("Completed", "Selesai")}</h3>
              {done.map((occurrence) => (
                // No onPress on a completed chore: its footer holds the proof
                // photos, which are themselves buttons, and a button inside a
                // button is invalid HTML that browsers resolve however they
                // like. The explicit Edit control in the footer is the way in.
                <ChoreCard
                  key={occurrence.key}
                  occurrence={occurrence}
                  locationName={roomName(occurrence.task.location_id, occurrence.task.spot)}
                  locale={locale}
                  today={today}
                  assigneeName={
                    occurrence.task.assigned_to ? staffName(occurrence.task.assigned_to) : null
                  }
                  footer={
                    <ChoreProof
                      occurrence={occurrence}
                      staffName={staffName}
                      onEdit={() => edit(occurrence)}
                    />
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Opened from the progress strip; open while ?workload= is set. */}
      <StaffWorkloadSheet />

      <ChoreEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        task={editing}
        occurrenceDate={editingDate}
        defaultDate={dateStr}
        preset={editorPreset}
      />

      <BillsUpkeepSheet
        open={billsOpen}
        onOpenChange={setBillsOpen}
        onOtherBill={() => {
          setBillsOpen(false);
          setEditorPreset({
            category: "bill",
            recurrence: "monthly",
            interval: 1,
            remindDaysBefore: 3,
            assigneeId: memberProfile?.id ?? null,
          });
          setEditing(null);
          setEditingDate(null);
          setEditorOpen(true);
        }}
      />
    </div>
  );
}

/**
 * Who finished a chore and when, plus the owner's way into editing it.
 *
 * The before/after photos used to live here as two small thumbnails; they are
 * part of the card itself now (ChoreProofPhotos, Phase 113).
 */
function ChoreProof({
  occurrence,
  staffName,
  onEdit,
}: {
  occurrence: ChoreOccurrence;
  staffName: (id: string) => string;
  onEdit: () => void;
}) {
  const formatTime = useFormatTime();
  const t = useT();
  const row = occurrence.row;
  // A completed occurrence always has a row — it is what records the
  // completion — so this is a type guard rather than a real case.
  if (!row) return null;

  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      {row.completed_by && (
        <p className="text-[11px] text-muted-foreground">
          {t("Done by", "Diselesaikan oleh")} {staffName(row.completed_by)}
          {row.completed_at && ` · ${formatTime(new Date(row.completed_at))}`}
        </p>
      )}

      <button
        type="button"
        onClick={onEdit}
        className="self-start rounded-lg px-1 py-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2 active:bg-muted"
      >
        {t("Edit chore", "Ubah tugas")}
      </button>
    </div>
  );
}
