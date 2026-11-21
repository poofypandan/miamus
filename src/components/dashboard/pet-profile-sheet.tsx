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
import { PetFormDialog } from "@/components/dashboard/pet-form-dialog";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { ScheduleEditor } from "@/components/dashboard/schedule-editor";
import { HealthRecordCard } from "@/components/dashboard/health-record-card";
import { HealthRecordForm } from "@/components/dashboard/health-record-form";
import { PhotoLightbox } from "@/components/dashboard/photo-lightbox";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useToday } from "@/hooks/use-today";
import { getPetMeta, isAdmitted, petFocus, petMasterUrl, petPictureKind } from "@/lib/pets";
import { photoSrc } from "@/lib/photos";
import { FocusImg } from "@/components/pets/focus-img";
import type { TaskEntity } from "@/types/database";
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
  const locale = useOwnerLocale();
  const t = useT();
  const [editOpen, setEditOpen] = useState(false);
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [viewingAvatar, setViewingAvatar] = useState(false);
  const pet = pets.find((p) => p.id === activePetId) ?? null;
  const canManagePets = userRole === "owner";
  // The LIGHTBOX's image, and nothing else: the uncropped original where one
  // exists, the square otherwise. Named for what it is — it was called
  // `avatarUrl` and sat one line from the header avatar, which read as though
  // the header rendered it. The header renders MiniPetAvatar, which sources
  // the 1:1 crop and only that (Phase 105).
  const masterUrl = pet ? petMasterUrl(pet) : null;

  // Back closes the sheet rather than leaving the dashboard behind it. The
  // nested Add Health Record dialog registers separately so Back unwinds one
  // layer at a time; it's gated on `pet` too, so closing the sheet out from
  // under it can't strand a history entry for an unmounted dialog.
  useBackToClose(!!pet, () => setActivePetId(null));
  useBackToClose(!!pet && addRecordOpen, () => setAddRecordOpen(false));

  const dateStr = formatDateLocal(selectedDate);
  const label = dayLabel(selectedDate, useToday(), locale);

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
            {/* The pet's page leads with its full photo, edge to edge, the
                name and breed on it (21 Nov; Fable's 08, section 5). An old
                small square is a print on paper, never stretched; no photo is
                warm paper with the initial. A tap on a photo opens it whole. */}
            <SheetHeader className="-mx-4 -mt-px gap-0 p-0">
              <PetHero pet={pet} onOpenPhoto={masterUrl ? () => setViewingAvatar(true) : undefined} />
              <SheetDescription className="sr-only">
                {t(
                  `${pet.name}'s daily feed, schedule, and health passport.`,
                  `Catatan harian, jadwal, dan catatan kesehatan ${pet.name}.`
                )}
              </SheetDescription>
            </SheetHeader>
            {canManagePets && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-gray-600 active:bg-muted"
                >
                  <Edit2 className="mr-1 size-4" /> {t("Edit Pet", "Ubah Hewan")}
                </button>
              </div>
            )}

            {/* Above everything else, because while it is true nothing below
                it is actionable: the dog's routines are suspended until it is
                collected. In the owner's language. */}
            {isAdmitted(pet) && (
              <div className="mt-4 flex flex-col gap-2 rounded-xl border bg-card p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                  <Stethoscope className="size-4 shrink-0 text-muted-foreground" />{" "}
                  {t(`${pet.name} is at the vet`, `${pet.name} sedang dirawat di klinik`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    `Daily meals and potty breaks are paused until ${pet.name} is home.`,
                    `Makan dan Pipis & Pup harian berhenti dulu sampai ${pet.name} pulang.`
                  )}
                </p>
                <DischargeButton
                  pet={pet}
                  label={t("Back home from the vet", "Sudah pulang dari klinik")}
                  successMessage={t(
                    `${pet.name} is home — routines resumed`,
                    `${pet.name} sudah pulang — rutinitas berjalan lagi`
                  )}
                  errorMessage={t("Couldn't update status", "Status gagal diperbarui")}
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
              <DateRibbon value={selectedDate} onChange={setSelectedDate} locale={locale} />
            </div>

            <section className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
                {t(`${label}'s Overview`, `Ringkasan ${label}`)}
              </h3>
              <SummaryCard items={items} />
              <h3 className="mt-8 mb-3 text-sm font-semibold text-gray-900">{t("Photos", "Foto")}</h3>
              <PhotoStream logs={todaysLogs} entities={entities} />
            </section>

            {canManagePets && (
              <section className="mt-8">
                {/* Carries the same {label}'s prefix as the Overview heading
                    above, so browsing to another date via the ribbon renames
                    both rather than leaving one claiming "Today's". */}
                <h3 className="mb-3 text-sm font-semibold text-gray-900">
                  {t(`${label}'s Timeline`, `Jadwal ${label}`)}
                </h3>
                <ScheduleEditor entity={pet} />
              </section>
            )}

            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{t("Health record", "Catatan kesehatan")}</h3>
                {canManagePets && (
                  <Dialog open={addRecordOpen} onOpenChange={setAddRecordOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus /> {t("Add record", "Tambah catatan")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>{t("Add Health Record", "Tambah Catatan Kesehatan")}</DialogTitle>
                      </DialogHeader>
                      <HealthRecordForm petId={pet.id} onSaved={() => setAddRecordOpen(false)} />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              {healthRecords.length === 0 ? (
                <p className="pt-4 text-center text-sm text-muted-foreground">
                  {t("No health records yet.", "Belum ada catatan kesehatan.")}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {healthRecords.map((record) => (
                    <HealthRecordCard key={record.id} record={record} dogName={pet.name} />
                  ))}
                </div>
              )}
            </section>

            <PhotoLightbox
              open={viewingAvatar && !!masterUrl}
              onClose={() => setViewingAvatar(false)}
              items={[{ src: masterUrl ?? undefined, alt: pet.name, title: pet.name }]}
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

/** The top of a pet's page: its photo, the name and the breed on it. */
function PetHero({ pet, onOpenPhoto }: { pet: TaskEntity; onOpenPhoto?: () => void }) {
  const t = useT();
  const meta = getPetMeta(pet);
  const kind = petPictureKind(pet);
  const focus = petFocus(pet);
  const breed = meta.breed?.trim();
  const words = (
    <>
      <SheetTitle className="truncate text-[30px] leading-9 font-semibold tracking-[-0.03em] text-inherit">{pet.name}</SheetTitle>
      {breed && <p className="truncate text-base opacity-85">{breed}</p>}
    </>
  );
  if (kind === "full") {
    const photo = (
      <>
        <FocusImg
          src={photoSrc(meta.full_image_url ?? null, 1280)}
          focus={focus}
          className="absolute inset-0 size-full bg-zinc-200 object-cover"
        />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      </>
    );
    return (
      <div className="relative aspect-[4/5] max-h-[58vh] w-full overflow-hidden rounded-t-2xl text-[#fff6e8]">
        {onOpenPhoto ? (
          <button
            type="button"
            onClick={onOpenPhoto}
            aria-label={t(`View ${pet.name}'s photo`, `Lihat foto ${pet.name}`)}
            className="absolute inset-0"
          >
            {photo}
          </button>
        ) : (
          photo
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col px-5 pb-4">{words}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-t-2xl bg-[#f3ece1] px-5 pt-8 pb-5 text-gray-900">
      {kind === "print" ? (
        <button
          type="button"
          onClick={onOpenPhoto}
          aria-label={t(`View ${pet.name}'s photo`, `Lihat foto ${pet.name}`)}
          className="rounded-md"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoSrc(meta.avatar_url ?? null, 320)}
            alt=""
            className="size-40 rounded-md bg-zinc-100 object-cover shadow-[0_2px_8px_rgb(60_40_20/0.18)] ring-4 ring-white"
          />
        </button>
      ) : (
        <span aria-hidden className="text-[96px] leading-none font-semibold text-[#e2d6c3]">
          {pet.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="flex max-w-full flex-col items-center text-center">{words}</div>
    </div>
  );
}
