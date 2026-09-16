"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LogPhotoThumbnail, logLightboxItem } from "@/components/dashboard/log-photo-thumbnail";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { useHousehold } from "@/context/household-context";
import type { LucideIcon } from "lucide-react";
import { categoryIcon, describeLog, type ScheduleCategory } from "@/lib/schedule-categories";
import { formatTime12h } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TaskLog, TaskEntity } from "@/types/database";

// Owner-facing, so English. Pills follow this order — the same order as the
// routine editor's cards — rather than whichever category logged first today,
// so the row doesn't reshuffle as the day fills in.
const FILTER_ORDER: ScheduleCategory[] = ["meal", "potty", "vet", "medication", "grooming", "temporary"];
const FILTER_LABELS: Record<ScheduleCategory, string> = {
  meal: "Meals",
  potty: "Potty",
  vet: "Vet",
  medication: "Medicine",
  grooming: "Grooming",
  temporary: "Others",
};

/**
 * The pill's wording. ScheduleCategory is a closed union, so the fallback only
 * fires if a category reaches the UI that this map has not been taught yet —
 * a stored row from a newer build, say. Showing the raw name capitalised is a
 * readable "Physio" rather than an empty pill.
 */
function filterLabel(category: ScheduleCategory): string {
  return FILTER_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

type PhotoFilter = ScheduleCategory | "all";

// Three full rows of the three-column grid, applied to whichever pill is
// active: a busy day's Potty tally runs to thirty on its own, so capping only
// the unfiltered view left the longest lists uncapped.
const COLLAPSED_LIMIT = 9;

interface PhotoStreamProps {
  logs: TaskLog[];
  entities: TaskEntity[];
  // Unified/all-pets mode: swap the name badge for a small avatar so photos
  // from different dogs are tellable apart at a glance in one shared feed.
  showAvatar?: boolean;
}

export function PhotoStream({ logs, entities, showAvatar }: PhotoStreamProps) {
  const { schedules } = useHousehold();
  const [filter, setFilter] = useState<PhotoFilter>("all");
  const [isExpanded, setIsExpanded] = useState(false);
  const entityById = new Map(entities.map((e) => [e.id, e]));

  // Category resolved once per photo: it drives the pills, the filtering and
  // each tile's corner icon, and describeLog has to search schedules for it.
  const photos = useMemo(
    () =>
      logs
        .filter((l): l is TaskLog & { photo_url: string } => !!l.photo_url)
        .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
        .map((log) => ({ log, category: describeLog(log, schedules).category })),
    [logs, schedules]
  );

  const counts = useMemo(() => {
    const byCategory = new Map<ScheduleCategory, number>();
    for (const { category } of photos) byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    return byCategory;
  }, [photos]);
  const categories = FILTER_ORDER.filter((c) => counts.has(c));

  // Derived rather than reset in an effect: browsing to a day with no photos in
  // the chosen category falls back to All instead of showing an empty grid
  // whose only way out is a pill that is no longer there.
  const activeFilter: PhotoFilter = filter !== "all" && counts.has(filter) ? filter : "all";
  const matching = activeFilter === "all" ? photos : photos.filter((p) => p.category === activeFilter);
  const capped = matching.length > COLLAPSED_LIMIT;
  const visible = capped && !isExpanded ? matching.slice(0, COLLAPSED_LIMIT) : matching;

  // Every pill now has its own cap, so an expanded view belongs to the pill it
  // was opened on — switching pills starts the new list collapsed.
  function selectFilter(next: PhotoFilter) {
    setFilter(next);
    setIsExpanded(false);
  }

  // Built from the whole filtered list, not the nine on screen: opening the
  // last visible tile and swiping on keeps going through the rest of the
  // category rather than stopping at the cap.
  const galleryItems = useMemo(
    () =>
      matching.map(({ log }) =>
        logLightboxItem({
          log,
          entityName: entityById.get(log.entity_id)?.name,
          schedules,
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entityById is rebuilt every render from `entities`, which is the real input
    [matching, entities, schedules]
  );

  if (photos.length === 0) {
    return <p className="text-sm text-muted-foreground">No photos logged yet today.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* A single category has nothing to filter between, so no row at all. */}
      {categories.length > 1 && (
        <div
          role="group"
          aria-label="Filter photos by category"
          // Same guard as DateRibbon: the owner feed sits in a swipeable
          // carousel, and without this a sideways scroll of the pills would
          // drag the whole tab instead.
          onPointerDownCapture={(e) => e.stopPropagation()}
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <FilterPill
            label="All"
            count={photos.length}
            active={activeFilter === "all"}
            onClick={() => selectFilter("all")}
          />
          {categories.map((category) => (
            <FilterPill
              key={category}
              label={filterLabel(category)}
              // The same icon the photo's own corner badge carries, so the
              // pill and the tiles it filters to are recognisably one thing.
              icon={categoryIcon(category)}
              count={counts.get(category) ?? 0}
              active={activeFilter === category}
              onClick={() => selectFilter(category)}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {visible.map(({ log, category }, index) => {
          const entity = entityById.get(log.entity_id);
          const EventIcon = categoryIcon(category);
          return (
            <LogPhotoThumbnail
              key={log.id}
              log={log}
              entityName={entity?.name}
              gallery={{ items: galleryItems, index }}
              className="aspect-square w-full rounded-lg ring-1 ring-border"
              badge={
                // Three corners, one job each: which dog (bottom-left, as
                // before), what kind of task (top-right), and when (bottom
                // right). Kept as separate small marks rather than one wide pill
                // so they still fit a ~120px tile in the 3-column grid.
                <span className="pointer-events-none">
                  <span className="absolute top-1 right-1 flex items-center justify-center rounded-full bg-black/55 p-1 text-white backdrop-blur-[2px]">
                    <EventIcon className="size-3" />
                  </span>
                  <span className="absolute right-1 bottom-1 rounded-md bg-black/55 px-1 py-0.5 text-[9px] leading-none font-medium text-white tabular-nums backdrop-blur-[2px]">
                    {formatTime12h(new Date(log.completed_at))}
                  </span>
                  <span className="absolute bottom-1 left-1">
                    {showAvatar && entity ? (
                      <MiniPetAvatar pet={entity} className="size-6 ring-2 ring-background" />
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        {entity?.name ?? "?"}
                      </Badge>
                    )}
                  </span>
                </span>
              }
            />
          );
        })}
      </div>

      {capped && (
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
          className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg text-sm font-medium text-zinc-600 transition-colors active:bg-zinc-100"
        >
          {isExpanded ? "Show Fewer" : `View All Photos (${matching.length})`}
          <ChevronDown className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

function FilterPill({
  label,
  icon: Icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-zinc-100 text-zinc-600 active:bg-zinc-200"
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0" />}
      {label}
      <span className={cn("text-xs tabular-nums", active ? "text-white/70" : "text-zinc-400")}>
        {count}
      </span>
    </button>
  );
}
