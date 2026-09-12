"use client";

import { Badge } from "@/components/ui/badge";
import { LogPhotoThumbnail } from "@/components/dashboard/log-photo-thumbnail";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import type { TaskLog, TaskEntity } from "@/types/database";

interface PhotoStreamProps {
  logs: TaskLog[];
  entities: TaskEntity[];
  // Unified/all-pets mode: swap the name badge for a small avatar so photos
  // from different dogs are tellable apart at a glance in one shared feed.
  showAvatar?: boolean;
}

export function PhotoStream({ logs, entities, showAvatar }: PhotoStreamProps) {
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
        return (
          <LogPhotoThumbnail
            key={log.id}
            log={log}
            title="Photo"
            entityName={entity?.name}
            className="aspect-square w-full rounded-lg ring-1 ring-border"
            badge={
              <span className="pointer-events-none absolute bottom-1 left-1">
                {showAvatar && entity ? (
                  <MiniPetAvatar pet={entity} className="size-6 ring-2 ring-background" />
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    {entity?.name ?? "?"}
                  </Badge>
                )}
              </span>
            }
          />
        );
      })}
    </div>
  );
}
