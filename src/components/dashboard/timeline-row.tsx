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
  categoryIconColor,
  routineIcon,
  type ScheduleCategory,
} from "@/lib/schedule-categories";
import { stepTime, threePhotoState, walkMinutes } from "@/lib/staff-agenda";
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
  const { schedules, selectedDate, logs } = useHousehold();
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
  const Icon = routineIcon(group.category, group.kind);
  // A three-photo routine (Phase 173, D14): the owner sees all three photos
  // with their server times, and the minutes, on the row. No map, no location.
  const dateKey = formatDateLocal(selectedDate);
  const walk = useMemo(
    () => (group.proof === "three" ? threePhotoState(group.items, logs, dateKey) : null),
    [group.proof, group.items, logs, dateKey]
  );
  const walkLine = useMemo(() => {
    if (!walk?.start) return null;
    const time = (log: NonNullable<typeof walk.start>) => {
      const at = stepTime(log);
      return at.sentAt
        ? `${formatTime(new Date(at.at))} (${t("sent", "terkirim")} ${formatTime(new Date(at.sentAt))})`
        : formatTime(new Date(at.at));
    };
    const steps = [walk.start, walk.arrived, walk.end].filter(Boolean).map((l) => time(l!));
    if (walk.end) {
      const { minutes, phoneTime } = walkMinutes(walk.start, walk.end);
      return `${steps.join(" · ")} · ${t(`${minutes} min`, `${minutes} menit`)}${phoneTime ? ` ${t("(phone time)", "(jam HP)")}` : ""}`;
    }
    // Not finished by the end of its day: started, with no end photo.
    if (dateKey < formatDateLocal(new Date())) {
      return t(
        `Started ${formatTime(new Date(stepTime(walk.start).at))}, no end photo`,
        `Mulai ${formatTime(new Date(stepTime(walk.start).at))}, tanpa foto akhir`
      );
    }
    return steps.join(" · ");
  }, [walk, formatTime, t, dateKey]);
  // The start and arrived photos, ahead of the end photo the row already shows.
  const walkPhotos = (walk ? [walk.start, walk.arrived] : []).filter((l) => l?.photo_url) as NonNullable<
    NonNullable<typeof walk>["start"]
  >[];

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
  // Which pet(s) the row is for, in words (demo check F-2): two dogs with the
  // same starter walk drew two identical "06.30 Jalan pagi" rows, told apart
  // only by an avatar that is the same grey placeholder for a pet with no photo.
  const petNames = distinct(
    group.items.map((item) => item.entityName || pets.find((p) => p.id === item.entityId)?.name).filter(Boolean)
  ).join(", ");
  const withPets = (text: string) => (petNames ? `${text} · ${petNames}` : text);
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
            {withPets(`${t("Medicines", "Obat")} (${group.titles.length})`)}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {group.titles.join(" · ")}
          </span>
        </span>
      ) : walkLine || group.note ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{withPets(group.title)}</span>
          {walkLine && (
            <span className="truncate text-xs text-muted-foreground tabular-nums" data-testid="owner-walk-line">
              {walkLine}
            </span>
          )}
          {!walkLine && group.note && <span className="truncate text-xs text-muted-foreground">{group.note}</span>}
        </span>
      ) : (
        <span className="flex-1 truncate font-medium">{withPets(group.title)}</span>
      )}
      <div className="flex shrink-0 -space-x-4">
        {walkPhotos.map((log) => (
          <LogPhotoThumbnail
            key={log.id}
            log={log}
            // Every pet's log behind this photo; the later steps go with them
            // (withLaterSteps, in the thumbnail's delete; Codex, PR #85).
            logs={walk!.logs.filter((l) => l.photo_url === log.photo_url)}
            title={group.title}
            className="size-12 rounded-xl ring-2 ring-background"
          />
        ))}
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
          {/* Always the pet, even on a one-pet row (F-2): "which one didn't
              get walked?" is the first question. */}
          {explained.length > 0
            ? ` · ${distinct(explained.map((e) => e.item.entityName).filter(Boolean)).join(", ")}`
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
