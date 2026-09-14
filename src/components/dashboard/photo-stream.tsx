"use client";

import { Badge } from "@/components/ui/badge";
import { LogPhotoThumbnail } from "@/components/dashboard/log-photo-thumbnail";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { useHousehold } from "@/context/household-context";
import { categoryIcon, describeLog } from "@/lib/schedule-categories";
import { formatTime12h } from "@/lib/time";
import type { TaskLog, TaskEntity } from "@/types/database";

interface PhotoStreamProps {
  logs: TaskLog[];
  entities: TaskEntity[];
  // Unified/all-pets mode: swap the name badge for a small avatar so photos
  // from different dogs are tellable apart at a glance in one shared feed.
  showAvatar?: boolean;
}

export function PhotoStream({ logs, entities, showAvatar }: PhotoStreamProps) {
  const { schedules } = useHousehold();
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const photoLogs = [...logs]
    .filter((l): l is TaskLog & { photo_url: string } => !!l.photo_url)
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at));

  if (photoLogs.length === 0) {
    return <p className="text-sm text-muted-foreground">No photos logged yet today.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photoLogs.map((log) => {
        const entity = entityById.get(log.entity_id);
        const EventIcon = categoryIcon(describeLog(log, schedules).category);
        return (
          <LogPhotoThumbnail
            key={log.id}
            log={log}
            entityName={entity?.name}
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
  );
}
