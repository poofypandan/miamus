"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHousehold } from "@/context/household-context";
import { compressPhoto } from "@/lib/image";
import { getTaskIcon } from "@/lib/task-icons";
import { formatTime12h } from "@/lib/time";
import type { AgendaGroup } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";

export function AgendaGroupCard({ group }: { group: AgendaGroup }) {
  const { logTasksBatch, uploadPhoto } = useHousehold();
  const [busy, setBusy] = useState(false);

  const pendingItems = group.items.filter((i) => i.status !== "completed");
  const allDone = pendingItems.length === 0;
  const anyOverdue = pendingItems.some((i) => i.status === "overdue");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || allDone || busy) return;
    setBusy(true);
    try {
      const compressed = await compressPhoto(file);
      const url = await uploadPhoto(compressed, `pet/batch-${group.time.replace(":", "")}`);
      await logTasksBatch({
        entries: pendingItems.map((item) => ({
          schedule_id: item.scheduleId,
          entity_id: item.entityId,
        })),
        module: group.module,
        photo_url: url,
      });
      const names = pendingItems.map((i) => i.entityName).join(", ");
      toast.success(`${names} · ${group.title} selesai ✅`);
    } catch (err) {
      console.error(err);
      toast.error("Gagal menyimpan catatan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-lg">{getTaskIcon(group.title)}</span>
          <span>{formatTime12h(group.time)}</span>
          <span className="font-normal text-muted-foreground">· {group.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-1.5">
          {group.items.map((item) => (
            <Badge
              key={item.entityId}
              variant={item.status === "completed" ? "default" : "secondary"}
              className={cn(
                "h-7 gap-1 px-2.5 text-sm",
                item.status === "completed" && "bg-emerald-600 text-white"
              )}
            >
              {item.status === "completed" && <CheckCircle2 className="size-3.5" />}
              {item.entityName}
            </Badge>
          ))}
        </div>

        <label
          className={cn(
            "flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors active:scale-[0.99]",
            allDone
              ? "cursor-default border-emerald-500/40 bg-emerald-500/5 text-emerald-600"
              : anyOverdue
                ? "cursor-pointer border-destructive/40 bg-destructive/5"
                : "cursor-pointer border-border bg-card"
          )}
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={allDone || busy}
            onChange={handleFile}
          />
          {busy ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : allDone ? (
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-5" /> Semua Selesai
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Camera className="size-5" />
              {pendingItems.length > 1
                ? `Ambil Foto untuk ${pendingItems.length} Anjing`
                : "Ambil Foto untuk Selesai"}
            </span>
          )}
        </label>
      </CardContent>
    </Card>
  );
}
