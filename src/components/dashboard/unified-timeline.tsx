"use client";

import { useMemo } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { LogPhotoThumbnail } from "@/components/dashboard/log-photo-thumbnail";
import { useHousehold } from "@/context/household-context";
import { categoryIcon } from "@/lib/schedule-categories";
import { type AgendaGroup, type AgendaItem } from "@/lib/scheduleEngine";
import { buildRollingAgenda, formatDayHeader, type ViewMode } from "@/lib/week-agenda";
import { formatTime12h } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TaskEntity } from "@/types/database";

// buildAgenda already groups AgendaItems by `${time}|${title}` regardless of
// which entity they belong to (that's how the Staff View's multi-dog
// AgendaGroupCard works) — passing every pet as `entities` here gets the
// cross-pet merge for free, no separate grouping logic needed.
export function UnifiedTimeline({ viewMode = "day" }: { viewMode?: ViewMode }) {
  const { pets, schedules, logs, selectedDate } = useHousehold();

  const days = useMemo(
    () =>
      buildRollingAgenda({ start: selectedDate, mode: viewMode, entities: pets, schedules, logs }),
    [selectedDate, viewMode, pets, schedules, logs]
  );

  const isEmpty = days.every((d) => d.groups.length === 0);

  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        {isEmpty ? (
          <p className="text-sm text-muted-foreground">
            {viewMode === "week" ? "Nothing scheduled this week." : "No tasks scheduled."}
          </p>
        ) : viewMode === "day" ? (
          days[0].groups.map((g) => <TimelineRow key={`${g.time}|${g.title}`} group={g} pets={pets} />)
        ) : (
          days.map((day, index) => (
            <div key={day.date} className="flex flex-col gap-3">
              {/* top-0, not an offset that clears the TopNav: the carousel
                  wrapper is overflow-hidden (Phase 43's dead-space fix), which
                  makes it this element's nearest scrolling ancestor, so the
                  offset resolves against that box rather than the viewport and
                  shoves the header 120px down into its own list — measured at
                  443px when the first row sits at 363px. Anchored at 0 it
                  renders where it belongs. It won't actually pin while the page
                  scrolls for the same reason (that ancestor never scrolls), so
                  it reads as a plain day divider here; the staff view, which
                  has no such clipping ancestor, does pin. */}
              <h4
                className={cn(
                  "sticky top-0 z-10 -mx-4 bg-card/95 px-4 py-1.5 text-xs font-semibold text-gray-900 backdrop-blur",
                  index > 0 && "border-t pt-3"
                )}
              >
                {formatDayHeader(day.dateObj, "en")}
              </h4>
              {day.groups.map((g) => (
                <TimelineRow key={`${day.date}|${g.time}|${g.title}`} group={g} pets={pets} />
              ))}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TimelineRow({ group, pets }: { group: AgendaGroup; pets: TaskEntity[] }) {
  const Icon = categoryIcon(group.category);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
        {formatTime12h(group.time)}
      </span>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate font-medium">{group.title}</span>
      <div className="flex shrink-0 -space-x-4">
        {group.items.map((item) => (
          <TimelineAvatarStatus key={item.key} item={item} pets={pets} />
        ))}
      </div>
    </div>
  );
}

function TimelineAvatarStatus({ item, pets }: { item: AgendaItem; pets: TaskEntity[] }) {
  const { setActivePetId } = useHousehold();
  const pet = pets.find((p) => p.id === item.entityId);
  if (!pet) return null;

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
        className="size-12 rounded-full ring-2 ring-background"
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
        className={cn("ring-2 ring-background", item.status === "pending" && "opacity-50 grayscale")}
      />
      {item.status === "completed" && (
        <CheckCircle2 className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-background text-emerald-500" />
      )}
      {item.status === "overdue" && (
        <XCircle className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-background text-red-500" />
      )}
    </button>
  );
}
