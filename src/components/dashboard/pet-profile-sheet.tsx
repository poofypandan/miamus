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
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { PetFormDialog } from "@/components/dashboard/pet-form-dialog";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { ScheduleEditor } from "@/components/dashboard/schedule-editor";
import { HealthRecordCard } from "@/components/dashboard/health-record-card";
import { HealthRecordForm } from "@/components/dashboard/health-record-form";
import { useHousehold } from "@/context/household-context";
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
    userRole,
    createEntity,
    updateEntity,
    deleteEntity,
  } = useHousehold();
  const [editOpen, setEditOpen] = useState(false);
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const pet = pets.find((p) => p.id === activePetId) ?? null;
  const canManagePets = userRole === "owner";

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
                  <MiniPetAvatar pet={pet} className="size-20" />
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

            <section className="mt-6">
              <h3 className="mb-3 text-sm font-medium text-gray-500">{label}&apos;s Overview</h3>
              <SummaryCard items={items} />
              <h3 className="mt-8 mb-3 text-sm font-medium text-gray-500">Photos</h3>
              <PhotoStream logs={todaysLogs} entities={entities} />
            </section>

            {canManagePets && (
              <section className="mt-8">
                {/* Carries the same {label}'s prefix as the Overview heading
                    above, so browsing to another date via the ribbon renames
                    both rather than leaving one claiming "Today's". */}
                <h3 className="mb-3 text-sm font-medium text-gray-500">
                  {label}&apos;s Timeline
                </h3>
                <ScheduleEditor entity={pet} />
              </section>
            )}

            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-gray-500">Health Passport</h3>
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
