"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  MessageSquareText,
  PackageX,
  PawPrint,
  Pill,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PhotoPicker } from "@/components/photo-picker";
import { useStaffIdentity } from "@/components/auth/staff-login-gate";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useFormatTime } from "@/components/ui/ui-labels";
import { reasonsFor, staffReasonLabel, type ExceptionKind } from "@/lib/couldnt-do";
import { useRepairs } from "@/hooks/use-repairs";
import { dayKeyOf, supervisionExplains, supervisionStretches } from "@/lib/repair-walkins";
import { fileTaskException, withdrawTaskException } from "@/lib/task-exceptions-store";
import { classifySubmitError } from "@/lib/submit-errors";
import { SaveStillWaitingError } from "@/lib/offline-queue";
import { cn } from "@/lib/utils";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import type { AgendaItem } from "@/lib/scheduleEngine";
import type { TaskExceptionReason } from "@/types/database";

/**
 * "Tidak bisa dikerjakan" (Phase 165): why a task couldn't be done, in two
 * taps. A reason first (big rows), then what the reason needs: what ran out,
 * which pet, or a few words; a note and a photo are optional. Kirim goes
 * through the save queue, so it works on a weak signal, and Batalkan undoes
 * it for 5 minutes (D3).
 *
 * Staff-facing, so entirely Bahasa Indonesia (docs/indonesian-glossary.md).
 */
export type CouldntDoTarget =
  | { kind: "chore"; occurrence: ChoreOccurrence }
  | {
      kind: "routine";
      date: string;
      title: string;
      time: string;
      category: ExceptionKind;
      /** The pets still open on this block. */
      items: AgendaItem[];
    };

const REASON_ICONS: Record<TaskExceptionReason, LucideIcon> = {
  out_of_stock: PackageX,
  pet_refused: PawPrint,
  done_by_other: Users,
  other: MessageSquareText,
  supervising_repair: Wrench,
};

const NOTE_LIMIT = 280;
const OTHER_ITEM = "__other__";

export function CouldntDoSheet({
  target,
  open,
  onOpenChange,
  onFiled,
}: {
  target: CouldntDoTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After Kirim, so the task's own sheet can close too. */
  onFiled?: () => void;
}) {
  useBackToClose(open, () => onOpenChange(false));
  if (!target) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md overflow-y-auto rounded-t-2xl">
        {/* Keyed, so every opening starts at the reasons with nothing filled in. */}
        {open && <CouldntDoBody target={target} onDone={() => onOpenChange(false)} onFiled={onFiled} />}
      </SheetContent>
    </Sheet>
  );
}

