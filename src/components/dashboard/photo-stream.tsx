"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatTime12h } from "@/lib/time";
import type { TaskLog, TaskEntity } from "@/types/database";

interface PhotoStreamProps {
  logs: TaskLog[];
  entities: TaskEntity[];
}

export function PhotoStream({ logs, entities }: PhotoStreamProps) {
  const [preview, setPreview] = useState<TaskLog | null>(null);
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const photoLogs = [...logs]
    .filter((l): l is TaskLog & { photo_url: string } => !!l.photo_url)
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at));

  if (photoLogs.length === 0) {
    return <p className="text-sm text-muted-foreground">No photos logged yet today.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photoLogs.map((log) => {
          const entity = entityById.get(log.entity_id);
          return (
            <button
              key={log.id}
              type="button"
              onClick={() => setPreview(log)}
              className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={log.photo_url}
                alt=""
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              <span className="absolute bottom-1 left-1">
                <Badge variant="secondary" className="text-[10px]">
                  {entity?.name ?? "?"}
                </Badge>
              </span>
            </button>
          );
        })}
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>
            {preview
              ? `${entityById.get(preview.entity_id)?.name ?? "Log"} · ${formatTime12h(
                  new Date(preview.completed_at)
                )}`
              : ""}
          </DialogTitle>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.photo_url ?? undefined} alt="" className="w-full rounded-lg" />
          )}
          {preview?.notes && <p className="text-sm text-muted-foreground">{preview.notes}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
