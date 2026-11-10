"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleSlash, Stethoscope, XCircle } from "lucide-react";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { LogPhotoThumbnail, logLightboxItem } from "@/components/dashboard/log-photo-thumbnail";
import { useHousehold } from "@/context/household-context";
import { AGENDA_TONES, DONE_TONE, routineTone } from "@/lib/agenda-tones";
import { isAdmitted } from "@/lib/pets";
import {
  categoryCardTint,
  categoryIcon,
  categoryIconColor,
  type ScheduleCategory,
} from "@/lib/schedule-categories";
import type { AgendaGroup, AgendaItem } from "@/lib/scheduleEngine";
import { useFormatTime, useScreenLang } from "@/components/ui/ui-labels";
import { cn } from "@/lib/utils";
import { useT } from "@/context/owner-locale-context";
import { distinct, groupByPhoto } from "@/lib/photos";
import type { TaskEntity } from "@/types/database";
import { OwnerCouldntSheet } from "@/components/agenda/owner-couldnt-sheet";
import { useTaskExceptions } from "@/hooks/use-task-exceptions";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { groupExceptions, ownerCouldntRowLine } from "@/lib/couldnt-do";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { useOwnerLocale } from "@/context/owner-locale-context";

/**
 * One minute of the day's pet routines, across every dog.
 *
 * Exported since Phase 100: the unified Agenda interleaves these with chore
 * rows in one chronological list, and a second implementation of the same row
 * would be the obvious place for the two to start looking different.
 */
export function TimelineRow({ group, pets }: { group: AgendaGroup; pets: TaskEntity[] }) {
  const formatTime = useFormatTime();
  const lang = useScreenLang();
  const { schedules, selectedDate } = useHousehold();
  const t = useT();
  const locale = useOwnerLocale();
  // Couldn't-do records on this block's open pets (Phase 165).
  const { exceptions } = useTaskExceptions();
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));
  const explained = useMemo(
    () => groupExceptions(exceptions, formatDateLocal(selectedDate), group),
    [exceptions, selectedDate, group]
  );
  const [couldntOpen, setCouldntOpen] = useState(false);
  const medicine = group.category === "medication";
  const Icon = categoryIcon(group.category);

  // One row is one task at one time across every dog, so its photos are the
  // proof shots for that task — swiping moves between them. Merged by URL
  // (Phase 118): a dog's three noon medicines, or four dogs on one potty
  // round, are one upload, and drew as three or four identical thumbnails
  // with as many identical slides. Each photo is now one of each, named for
  // everything it covers.
  const photos = useMemo(
    () =>
      groupByPhoto(group.items, (item) => item.log?.photo_url).map(({ url, rows }) => ({
        url,
        logs: rows.map((item) => item.log!),
        title: distinct(rows.map((item) => item.title)).join(" · "),
        names:
          distinct(
            rows.map((item) => pets.find((p) => p.id === item.entityId)?.name).filter(Boolean)
          ).join(", ") || undefined,
        entityIds: new Set(rows.map((item) => item.entityId)),
      })),
    [group.items, pets]
  );
  const gallery = useMemo(
    () =>
      photos.map((photo) =>
        logLightboxItem({ log: photo.logs[0], title: photo.title, entityName: photo.names, schedules, lang })
      ),
    [photos, schedules, lang]
  );
  // The avatar cluster: each photo once, then each dog nothing photographed
  // covers, once — a medicine group is one dog's three items, and three
  // copies of the same pending avatar said nothing the first did not.
  const marks = useMemo(() => {
    const photoByUrl = new Map(photos.map((photo, index) => [photo.url, { photo, index }]));
    const photographed = new Set(photos.flatMap((photo) => [...photo.entityIds]));
    const seenUrls = new Set<string>();
    const seenDogs = new Set<string>();
    const out: (
      | { kind: "photo"; key: string; photo: (typeof photos)[number]; index: number }
      | { kind: "dog"; key: string; item: AgendaItem }
    )[] = [];
    for (const item of group.items) {
      const url = item.log?.photo_url;
      if (url) {
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        const { photo, index } = photoByUrl.get(url)!;
        out.push({ kind: "photo", key: url, photo, index });
      } else if (!photographed.has(item.entityId) && !seenDogs.has(item.entityId)) {
        seenDogs.add(item.entityId);
        // Worst status wins, as in the routine editor's medicine row: a
        // half-finished round never reads as done.
        const mine = group.items.filter((i) => i.entityId === item.entityId);
        const status = mine.every((i) => i.status === "completed")
          ? "completed"
          : mine.some((i) => i.status === "overdue")
            ? "overdue"
            : "pending";
        out.push({ kind: "dog", key: item.key, item: { ...item, status } });
      }
    }
    return out;
  }, [group.items, photos]);
  // Every dog done: the staff view's green (Phase 114), in place of the
  // category tint.
  const done = group.items.length > 0 && group.items.every((i) => i.status === "completed");
  // Done keeps its kind (Phase 132): the green face, but the category's own
  // icon colour and a thin edge in it, so a finished dose of medicine still
  // reads as the dogs' health rather than as one more green row.
  const tint = done
    ? // pl-1.5: the 3px edge less the usual 1px, so text stays in line.
      cn(DONE_TONE.tint, AGENDA_TONES[routineTone(group.category)].doneEdge, "pl-1.5")
    : explained.length > 0
      ? "border-l-[3px] border-l-amber-500 bg-amber-50 pl-1.5"
      : categoryCardTint(group.category);
  const consolidated = group.category === "medication" && group.titles.length > 1;
  const couldntLine =
    explained.length > 0
      ? ownerCouldntRowLine(
          explained[0].exception,
          locale,
          explained[0].exception.staff_id ? staffName(explained[0].exception.staff_id) : null,
          medicine
        )
      : null;
  const explainedPets = new Set(explained.map((e) => e.item.entityId));

  // Padding and a border on every row, so a tinted row lines up with its
  // neighbours instead of jogging 8px sideways. An untinted routine draws that
  // border (Phase 136): with no card around the list any more, it is what
  // makes the row a row rather than a line of text on the page.
  const row = (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border px-2 py-2 text-sm",
        couldntLine && "rounded-b-none border-b-0",
        tint
      )}
    >
      {/* A shade darker on a tinted row: the ordinary muted grey measured
          4.24:1 against indigo-50, just under the 4.5:1 small text needs. */}
      <span
        className={cn(
          "w-16 shrink-0 text-xs tabular-nums",
          tint ? "text-zinc-600" : "text-muted-foreground"
        )}
      >
        {formatTime(group.time)}
      </span>
      <Icon
        className={cn("size-4 shrink-0", categoryIconColor(group.category))}
      />
      {/* A dog's medicines at one time arrive as a single group (Phase 81), so
          the row names the errand and lists what is in it underneath rather
          than repeating a near-identical row three times. Owner-facing, so
          English. */}
      {consolidated ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">
            {t("Medicines", "Obat")} ({group.titles.length})
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {group.titles.join(" · ")}
          </span>
        </span>
      ) : (
        <span className="flex-1 truncate font-medium">{group.title}</span>
      )}
      <div className="flex shrink-0 -space-x-4">
        {marks.map((mark) =>
          mark.kind === "photo" ? (
            <LogPhotoThumbnail
              key={mark.key}
              log={mark.photo.logs[0]}
              logs={mark.photo.logs}
              title={mark.photo.title}
              entityName={mark.photo.names}
              // Sits shoulder-to-shoulder with MiniPetAvatar in the same
              // cluster, so it has to take the same corner or the row reads as
              // mixed shapes.
              className="size-12 rounded-xl ring-2 ring-background"
              gallery={{ items: gallery, index: mark.index }}
            />
          ) : (
            <TimelineAvatarStatus
              key={mark.key}
              item={mark.item}
              pets={pets}
              category={group.category}
              explained={explainedPets.has(mark.item.entityId)}
            />
          )
        )}
      </div>
    </div>
  );

  if (!couldntLine) return row;
  return (
    <div className="flex flex-col">
      {row}
      {/* What staff said (Phase 165): its own line, tappable, so the pets'
          avatars keep their own taps. */}
      <button
        type="button"
        onClick={() => setCouldntOpen(true)}
        data-testid="couldnt-line"
        className="flex min-h-9 items-center gap-1.5 rounded-b-lg border border-t-0 border-border border-l-[3px] border-l-amber-500 bg-amber-50 px-2 pb-2 pl-[4.75rem] text-left text-xs font-medium text-amber-800 active:bg-amber-100"
      >
        <CircleSlash className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {couldntLine}
          {explained.length > 0 && group.items.length > 1
            ? ` · ${[...new Set(explained.map((e) => e.item.entityName))].join(", ")}`
            : ""}
        </span>
      </button>
      <OwnerCouldntSheet
        open={couldntOpen}
        onOpenChange={setCouldntOpen}
        title={consolidated ? t("Medicines", "Obat") : group.title}
        subtitle={formatTime(group.time)}
        entries={explained.map(({ item, exception }) => ({
          exception,
          petName: item.entityName,
          medicine,
        }))}
      />
    </div>
  );
}

