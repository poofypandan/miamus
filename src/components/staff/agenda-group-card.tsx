"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHousehold } from "@/context/household-context";
import { compressPhoto } from "@/lib/image";
import { categoryIcon } from "@/lib/schedule-categories";
import { formatTime12h } from "@/lib/time";
import type { AgendaGroup, AgendaItem } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";

interface PendingCapture {
  photoUrl: string;
  items: AgendaItem[];
  selected: Set<string>; // entityId
}

export function AgendaGroupCard({ group }: { group: AgendaGroup }) {
  const { logTasksBatch, uploadPhoto } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [capture, setCapture] = useState<PendingCapture | null>(null);

  const pendingItems = group.items.filter((i) => i.status !== "completed");
  const allDone = pendingItems.length === 0;
  const anyOverdue = pendingItems.some((i) => i.status === "overdue");
  const completedPhotoUrl = group.items.find((i) => i.log?.photo_url)?.log?.photo_url ?? null;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || allDone || busy) return;
    setBusy(true);
    try {
      const compressed = await compressPhoto(file);
      const url = await uploadPhoto(compressed, `pet/batch-${group.time.replace(":", "")}`);
      // Upload first, confirm who's in frame second — the photo is what
      // needs the camera round-trip, tagging is a quick local decision.
      setCapture({
        photoUrl: url,
        items: pendingItems,
        selected: new Set(pendingItems.map((i) => i.entityId)),
      });
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengunggah foto");
    } finally {
      setBusy(false);
    }
  }

  function toggleDog(entityId: string) {
    setCapture((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selected);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return { ...prev, selected: next };
    });
  }

  async function handleConfirm() {
    if (!capture || capture.selected.size === 0) {
      toast.error("Pilih minimal satu anjing");
      return;
    }
    setConfirming(true);
    try {
      const chosen = capture.items.filter((i) => capture.selected.has(i.entityId));
      await logTasksBatch({
        entries: chosen.map((item) => ({
          schedule_id: item.scheduleId,
          entity_id: item.entityId,
        })),
        module: group.module,
        photo_url: capture.photoUrl,
      });
      const names = chosen.map((i) => i.entityName).join(", ");
      toast.success(`${names} · ${group.title} selesai ✅`);
      setCapture(null);
    } catch (err) {
      console.error(err);
      toast.error("Gagal menyimpan catatan");
    } finally {
      setConfirming(false);
    }
  }

  const CategoryIcon = categoryIcon(group.category);

  return (
    <>
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CategoryIcon className="size-4" />
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
              <span className="flex items-center gap-2">
                {completedPhotoUrl && (
                  <span className="size-8 shrink-0 overflow-hidden rounded-md ring-1 ring-emerald-500/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={completedPhotoUrl} alt="" className="h-full w-full object-cover" />
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-5" /> Semua Selesai
                </span>
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

      <Dialog open={!!capture} onOpenChange={(open) => !open && setCapture(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Who is in this photo?</DialogTitle>
            <DialogDescription>
              Uncheck any dog that isn&apos;t actually in the frame — they&apos;ll stay pending.
            </DialogDescription>
          </DialogHeader>
          {capture && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capture.photoUrl}
                alt=""
                className="max-h-56 w-full rounded-lg object-cover"
              />
              <div className="flex flex-col gap-2">
                {capture.items.map((item) => (
                  <label
                    key={item.entityId}
                    className="flex min-h-[48px] items-center gap-3 rounded-lg border px-3"
                  >
                    <input
                      type="checkbox"
                      checked={capture.selected.has(item.entityId)}
                      onChange={() => toggleDog(item.entityId)}
                      className="size-4"
                    />
                    <span className="font-medium">{item.entityName}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          <DialogFooter>
            <Button
              onClick={handleConfirm}
              disabled={confirming || !capture || capture.selected.size === 0}
              className="min-h-[48px] w-full"
            >
              {confirming ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