function CouldntDoBody({
  target,
  onDone,
  onFiled,
}: {
  target: CouldntDoTarget;
  onDone: () => void;
  onFiled?: () => void;
}) {
  const formatTime = useFormatTime();
  const { inventoryItems, refresh } = useHousehold();
  const { staffId } = useStaffIdentity();

  const kind: ExceptionKind = target.kind === "chore" ? "chore" : target.category;
  const medicine = kind === "medication";
  const title = target.kind === "chore" ? target.occurrence.task.title : target.title;
  const time = target.kind === "chore" ? target.occurrence.task.due_time : target.time;
  const day = target.kind === "chore" ? target.occurrence.date : target.date;

  // "Mengawasi perbaikan" (Phase 174, D10): offered only on a day this person
  // supervised a repair, and chosen already when the task's time falls in
  // their stretch. It links the visit and needs no note.
  const { repairs, walkIns, supervision } = useRepairs();
  const supervisingVisit = useMemo(() => {
    if (!staffId) return null;
    const mine = supervisionStretches(supervision, walkIns, repairs).filter((s) => s.staffId === staffId);
    // The phone's own day for each end (Jakarta), never the UTC date of the timestamp.
    const onDay = mine.filter((s) => dayKeyOf(s.start) <= day && (!s.end || dayKeyOf(s.end) >= day));
    if (onDay.length === 0) return null;
    const inside = supervisionExplains({ staffId, date: day, time: time ? time.slice(0, 5) : null }, onDay, []);
    return { visitId: (inside ?? onDay[onDay.length - 1]).visitId, inside: !!inside };
  }, [staffId, supervision, walkIns, repairs, day, time]);

  const [reason, setReasonState] = useState<TaskExceptionReason | null>(() =>
    supervisingVisit?.inside ? "supervising_repair" : null
  );
  // Chosen by hand: a later load of the stretches never overrides it.
  const [picked, setPicked] = useState(false);
  const setReason = (next: TaskExceptionReason | null) => {
    setPicked(true);
    setReasonState(next);
  };
  // The stretches can land after the sheet opened (a cold start): choose
  // the reason then, unless someone already picked one.
  useEffect(() => {
    if (!picked && supervisingVisit?.inside) setReasonState("supervising_repair");
  }, [picked, supervisingVisit?.inside]);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  const [otherItem, setOtherItem] = useState("");
  const [toList, setToList] = useState(true);

  const subtitle = [title, time ? formatTime(time) : null].filter(Boolean).join(" · ");

  // Which pets (routines): pre-picked when there is only one.
  const pets = useMemo(() => {
    if (target.kind !== "routine") return [];
    const byPet = new Map<string, AgendaItem>();
    for (const item of target.items) if (!byPet.has(item.entityId)) byPet.set(item.entityId, item);
    return [...byPet.values()];
  }, [target]);
  const [petIds, setPetIds] = useState<Set<string>>(() => new Set(pets.length === 1 ? [pets[0].entityId] : []));

  // The shopping list's names, A–Z, for "Apa yang habis?".
  const items = useMemo(
    () => [...inventoryItems].sort((a, b) => a.name.localeCompare(b.name, "id")).slice(0, 12),
    [inventoryItems]
  );

  const trimmed = note.trim();
  const needsNote = reason === "other";
  const needsPets = reason === "pet_refused" && target.kind === "routine";
  const ready =
    !!reason &&
    !uploading &&
    (!needsNote || trimmed.length >= 3) &&
    (!needsPets || petIds.size > 0) &&
    !(reason === "out_of_stock" && itemId === OTHER_ITEM && toList && otherItem.trim().length === 0);

  async function send() {
    if (!reason || !ready) return;
    setBusy(true);
    try {
      const picked = reason === "out_of_stock" && itemId && itemId !== OTHER_ITEM ? itemId : null;
      const extra = reason === "out_of_stock" && itemId === OTHER_ITEM ? otherItem.trim() : "";
      // "Barang lain": its name leads the note, so the owner reads what ran out.
      const fullNote = [extra, trimmed].filter(Boolean).join(" — ").slice(0, NOTE_LIMIT) || null;
      const base = {
        reason,
        note: fullNote,
        photo_url: photo,
        inventory_item_id: picked,
        staff_id: staffId,
        // Only with this reason: a database before migrations/149 has no such column.
        ...(reason === "supervising_repair" && supervisingVisit ? { repair_visit_id: supervisingVisit.visitId } : {}),
      };
      // On the shopping list (on by default): the item marked out, or the
      // other thing as a note. Sent with the first record, through the save
      // queue, so a weak signal doesn't lose it (Codex, PR #71).
      let shopping: { itemId?: string | null; noteId?: string; note?: string } | null =
        reason === "out_of_stock" && toList
          ? picked
            ? { itemId: picked }
            : extra
              ? { noteId: crypto.randomUUID(), note: extra.slice(0, 120) }
              : null
          : null;
      const ids: string[] = [];
      let waiting = false;
      if (target.kind === "chore") {
        const id = crypto.randomUUID();
        ids.push(id);
        const outcome = await fileTaskException(
          {
            ...base,
            id,
            chore_id: target.occurrence.template.id,
            occurs_on: target.occurrence.date,
          },
          shopping
        );
        waiting = outcome.status === "waiting";
      } else {
        // One record per pet: the picked ones for a refusal, every open one otherwise.
        const chosen =
          reason === "pet_refused" ? target.items.filter((i) => petIds.has(i.entityId)) : target.items;
        for (const item of chosen) {
          const id = crypto.randomUUID();
          ids.push(id);
          const outcome = await fileTaskException(
            {
              ...base,
              id,
              schedule_id: item.scheduleId,
              entity_id: item.entityId,
              occurs_on: target.date,
              slot_time: item.time,
            },
            shopping
          );
          shopping = null;
          waiting = waiting || outcome.status === "waiting";
        }
      }


      toast.success(waiting ? "Tersimpan di HP. Terkirim otomatis saat ada sinyal." : "Terkirim. Admin bisa melihatnya.", {
        duration: 8000,
        action: {
          label: "Batalkan",
          onClick: () => {
            void (async () => {
              try {
                let all = true;
                for (const id of ids) all = (await withdrawTaskException(id)) && all;
                if (all) toast("Dibatalkan.");
                else toast.error("Sudah lewat 5 menit, tidak bisa dibatalkan.");
              } catch (err) {
                if (err instanceof SaveStillWaitingError) toast.error("Masih dikirim. Coba lagi sebentar.");
                else toast.error("Gagal membatalkan. Coba lagi.");
              }
            })();
          },
        },
      });
      // The shopping list shows the change once the household reloads.
      if (reason === "out_of_stock" && toList && !waiting) void refresh({ silent: true });
      onDone();
      onFiled?.();
    } catch (err) {
      console.error(err);
      const failure = classifySubmitError(err);
      const code = (err as { code?: string } | null)?.code;
      if (code === "23505") toast.error("Sudah ada yang memberi tahu untuk tugas ini.");
      else if (failure !== "other") toast.error("Koneksi terputus. Coba lagi.");
      else toast.error("Gagal mengirim. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (!reason) {
    return (
      <>
        <SheetHeader>
          <SheetTitle className="text-center">Kenapa tidak bisa?</SheetTitle>
          <SheetDescription className="text-center">{subtitle}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {[...(supervisingVisit ? (["supervising_repair"] as const) : []), ...reasonsFor(kind)].map((r) => {
            const Icon = r === "pet_refused" && medicine ? Pill : REASON_ICONS[r];
            return (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 text-left text-[15px] font-medium active:bg-muted"
              >
                <Icon className="size-5 shrink-0 text-zinc-600" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  {staffReasonLabel(r, medicine)}
                  {r === "pet_refused" && medicine && (
                    <span className="text-xs font-normal text-muted-foreground">Admin langsung diberi tahu.</span>
                  )}
                  {r === "other" && (
                    <span className="text-xs font-normal text-muted-foreground">Tulis alasannya</span>
                  )}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setReason(null)}
            aria-label="Kembali ke alasan"
            className="-ml-2 flex size-9 items-center justify-center rounded-full active:bg-muted"
          >
            <ArrowLeft className="size-4" />
          </button>
          <span className="flex-1 text-center">{staffReasonLabel(reason, medicine)}</span>
          <span className="size-9" aria-hidden />
        </SheetTitle>
        <SheetDescription className="text-center">{subtitle}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {reason === "out_of_stock" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-gray-800">Apa yang habis?</p>
            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <Chip key={item.id} on={itemId === item.id} onClick={() => setItemId(itemId === item.id ? null : item.id)}>
                  {item.name}
                </Chip>
              ))}
              <Chip on={itemId === OTHER_ITEM} onClick={() => setItemId(itemId === OTHER_ITEM ? null : OTHER_ITEM)}>
                Barang lain
              </Chip>
            </div>
            {itemId === OTHER_ITEM && (
              <input
                value={otherItem}
                onChange={(e) => setOtherItem(e.target.value.slice(0, 60))}
                placeholder="Tulis nama barang"
                aria-label="Nama barang"
                className="min-h-12 rounded-xl border px-3 text-base"
              />
            )}
            {itemId && (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={toList}
                  onChange={(e) => setToList(e.target.checked)}
                  className="size-5 accent-zinc-900"
                />
                Masukkan ke daftar belanja
              </label>
            )}
          </div>
        )}

        {reason === "pet_refused" && pets.length > 1 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-gray-800">Hewan mana?</p>
            <div className="flex flex-wrap gap-2">
              {pets.map((pet) => (
                <Chip
                  key={pet.entityId}
                  on={petIds.has(pet.entityId)}
                  onClick={() =>
                    setPetIds((current) => {
                      const next = new Set(current);
                      if (next.has(pet.entityId)) next.delete(pet.entityId);
                      else next.add(pet.entityId);
                      return next;
                    })
                  }
                >
                  {pet.entityName}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {reason === "pet_refused" && medicine && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Admin langsung diberi tahu.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="couldnt-note" className="text-sm font-semibold text-gray-800">
            {needsNote ? (
              "Tulis alasannya"
            ) : (
              <>
                Catatan <span className="font-normal text-muted-foreground">(boleh dikosongkan)</span>
              </>
            )}
          </label>
          <Textarea
            id="couldnt-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_LIMIT))}
            rows={3}
            className="text-base"
            placeholder={needsNote ? "Contoh: kamar dikunci" : "Contoh: tinggal sedikit, cukup untuk besok"}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-gray-800">
            Foto <span className="font-normal text-muted-foreground">(boleh dikosongkan)</span>
          </p>
          <PhotoPicker
            offline
            allowGallery
            disabled={busy}
            pathPrefix="couldnt"
            value={photo}
            onChange={setPhoto}
            onBusyChange={setUploading}
            label="Tambah foto"
            busyLabel="Menyimpan foto..."
            errorMessage="Gagal mengunggah foto"
            locale="id"
            className="min-h-12 w-full"
          />
        </div>

        <Button className="min-h-[52px] w-full" disabled={!ready || busy} onClick={send}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Kirim
        </Button>
      </div>
    </>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm",
        on ? "border-zinc-900 bg-zinc-900 text-white" : "bg-card text-gray-800 active:bg-muted"
      )}
    >
      {on && <Check className="size-3.5" aria-hidden />}
      {children}
    </button>
  );
}