/**
 * A dog with no proof photo in this row: its avatar, dimmed until done, with
 * the status in the corner. Taps through to that dog. Photographed dogs are
 * drawn by their photo instead (see `marks`), whose own tap / long-press
 * gestures would be shadowed — and made invalid HTML — by a button around it.
 */
function TimelineAvatarStatus({
  item,
  pets,
  category,
  explained = false,
}: {
  item: AgendaItem;
  pets: TaskEntity[];
  category: ScheduleCategory;
  /** Someone said it couldn't be done (Phase 165): amber, not the red cross. */
  explained?: boolean;
}) {
  const { setActivePetId } = useHousehold();
  const t = useT();
  const pet = pets.find((p) => p.id === item.entityId);
  if (!pet) return null;

  // Suspended for the stay, so the row reads as "not expected" rather than
  // "not done". Vet rows are left alone — that is where the admission itself
  // is recorded.
  const suspended = isAdmitted(pet) && category !== "vet";

  return (
    <button
      type="button"
      onClick={() => setActivePetId(pet.id)}
      className="relative transition-transform active:scale-90"
    >
      <MiniPetAvatar
        pet={pet}
        className={cn(
          "ring-2 ring-background",
          (item.status === "pending" || suspended) && "opacity-50 grayscale"
        )}
      />
      {suspended ? (
        <Stethoscope
          aria-label={t("At the vet", "Dirawat di klinik")}
          className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-background text-indigo-600"
        />
      ) : (
        <>
          {item.status === "completed" && (
            <CheckCircle2 className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-background text-emerald-500" />
          )}
          {item.status !== "completed" && explained && (
            <CircleSlash className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-background text-amber-600" />
          )}
          {item.status === "overdue" && !explained && (
            <XCircle className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-background text-red-500" />
          )}
        </>
      )}
    </button>
  );
}
