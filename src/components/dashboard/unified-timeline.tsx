"use client";

import { useMemo } from "react";
import { CheckCircle2, Stethoscope, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { LogPhotoThumbnail, logLightboxItem } from "@/components/dashboard/log-photo-thumbnail";
import { useHousehold } from "@/context/household-context";
import { isAdmitted } from "@/lib/pets";
import {
  categoryCardTint,
  categoryIcon,
  categoryIconColor,
  type ScheduleCategory,
} from "@/lib/schedule-categories";
import { buildAgenda, formatDateLocal, type AgendaGroup, type AgendaItem } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { LightboxItem } from "@/components/dashboard/photo-lightbox";
import type { TaskEntity } from "@/types/database";

// buildAgenda already groups AgendaItems by `${time}|${title}` regardless of
// which entity they belong to (that's how the Staff View's multi-dog
// AgendaGroupCard works) — passing every pet as `entities` here gets the
// cross-pet merge for free, no separate grouping logic needed.
export function UnifiedTimeline() {
  const { pets, schedules, logs, selectedDate } = useHousehold();
  const dateStr = formatDateLocal(selectedDate);
  const groups = useMemo(
    () => buildAgenda({ date: dateStr, entities: pets, schedules, logs }),
    [dateStr, pets, schedules, logs]
  );

  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks scheduled.</p>
        ) : (
          groups.map((g) => <TimelineRow key={`${g.time}|${g.title}`} group={g} pets={pets} />)
        )}
      </CardContent>
    </Card>
  );
}

function TimelineRow({ group, pets }: { group: AgendaGroup; pets: TaskEntity[] }) {
  const { schedules } = useHousehold();
  const Icon = categoryIcon(group.category);

  // One row is one task at one time across every dog, so its photos are the
  // proof shots for that task — swiping moves between the dogs that have one.
  const photoItems = group.items.filter((item) => item.log?.photo_url);
  const gallery = useMemo(
    () =>
      photoItems.map((item) =>
        logLightboxItem({
          log: item.log!,
          title: item.title,
          entityName: pets.find((p) => p.id === item.entityId)?.name,
          schedules,
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photoItems is derived from group.items each render
    [group.items, pets, schedules]
  );
  const tint = categoryCardTint(group.category);
  const consolidated = group.category === "medication" && group.titles.length > 1;

  // Padding and a border on every row, transparent where there is no tint, so
  // a tinted row lines up with its neighbours instead of jogging 8px sideways.
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm",
        tint
      )}
    >
      {/* A shade darker on a tinted row: the ordinary muted grey measured
          4.24:1 against indigo-50, just under the 4.5:1 small text needs. */}
      <span
        className={cn(
          "w-16 shrink-0 font-mono text-xs",
          tint ? "text-zinc-600" : "text-muted-foreground"
        )}
      >
        {formatTime12h(group.time)}
      </span>
      <Icon className={cn("size-4 shrink-0", categoryIconColor(group.category))} />
      {/* A dog's medicines at one time arrive as a single group (Phase 81), so
          the row names the errand and lists what is in it underneath rather
          than repeating a near-identical row three times. Owner-facing, so
          English. */}
      {consolidated ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">Medicines ({group.titles.length})</span>
          <span className="truncate text-xs text-muted-foreground">
            {group.titles.join(" · ")}
          </span>
        </span>
      ) : (
        <span className="flex-1 truncate font-medium">{group.title}</span>
      )}
      <div className="flex shrink-0 -space-x-4">
        {group.items.map((item) => (
          <TimelineAvatarStatus
            key={item.key}
            item={item}
            pets={pets}
            gallery={gallery}
            galleryIndex={photoItems.indexOf(item)}
            category={group.category}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineAvatarStatus({
  item,
  pets,
  gallery,
  galleryIndex,
  category,
}: {
  item: AgendaItem;
  pets: TaskEntity[];
  gallery: LightboxItem[];
  galleryIndex: number;
  category: ScheduleCategory;
}) {
  const { setActivePetId } = useHousehold();
  const pet = pets.find((p) => p.id === item.entityId);
  if (!pet) return null;

  // Suspended for the stay, so the row reads as "not expected" rather than
  // "not done". Vet rows are left alone — that is where the admission itself
  // is recorded.
  const suspended = isAdmitted(pet) && category !== "vet";

  // A completed slot's proof photo keeps its own tap-for-lightbox /
  // long-press-to-delete gestures (LogPhotoThumbnail is already a button) —
  // nesting another interactive drill-down trigger around it would both be
  // invalid HTML and shadow those gestures, so only the plain status avatar
  // (nothing else to tap) becomes a drill-down trigger.
  if (item.log?.photo_url) {
    return (
      <LogPhotoThumbnail
        log={item.log}
        title={item.title}
        entityName={pet.name}
        // Sits shoulder-to-shoulder with MiniPetAvatar in the same cluster, so
        // it has to take the same corner or the row reads as mixed shapes.
        className="size-12 rounded-xl ring-2 ring-background"
        gallery={{ items: gallery, index: Math.max(0, galleryIndex) }}
      />
    );
  }

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
          aria-label="Hospitalized"
          className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-background text-indigo-600"
        />
      ) : (
        <>
          {item.status === "completed" && (
            <CheckCircle2 className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-background text-emerald-500" />
          )}
          {item.status === "overdue" && (
            <XCircle className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-background text-red-500" />
          )}
        </>
      )}
    </button>
  );
}
