"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useHousehold } from "@/context/household-context";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import type { TaskLog, TaskEntity } from "@/types/database";

interface PhotoStreamProps {
  logs: TaskLog[];
  entities: TaskEntity[];
}

export function PhotoStream({ logs, entities }: PhotoStreamProps) {
  const { userRole, deleteLogWithPhoto } = useHousehold();
  const [preview, setPreview] = useState<TaskLog | null>(null);
  const today = formatDateLocal(new Date());
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const photoLogs = [...logs]
    .filter((l): l is TaskLog & { photo_url: string } => !!l.photo_url)
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at));

  function canDelete(log: TaskLog) {
    if (userRole === "owner") return true;
    return formatDateLocal(new Date(log.completed_at)) === today;
  }

  async function handleDelete(log: TaskLog) {
    try {
      await deleteLogWithPhoto(log);
      toast.success("Task undone");
      if (preview?.id === log.id) setPreview(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to undo task");
    }
  }

  if (photoLogs.length === 0) {
    return <p className="text-sm text-muted-foreground">No photos logged yet today.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photoLogs.map((log) => {
          const entity = entityById.get(log.entity_id);
          return (
            <div
              key={log.id}
              className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-border"
            >
              <button
                type="button"
                onClick={() => setPreview(log)}
                className="absolute inset-0"
                aria-label={`View photo of ${entity?.name ?? "pet"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={log.photo_url}
                  alt=""
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
              <span className="pointer-events-none absolute bottom-1 left-1">
                <Badge variant="secondary" className="text-[10px]">
                  {entity?.name ?? "?"}
                </Badge>
              </span>
              {canDelete(log) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(log);
                  }}
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                  aria-label="Delete photo and undo task"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
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
          {preview && canDelete(preview) && (
            <button
              type="button"
              onClick={() => handleDelete(preview)}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-destructive/40 text-sm font-medium text-destructive hover:bg-destructive/5"
            >
              <Trash2 className="size-4" /> Delete photo & undo task
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
