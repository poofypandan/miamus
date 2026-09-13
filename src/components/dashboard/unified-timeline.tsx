"use client";

import { useMemo } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { LogPhotoThumbnail } from "@/components/dashboard/log-photo-thumbnail";
import { useHousehold } from "@/context/household-context";
import { dayLabel } from "@/lib/date-label";
import { categoryIcon } from "@/lib/schedule-categories";
import { buildAgenda, formatDateLocal, type AgendaItem } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import { cn } from "@/lib/utils";
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
      <CardHeader className="px-4">
        <CardTitle className="text-base">{dayLabel(selectedDate)}&apos;s Timeline</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks scheduled.</p>
        ) : (
          groups.map((g) => {
            const Icon = categoryIcon(g.category);
            return (
              <div key={`${g.time}|${g.title}`} className="flex items-center gap-2 text-sm">
                <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                  {formatTime12h(g.time)}
                </span>
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-medium">{g.title}</span>
                <div className="flex shrink-0 -space-x-4">
                  {g.items.map((item) => (
                    <TimelineAvatarStatus key={item.key} item={item} pets={pets} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
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
