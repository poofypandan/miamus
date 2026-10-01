"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Droplets,
  Stethoscope,
  Utensils,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { PhotoLightbox } from "@/components/dashboard/photo-lightbox";
import { useHousehold } from "@/context/household-context";
import { useLongPress } from "@/hooks/use-long-press";
import { getPetMeta, isAdmitted } from "@/lib/pets";
import { POTTY_TITLE } from "@/lib/schedule-categories";
import { buildAgenda, formatDateLocal, type AgendaItem } from "@/lib/scheduleEngine";
import type { MasterSchedule, TaskEntity, TaskLog } from "@/types/database";

/**
 * How far each dog has got through the day.
 *
 * Purely a progress tracker since Phase 101 — the "Add Pets" button it used to
 * carry moved to the Pets tab, where the rest of the directory work lives.
 * This card is about a day; adding a pet is not.
 *
 * `date` is a prop rather than read from context (Phase 102): the Pets tab
 * browses time on its own ribbon, independently of the Agenda's, so the card
 * has to be told which day it is showing instead of assuming there is only
 * one. Omitted, it falls back to the shared date, which is what every other
 * surface still uses.
 */
export function UnifiedSummaryCard({ date }: { date?: Date }) {
  const { pets, schedules, logs, selectedDate } = useHousehold();
  const shownDate = date ?? selectedDate;

  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col px-4">
        <div className="flex flex-col divide-y">
          {pets.map((pet) => (
            <PetOverviewRow key={pet.id} pet={pet} schedules={schedules} logs={logs} date={shownDate} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStatusIcon({ status }: { status: AgendaItem["status"] | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  if (status === "completed") return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === "overdue") return <XCircle className="size-4 text-red-500" />;
  return <Clock className="size-4 text-amber-500" />;
}

function PetOverviewRow({
  pet,
  schedules,
  logs,
  date,
}: {
  pet: TaskEntity;
  schedules: MasterSchedule[];
  logs: TaskLog[];
  date: Date;
}) {
  const { setActivePetId } = useHousehold();
  const [viewingAvatar, setViewingAvatar] = useState(false);
  const avatarUrl = getPetMeta(pet).avatar_url;
  // Hold the avatar to see the uncropped photo without opening the whole
  // profile sheet. Only armed when there is a photo to show.
  const longPress = useLongPress(() => {
    if (avatarUrl) setViewingAvatar(true);
  });
  const dateStr = formatDateLocal(date);
  const items = useMemo(() => {
    const groups = buildAgenda({ date: dateStr, entities: [pet], schedules, logs });
    return groups.flatMap((g) => g.items);
  }, [dateStr, pet, schedules, logs]);

  const admitted = isAdmitted(pet);
  const potty = items.filter((i) => i.title === POTTY_TITLE);
  const pottyDone = potty.filter((i) => i.status === "completed").length;
  const lunch = items.find((i) => i.title === "Makan Siang");
  const dinner = items.find((i) => i.title === "Makan Malam");

  return (
    <>
      <PhotoLightbox
        open={viewingAvatar && !!avatarUrl}
        onClose={() => setViewingAvatar(false)}
        items={[{ src: avatarUrl ?? undefined, alt: pet.name, title: pet.name }]}
      />
      <button
        type="button"
        onClick={() => setActivePetId(pet.id)}
        className="flex w-full cursor-pointer items-center gap-3 py-2.5 text-left text-sm first:pt-0 last:pb-0 active:bg-gray-50"
      >
      {/* Nested inside the row button on purpose: a <div>, never another
          <button>, since a button inside a button is invalid HTML and breaks
          the row's own click. useLongPress stops propagation so the hold never
          reaches the row.

          touch-pan-y rather than touch-none: touch-none would stop the page
          scrolling whenever a drag happened to start on an avatar — the exact
          bug Phase 39 had to undo on the photo grid. The iOS save-image
          callout is suppressed by WebkitTouchCallout + onContextMenu, which is
          what actually matters here; touch-action plays no part in it. */}
      <div
        {...longPress}
        style={{ WebkitTouchCallout: "none" }}
        className="shrink-0 touch-pan-y select-none"
      >
        <MiniPetAvatar pet={pet} className="size-12" />
      </div>
      <span className="flex-1 truncate text-lg font-medium">{pet.name}</span>
      {/* A dog at the clinic has no meals or potty breaks to count here, so the
          tallies give way to where it actually is. Owner-facing, so English. */}
      {admitted ? (
        <span className="flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-900">
          <Stethoscope className="size-3.5" /> Hospitalized
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Droplets className="size-3.5" />
            {pottyDone}/{potty.length}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Utensils className="size-3.5" />
            <MiniStatusIcon status={lunch?.status} />
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Utensils className="size-3.5" />
            <MiniStatusIcon status={dinner?.status} />
          </span>
        </>
      )}
        <ChevronRight className="ml-auto size-5 shrink-0 text-gray-400" />
      </button>
    </>
  );
}
