"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
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
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useTapGuard } from "@/hooks/use-tap-guard";
import { compressPhoto } from "@/lib/image";
import { categoryIcon } from "@/lib/schedule-categories";
import { formatTime12h } from "@/lib/time";
import type { AgendaGroup, AgendaItem } from "@/lib/scheduleEngine";
import type { TaskLog } from "@/types/database";
import { cn } from "@/lib/utils";

interface PendingCapture {
  photoUrl: string;
  items: AgendaItem[];
  selected: Set<string>; // entityId
}

// How long after logging a photo staff can still remove it themselves.
const DELETE_WINDOW_MS = 15 * 60 * 1000;

// NOTE: the window is measured from completed_at, not created_at — task_logs
// has no created_at column (see supabase/schema.sql), so reading one would
// yield NaN and quietly disable deletion everywhere. For a photo taken in the
// app the two are the same moment anyway; for a log replayed from the Phase 29
// offline queue, completed_at is when the task actually happened, which is the
// timestamp staff would expect this window to run from.
function deletableUntil(completedAt: string): number {
  return new Date(completedAt).getTime() + DELETE_WINDOW_MS;
}

export function AgendaGroupCard({ group }: { group: AgendaGroup }) {
  const { logTasksBatch, uploadPhoto, pets, deleteLogWithPhoto } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [capture, setCapture] = useState<PendingCapture | null>(null);
  // Only the URL is held, not the tile itself — the tile is re-derived from
  // photoGroups below, so a delete (or any refresh) flows straight through and
  // closes the lightbox instead of leaving a stale copy on screen.
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // One guard per card is enough — only one finger is ever mid-gesture, and
  // touchstart re-arms it for whichever tile that gesture began on.
  const tap = useTapGuard();

  // Every overlay in this card claims its own history entry, so Back unwinds
  // one layer at a time instead of collapsing the lot. The lightbox still
  // clears the confirmation as a backstop for the non-Back close paths.
  useBackToClose(!!capture, () => setCapture(null));
  useBackToClose(confirmDelete, () => setConfirmDelete(false));
  useBackToClose(!!lightboxUrl, () => {
    setConfirmDelete(false);
    setLightboxUrl(null);
  });

  const pendingItems = group.items.filter((i) => i.status !== "completed");
  const allDone = pendingItems.length === 0;
  const anyOverdue = pendingItems.some((i) => i.status === "overdue");

  const petById = useMemo(() => new Map(pets.map((p) => [p.id, p])), [pets]);

  // One card can hold several photos: a batch logs every tagged dog against a
  // single upload, but a staff member who photographs the dogs separately
  // produces one log (and one URL) each. Collapsing by photo_url rebuilds
  // "who was in this shot" — the batch's rows merge back into one tile, while
  // separate shots stay separate. Logs with no photo (offline-queued, ad-hoc)
  // are skipped; they have nothing to show.
  const photoGroups = useMemo(() => {
    const byUrl = new Map<
      string,
      { url: string; entityIds: string[]; names: string[]; at: string; logs: TaskLog[] }
    >();
    for (const item of group.items) {
      const url = item.log?.photo_url;
      if (!url || !item.log) continue;
      const existing = byUrl.get(url);
      if (existing) {
        if (!existing.entityIds.includes(item.entityId)) {
          existing.entityIds.push(item.entityId);
          existing.names.push(item.entityName);
          // Every row behind this photo is kept: removing the photo has to
          // remove all of them, or the dogs it doesn't cover stay marked done
          // with nothing to show for it.
          existing.logs.push(item.log);
        }
      } else {
        byUrl.set(url, {
          url,
          entityIds: [item.entityId],
          names: [item.entityName],
          at: item.log.completed_at,
          logs: [item.log],
        });
      }
    }
    return [...byUrl.values()].sort((a, b) => a.at.localeCompare(b.at));
  }, [group.items]);

  const lightbox = photoGroups.find((p) => p.url === lightboxUrl) ?? null;
  const deleteDeadline = lightbox ? deletableUntil(lightbox.at) : 0;
  // NaN-safe: an unparseable timestamp makes this false rather than throwing
  // the window wide open.
  const isDeletable = now < deleteDeadline;
  const minutesLeft = Math.max(0, Math.ceil((deleteDeadline - now) / 60_000));

  // Ticks only while the lightbox is open, so a photo that ages out of its
  // window while staff are looking at it loses the button there and then.
  useEffect(() => {
    if (!lightboxUrl) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [lightboxUrl]);

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
      // Starts empty on purpose: pre-ticking every pending dog meant a
      // distracted tap on Simpan silently marked dogs done that were never in
      // the frame. Staff now have to say who they actually photographed.
      setCapture({
        photoUrl: url,
        items: pendingItems,
        selected: new Set(),
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

  async function handleDeletePhoto() {
    if (!lightbox) return;
    // Re-checked at the moment of the tap, not just at render: a phone left
    // open on this screen must not be able to delete past the window.
    if (Date.now() >= deletableUntil(lightbox.at)) {
      toast.error("Batas waktu 15 menit sudah lewat");
      setConfirmDelete(false);
      setNow(Date.now());
      return;
    }
    setDeleting(true);
    try {
      // deleteLogWithPhoto drops the row and then best-effort removes the
      // storage object. Only the last call carries photo_url so a batch shared
      // by four dogs deletes the file once instead of four times.
      const logs = lightbox.logs;
      for (let i = 0; i < logs.length; i++) {
        const isLast = i === logs.length - 1;
        await deleteLogWithPhoto(isLast ? logs[i] : { ...logs[i], photo_url: null });
      }
      toast.success("Foto berhasil dihapus");
      setConfirmDelete(false);
      setLightboxUrl(null);
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghapus foto");
    } finally {
      setDeleting(false);
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

          {/* Every photo logged against this slot, not just the first — and
              each one carries the dogs it was tagged with, so a card with
              four separate shots reads at a glance. Sits outside the capture
              <label> so scrolling the strip can't trip the file input. */}
          {photoGroups.length > 0 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {photoGroups.map((photo) => (
                <figure key={photo.url} className="flex w-24 shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    {...tap.touchProps}
                    // The strip scrolls horizontally, so a drag across it ends
                    // in a touchend over whichever tile is under the finger.
                    onClick={(e) => {
                      if (tap.cancelled(e)) return;
                      setLightboxUrl(photo.url);
                    }}
                    aria-label={`Lihat foto ${photo.names.join(", ")}`}
                    className="relative block rounded-lg active:scale-[0.98]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.names.join(", ")}
                      title={photo.names.join(", ")}
                      className="size-24 rounded-lg object-cover ring-1 ring-emerald-500/40"
                    />
                    <div className="absolute -bottom-1.5 left-1 flex">
                      {photo.entityIds.map((id, i) => {
                        const pet = petById.get(id);
                        if (!pet) return null;
                        return (
                          <MiniPetAvatar
                            key={id}
                            pet={pet}
                            className={cn("size-7 border-2 border-white", i > 0 && "-ml-2.5")}
                          />
                        );
                      })}
                    </div>
                  </button>
                  <figcaption className="truncate text-[11px] text-muted-foreground">
                    {photo.names.join(", ")}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

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
              // The thumbnail that used to live here is now the full strip
              // above, so this stays a plain confirmation line.
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

      <Dialog open={!!capture} onOpenChange={(open) => !open && setCapture(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pilih anjing yang ada di foto</DialogTitle>
            {/* Reworded, not just translated: with nothing pre-ticked the old
                "untick anyone who isn't here" instruction told staff to do
                the opposite of what the dialog now needs. */}
            <DialogDescription>
              Centang anjing yang benar-benar terlihat di foto ini. Yang tidak dicentang tetap
              belum selesai.
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
                {capture.items.map((item) => {
                  const checked = capture.selected.has(item.entityId);
                  const pet = petById.get(item.entityId);
                  return (
                    <label
                      key={item.entityId}
                      className={cn(
                        // Ticking is now a required step rather than a
                        // correction, so a selected row is made obvious
                        // instead of relying on a small checkbox alone.
                        "flex min-h-[48px] items-center gap-3 rounded-lg border px-3 transition-colors",
                        checked ? "border-emerald-500 bg-emerald-500/5" : "border-border"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDog(item.entityId)}
                        className="size-5 accent-emerald-600"
                      />
                      {pet && <MiniPetAvatar pet={pet} className="size-8" />}
                      <span className="font-medium">{item.entityName}</span>
                    </label>
                  );
                })}
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
              {/* Nothing is pre-ticked, so the count doubles as feedback that
                  a tap registered before Simpan becomes enabled. */}
              {capture && capture.selected.size > 0
                ? `Simpan (${capture.selected.size})`
                : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox. `lightbox` is derived from photoGroups, so deleting the
          photo empties it and closes this on its own. */}
      <Dialog
        open={!!lightbox}
        onOpenChange={(open) => {
          if (!open) {
            setLightboxUrl(null);
            setConfirmDelete(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{group.title}</DialogTitle>
            <DialogDescription>
              {lightbox ? formatTime12h(new Date(lightbox.at)) : ""}
            </DialogDescription>
          </DialogHeader>
          {lightbox && (
            <>
              {/* object-contain, not cover: a portrait photo shot on a phone
                  has to be readable in full here, not cropped to a square. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.url}
                alt={lightbox.names.join(", ")}
                className="max-h-[55vh] w-full rounded-lg bg-black/5 object-contain"
              />

              <div className="flex flex-wrap gap-1.5">
                {lightbox.entityIds.map((id, i) => {
                  const pet = petById.get(id);
                  return (
                    <Badge
                      key={id}
                      className="h-8 gap-1.5 bg-emerald-600 py-0 pr-3 pl-1 text-sm text-white"
                    >
                      {pet ? (
                        <MiniPetAvatar pet={pet} className="size-6 border-0" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      {lightbox.names[i]}
                    </Badge>
                  );
                })}
              </div>

              {isDeletable ? (
                <Button
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[48px] w-full"
                >
                  <Trash2 /> Hapus Foto ({minutesLeft} menit lagi)
                </Button>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  Foto hanya bisa dihapus dalam 15 menit setelah dicatat. Hubungi pemilik untuk
                  menghapus foto lama.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(false)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Hapus foto ini?</DialogTitle>
            <DialogDescription>
              Tindakan ini tidak dapat dibatalkan.
              {lightbox && lightbox.logs.length > 1
                ? ` ${lightbox.names.join(", ")} akan kembali menjadi belum selesai.`
                : " Tugas ini akan kembali menjadi belum selesai."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="min-h-[48px] flex-1"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              className="min-h-[48px] flex-1"
              onClick={handleDeletePhoto}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
