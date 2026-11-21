"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ClipboardList, ListChecks, Plus, ReceiptText, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRibbon } from "@/components/date-ribbon";
import { ChoreRow } from "@/components/chores/chore-row";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { BillsUpkeepSheet } from "@/components/chores/bills-upkeep-sheet";
import { StarterListSheet } from "@/components/setup/starter-list-sheet";
import { BillPaymentSheet } from "@/components/chores/bill-payment-editor";
import { RoomsView } from "@/components/chores/rooms-view";
import { RepairsView } from "@/components/repairs/repairs-view";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { useChoresView } from "@/hooks/use-chores-view";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useScrollTopOnChange } from "@/hooks/use-tab-navigation";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useLocationName } from "@/hooks/use-household-locations";
import { useToday } from "@/hooks/use-today";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { dayKeyLabel } from "@/lib/date-label";
import { replaceInPlace } from "@/lib/in-place-navigation";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import type { HouseholdTask } from "@/types/database";

/**
 * The Home tab (Phase 175; the Chores tab until then): the owner's chore
 * desk — what the house owes on the selected day, and the only place chores
 * are created, edited or deleted (Phase 100) — with the rooms and repairs.
 *
 * Owner-facing, in the language the owner chose (Phase 149), and
 * owner-only in capability: the staff view imports none of this.
 */
export function ChoresTab() {
  const { view, setView } = useChoresView();
  const t = useT();
  // Repairs switched off (Phase 171): no pill, no card about it.
  const { repairs: repairsOn } = useHouseholdFeatures();
  useScrollTopOnChange(view);

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      {/* Rooms · Chores · Repairs (Phase 158, 159; renamed in Phase 175, when
          this tab became Home; Rooms first on 21 Nov, when Home moved to the
          centre and opens on the house). The pill reads ?chores= from the
          URL, like the Kitchen's: none is Rooms, `today` is Chores. */}
      <SegmentedControl
        ariaLabel={t("Home", "Rumah")}
        segments={[
          { value: "rooms", label: t("Rooms", "Ruangan") },
          { value: "today", label: t("Chores", "Tugas") },
          ...(repairsOn ? [{ value: "repairs" as const, label: t("Repairs", "Perbaikan") }] : []),
        ]}
        value={view}
        onChange={setView}
      />
      <WhatsNewCard id="home-centre-2026-11" onTry={view === "rooms" ? undefined : () => setView("rooms")} />
      <WhatsNewCard id="rooms-2026-11" onTry={view === "rooms" ? undefined : () => setView("rooms")} />
      <WhatsNewCard id="room-picker-2026-11" />
      {repairsOn && (
        <WhatsNewCard id="repairs-2026-11" onTry={view === "repairs" ? undefined : () => setView("repairs")} />
      )}
      {view === "rooms" ? <RoomsView /> : view === "repairs" ? <RepairsView /> : <TodayChores />}
    </div>
  );
}

