"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Droplets,
  Loader2,
  Utensils,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHousehold } from "@/context/household-context";
import { compressPhoto } from "@/lib/image";
import { POTTY_TITLE } from "@/lib/schedule-categories";
import type { AgendaItem } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";

function StatusIcon({ status }: { status: AgendaItem["status"] }) {
  if (status === "completed") return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === "overdue") return <XCircle className="size-4 text-red-500" />;
  return <Clock className="size-4 text-amber-500" />;
}

export function SummaryCard({ dogName, items }: { dogName: string; items: AgendaItem[] }) {
  const potty = items.filter((i) => i.title === POTTY_TITLE);
  const pottyDone = potty.filter((i) => i.status === "completed").length;
  const nextPotty = potty.find((i) => i.status !== "completed");
  const lunch = items.find((i) => i.title === "Makan Siang");
  const dinner = items.find((i) => i.title === "Makan Malam");

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{dogName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 px-4 text-sm">
        <TaskRow
          icon={Droplets}
          label="Potty"
          item={nextPotty}
          statusText={`${pottyDone}/${potty.length}`}
        />
        <TaskRow icon={Utensils} label="Lunch" item={lunch} />
        <TaskRow icon={Utensils} label="Dinner" item={dinner} />
      </CardContent>
    </Card>
  );
}

// Tapping a pending task opens the camera and logs it complete on capture —
// mirrors the Staff View's AgendaGroupCard pattern (hidden capture input +
// compress + upload + log), just scoped to one item instead of a whole group.
function TaskRow({
  icon: Icon,
  label,
  item,
  statusText,
}: {
  icon: LucideIcon;
  label: string;
  item: AgendaItem | undefined;
  statusText?: string;
}) {
  const { logTask, uploadPhoto } = useHousehold();
  const [busy, setBusy] = useState(false);
  const loggable = !!item && item.status !== "completed";

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !item) return;
    setBusy(true);
    try {
      const compressed = await compressPhoto(file);
      const url = await uploadPhoto(compressed, `logs/${item.entityId}`);
      await logTask({
        schedule_id: item.scheduleId,
        entity_id: item.entityId,
        module: item.module,
        photo_url: url,
      });
      toast.success(`${label} logged`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to log ${label.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <label
      className={cn(
        "-mx-1 flex items-center justify-between rounded-lg px-1 py-1 transition-colors",
        loggable && !busy && "cursor-pointer hover:bg-muted active:bg-muted"
      )}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </span>
      <span className="flex items-center gap-1.5 font-medium">
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        {statusText ?? (item ? <StatusIcon status={item.status} /> : "—")}
      </span>
      {loggable && (
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={busy}
          onChange={handleFile}
        />
      )}
    </label>
  );
}
