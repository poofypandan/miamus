"use client";

import { useMemo, useState } from "react";
import { Edit2, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Stethoscope } from "lucide-react";
import { DateRibbon } from "@/components/date-ribbon";
import { DischargeButton } from "@/components/dashboard/discharge-button";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { PetFormDialog } from "@/components/dashboard/pet-form-dialog";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { ScheduleEditor } from "@/components/dashboard/schedule-editor";
import { HealthRecordCard } from "@/components/dashboard/health-record-card";
import { HealthRecordForm } from "@/components/dashboard/health-record-form";
import { PhotoLightbox } from "@/components/dashboard/photo-lightbox";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { getPetMeta, isAdmitted } from "@/lib/pets";
import { dayLabel } from "@/lib/date-label";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";

// The single detail view for a pet, replacing the old per-tab drill-downs —
// opens as a bottom sheet whenever `activePetId` is set, from anywhere (both
// Daily Feed and Schedule set the same global id), and closing it (X,
// backdrop, or Escape) is exactly `setActivePetId(null)`. Since Phase 36 this
// is also the only route to a pet's health passport.
export function PetProfileSheet() {
  const {
    pets,
    entities,
    schedules,
    logs,
    medicalRecords,
    activePetId,
    setActivePetId,
    selectedDate,
    setSelectedDate,
    userRole,
    createEntity,
    updateEntity,
    deleteEntity,
  } = useHousehold();
  const [editOpen, setEditOpen] = useState(false);
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [viewingAvatar, setViewingAvatar] = useState(false);
  const pet = pets.find((p) => p.id === activePetId) ?? null;
  const canManagePets = userRole === "owner";
  const avatarUrl = pet ? getPetMeta(pet).avatar_url : null;

  // Back closes the sheet rather than leaving the dashboard behind it. The
  // nested Add Health Record dialog registers separately so Back unwinds one
  // layer at a time; it's gated on `pet` too, so closing the sheet out from
  // under it can't strand a history entry for an unmounted dialog.
  useBackToClose(!!pet, () => setActivePetId(null));
  useBackToClose(!!pet && addRecordOpen, () => setAddRecordOpen(false));

  const dateStr = formatDateLocal(selectedDate);
  const label = dayLabel(selectedDate);

  const items = useMemo(() => {
    if (!pet) return [];
    const groups = buildAgenda({ date: dateStr, entities: [pet], schedules, logs });
    return groups.flatMap((g) => g.items);
  }, [pet, dateStr, schedules, logs]);

  const todaysLogs = useMemo(() => {
    if (!pet) return [];
    return logs.filter(
      (l) => l.entity_id === pet.id && formatDateLocal(new Date(l.completed_at)) === dateStr
    );
  }, [pet, logs, dateStr]);

  const healthRecords = useMemo(() => {
    if (!pet) return [];
    return [...medicalRecords]
      .filter((r) => r.entity_id === pet.id)
      .sort((a, b) => (b.administered_at ?? b.created_at).localeCompare(a.administered_at ?? a.created_at));
  }, [pet, medicalRecords]);

  return (
    <Sheet
      open={!!pet}
      onOpenChange={(open) => {
        if (!open) setActivePetId(null);
      }}
    >
      <SheetContent
        side="bottom"
        // An inline style, not a Tailwind class — SheetContent's own base
        // classes already hardcode `data-[side=bottom]:h-auto`, which wins
        // over a `h-[92vh]` class at equal CSS specificity by appearing
        // later in the generated stylesheet. Without a real height cap the
        // sheet grows to fit all its content and, anchored by `bottom-0`,
        // pushes its own header off the top of the viewport with no way to
        // scroll back to it (confirmed live: the header was rendered ~130px
        // above y=0). An inline style always wins regardless of specificity.
        style={{ height: "92vh" }}
        className="gap-0 overflow-y-auto rounded-t-2xl px-4 pb-10"
      >
        {pet && (
          <>
            <SheetHeader className="gap-0 px-0 pt-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* MiniPetAvatar is a squircle natively since Phase 59, so no
                      shape override here — only the larger corner that suits an
                      80px header portrait. Tappable only when there is a real
                      photo to open; the fallback Dog glyph has nothing to
                      expand. */}
                  {avatarUrl ? (
                    <button
                      type="button"
                      onClick={() => setViewingAvatar(true)}
                      aria-label={`Lihat foto ${pet.name}`}
                      className="shrink-0 rounded-2xl transition-transform active:scale-95"
                    >
                      <MiniPetAvatar pet={pet} className="size-20 rounded-2xl" />
                    </button>
                  ) : (
                    <MiniPetAvatar pet={pet} className="size-20 rounded-2xl" />
                  )}
                  <SheetTitle className="text-2xl">{pet.name}</SheetTitle>
                </div>
                {canManagePets && (
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="flex items-center text-sm font-medium text-gray-500 transition-colors hover:text-black"
                  >
                    <Edit2 className="mr-1 size-4" /> Edit Pet
                  </button>
                )}
              </div>
              <SheetDescription className="sr-only">
                {pet.name}&apos;s daily feed, schedule, and health passport.
              </SheetDescription>
            </SheetHeader>

            {/* Above everything else, because while it is true nothing below
                it is actionable: the dog's routines are suspended until it is
                collected. Owner-facing, so English. */}
            {isAdmitted(pet) && (
              <div className="mt-4 flex flex-col gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-indigo-900">
                  <Stethoscope className="size-4 shrink-0" /> {pet.name} is at the clinic
                </p>
                <p className="text-xs text-indigo-900/80">
                  Daily meals and potty breaks are paused until {pet.name} is collected.
                </p>
                <DischargeButton
                  pet={pet}
                  label="Bring Home from Clinic"
                  successMessage={`${pet.name} is home — routines resumed`}
                  errorMessage="Couldn't update status"
                />
              </div>
            )}

            {/* The same ribbon and the same global date as the dashboard, so
                stepping back a day here leaves the feed underneath showing that
                day too, rather than the two disagreeing once the sheet closes.
                Sits directly under the name: everything below it — the
                overview, the photos, the timeline — is about the day it
                selects.

                Deliberately no -mx-4 bleed. The dashboard's own ribbon sits in
                a px-4 box (dashboard/page.tsx), so inheriting this sheet's px-4
                puts the two at an identical inset — measured 16px on both, and
                the days scroll under the same edge. Letting it run to the
                screen edge here would make the sheet the odd one out. */}
            <div className="mt-4">
              <DateRibbon value={selectedDate} onChange={setSelectedDate} />
            </div>

            <section className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">{label}&apos;s Overview</h3>
              <SummaryCard items={items} />
              <h3 className="mt-8 mb-3 text-sm font-semibold text-gray-900">Photos</h3>
              <PhotoStream logs={todaysLogs} entities={entities} />
            </section>

            {canManagePets && (
              <section className="mt-8">
                {/* Carries the same {label}'s prefix as the Overview heading
                    above, so browsing to another date via the ribbon renames
                    both rather than leaving one claiming "Today's". */}
                <h3 className="mb-3 text-sm font-semibold text-gray-900">
                  {label}&apos;s Timeline
                </h3>
                <ScheduleEditor entity={pet} />
              </section>
            )}

            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Health Passport</h3>
                {canManagePets && (
                  <Dialog open={addRecordOpen} onOpenChange={setAddRecordOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus /> Add record
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Health Record</DialogTitle>
                      </DialogHeader>
                      <HealthRecordForm petId={pet.id} onSaved={() => setAddRecordOpen(false)} />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              {healthRecords.length === 0 ? (
                <p className="pt-4 text-center text-sm text-muted-foreground">No health records yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {healthRecords.map((record) => (
                    <HealthRecordCard key={record.id} record={record} dogName={pet.name} />
                  ))}
                </div>
              )}
            </section>

            <PhotoLightbox
              open={viewingAvatar && !!avatarUrl}
              onClose={() => setViewingAvatar(false)}
              items={[{ src: avatarUrl ?? undefined, alt: pet.name, title: pet.name }]}
            />

            {canManagePets && (
              <PetFormDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                pet={pet}
                createEntity={createEntity}
                updateEntity={updateEntity}
                deleteEntity={deleteEntity}
              />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