/** The day's chores: what the house owes on the selected day (Phase 100). */
function TodayChores() {
  const { selectedDate, setSelectedDate, householdTasks, memberProfile } = useHousehold();
  // Bills and upkeep switched off (Phase 171): no checklist, no card.
  const { bills: billsOn } = useHouseholdFeatures();
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
  // Starter list (Phase 172 PR A2, D7): the usual rooms and chores, ticked in.
  const [starterOpen, setStarterOpen] = useState(false);
  const [paymentFor, setPaymentFor] = useState<ChoreOccurrence | null>(null);
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

  // Rolled-over chores lead under their own label (Phase 113), oldest first;
  // only ever non-empty when browsing today. The day's own chores, open and
  // done together, by time: a finished chore stays in its place (07).
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

  const day = useMemo(
    () =>
      [...open, ...done].sort(
        (a, b) => (a.task.due_time ?? "99").localeCompare(b.task.due_time ?? "99") || a.task.title.localeCompare(b.task.title)
      ),
    [open, done]
  );
  const dayHeading = dateStr === formatDateLocal(today) ? t("Today", "Hari ini") : dayKeyLabel(dateStr, today, locale);

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

      {/* Staff progress lives on Today since the owners asked (11 Nov):
          house and pets per person, so Chores stays the chore desk. */}

      {/* Its tutorial (Phase 164, D9); Show me opens the checklist. */}
      {billsOn && <WhatsNewCard id="bills-2026-11" onTry={() => setBillsOpen(true)} />}
      <WhatsNewCard id="starter-list-2026-11" onTry={() => setStarterOpen(true)} />

      {/* No "Chores" heading: the chosen pill says it (07). The ways to add
          by hand stay here until the one "+" at the top right. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            className="min-h-[36px] shrink-0 px-3 text-xs"
            onClick={() => setStarterOpen(true)}
          >
            <ListChecks className="size-3.5" /> {t("Starter list", "Daftar awal")}
          </Button>
          {billsOn && (
            <Button
              variant="outline"
              className="min-h-[36px] shrink-0 px-3 text-xs"
              onClick={() => setBillsOpen(true)}
            >
              <ReceiptText className="size-3.5" /> {t("Bills and upkeep", "Tagihan dan perawatan")}
            </Button>
          )}
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
          {/* Plain rows (21 Nov; Fable's 07, section 2): what is left from
              earlier days under an amber label, not in a box; then the day's
              chores in time order, done ones quiet with a tick, in place. */}
          {overdue.length > 0 && (
            <section aria-label={t("From earlier", "Dari hari sebelumnya")} className="flex flex-col gap-1.5">
              <h3 className="flex items-center gap-1.5 px-1 text-sm font-semibold text-attention">
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                {t("From earlier", "Dari hari sebelumnya")}
              </h3>
              <div className="inset-rows flex flex-col overflow-hidden rounded-2xl bg-card shadow-card [--row-inset:0.75rem]">
                {overdue.map((occurrence) => (
                  <ChoreRow
                    key={occurrence.key}
                    occurrence={occurrence}
                    locale={locale}
                    today={today}
                    assigneeName={occurrence.task.assigned_to ? staffName(occurrence.task.assigned_to) : null}
                    locationName={roomName(occurrence.task.location_id, occurrence.task.spot)}
                    onEdit={() => edit(occurrence)}
                  />
                ))}
              </div>
            </section>
          )}

          {day.length > 0 && (
            <section aria-label={dayHeading} className="flex flex-col gap-1.5">
              <h3 className="px-1 text-sm font-semibold text-muted-foreground">{dayHeading}</h3>
              <div className="inset-rows flex flex-col overflow-hidden rounded-2xl bg-card shadow-card [--row-inset:0.75rem]">
                {day.map((occurrence) => (
                  <ChoreRow
                    key={occurrence.key}
                    occurrence={occurrence}
                    locale={locale}
                    today={today}
                    assigneeName={occurrence.task.assigned_to ? staffName(occurrence.task.assigned_to) : null}
                    locationName={roomName(occurrence.task.location_id, occurrence.task.spot)}
                    doneByName={occurrence.row?.completed_by ? staffName(occurrence.row.completed_by) : null}
                    onEdit={() => edit(occurrence)}
                    onPayment={
                      occurrence.status === "completed" && occurrence.task.category === "bill"
                        ? () => setPaymentFor(occurrence)
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          )}
          {open.length === 0 && overdue.length === 0 && (
            <p className="px-1 text-sm text-muted-foreground">
              {t("Everything on this day is done.", "Semua tugas hari ini sudah selesai.")}
            </p>
          )}
        </>
      )}

      <ChoreEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        task={editing}
        occurrenceDate={editingDate}
        defaultDate={dateStr}
        preset={editorPreset}
      />

      {/* A done bill's amount and receipt, whoever finished it (Codex, PR #65). */}
      <BillPaymentSheet
        row={paymentFor?.row ?? null}
        seriesId={paymentFor?.template.id ?? ""}
        title={paymentFor?.task.title ?? ""}
        open={!!paymentFor}
        onOpenChange={(next) => !next && setPaymentFor(null)}
      />

      <StarterListSheet open={starterOpen} onOpenChange={setStarterOpen} />

      <BillsUpkeepSheet
        open={billsOpen && billsOn}
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
