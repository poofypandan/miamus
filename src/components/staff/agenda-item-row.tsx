"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useHousehold } from "@/context/household-context";
import { compressPhoto } from "@/lib/image";
import type { AgendaItem } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<AgendaItem["status"], string> = {
  pending: "border-border bg-card",
  overdue: "border-destructive/40 bg-destructive/5",
  completed: "border-emerald-500/40 bg-emerald-500/5",
};

export function AgendaItemRow({ item }: { item: AgendaItem }) {
  const { logTask, uploadPhoto } = useHousehold();
  const [busy, setBusy] = useState(false);
  const done = item.status === "completed";

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || done || busy) return;
    setBusy(true);
    try {
      const compressed = await compressPhoto(file);
      const url = await uploadPhoto(compressed, `pet/${item.entityId}`);
      await logTask({
        schedule_id: item.scheduleId,
        entity_id: item.entityId,
        module: item.module,
        photo_url: url,
      });
      toast.success(`${item.entityName} · ${item.title} selesai ✅`);
    } catch (err) {
      console.error(err);
      toast.error("Gagal menyimpan catatan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-colors active:scale-[0.99]",
        STATUS_STYLE[item.status],
        done ? "cursor-default" : "cursor-pointer"
      )}
    >
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={done || busy}
        onChange={handleFile}
      />
      <Badge variant="secondary" className="h-6 shrink-0 px-2.5 text-sm">
        {item.entityName}
      </Badge>
      <span className="flex-1 text-sm font-medium">{item.title}</span>
      {busy ? (
        <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
      ) : done ? (
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-600">
          <CheckCircle2 className="size-5" /> Selesai
        </span>
      ) : (
        <span
          className={cn(
            "shrink-0 text-xs font-medium",
            item.status === "overdue" ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {item.status === "overdue" ? "Terlewat" : "Tap untuk selesai"}
        </span>
      )}
    </label>
  );
}
